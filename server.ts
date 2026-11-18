import express, { Request, Response } from 'express';
import { existsSync } from 'fs';
import http from 'http';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon serverless driver to use WebSockets (Port 443) instead of TCP Port 5432
neonConfig.webSocketConstructor = ws;

// Universal fallback supporting both ESM (tsx dev) and CommonJS (dist/server.cjs production)
const __filename = typeof __filename === 'string' ? __filename : fileURLToPath(import.meta.url);
const __dirname = typeof __dirname === 'string' ? __dirname : path.dirname(__filename);

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 3000;

for (const envFile of [
  path.resolve(ROOT, 'lugha_tutor', '.env'),
  path.resolve(ROOT, '.env'),
]) {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

const PYTHON_HOST = '127.0.0.1';
const PYTHON_PORT = Number(process.env.PYTHON_PORT) || 8765;

// ---------------------------------------------------------------------------
// PostgreSQL (Neon Cloud via WebSockets / Port 443)
// ---------------------------------------------------------------------------
if (!process.env.LUGHA_DATABASE_URL) {
  console.error('LUGHA_DATABASE_URL is not set. Add it to your environment / .env file.');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.LUGHA_DATABASE_URL,
  max: 10,                        // max clients in the pool
  idleTimeoutMillis: 30000,      // close idle clients after 30s
  connectionTimeoutMillis: 15000, // allow 15s for Neon cold start
});

// Prevents the process from crashing when an idle client errors out
pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

async function verifyDatabase() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  console.log(`PostgreSQL (Neon) connected at ${rows[0].now}`);
}

async function initializeDatabase() {
  const { rows } = await pool.query(`
    SELECT
      to_regclass('users') IS NOT NULL AS users,
      to_regclass('courses') IS NOT NULL AS courses,
      to_regclass('enrollments') IS NOT NULL AS enrollments,
      to_regclass('audio_submissions') IS NOT NULL AS audio_submissions,
      to_regclass('security_audit_logs') IS NOT NULL AS security_audit_logs
  `);
  const requiredTables = [
    'users',
    'courses',
    'enrollments',
    'audio_submissions',
    'security_audit_logs',
  ] as const;
  const missingTables = requiredTables.filter((table) => !rows[0][table]);
  if (missingTables.length > 0) {
    throw new Error(
      `Apply schema.sql before starting the API; missing tables: ${missingTables.join(', ')}`,
    );
  }
  console.log('Canonical PostgreSQL schema verified.');
}

// ---------------------------------------------------------------------------
// Python backend management
// ---------------------------------------------------------------------------
let pythonProcess: ChildProcess | null = null;
let shuttingDown = false;
let restarts = 0;

function startPythonBackend() {
  const scriptPath = path.resolve(__dirname, 'backend', 'app.py');
  
  // If the Python script doesn't exist (e.g. lightweight Node-only deployment on Render), skip spawning safely
  if (!existsSync(scriptPath)) {
    console.log('Python backend script not found at path; running in Node-only gateway mode.');
    return null;
  }

  const venvPythonPath = path.resolve(
    __dirname,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python'
  );
  const pythonExecutable = existsSync(venvPythonPath)
    ? venvPythonPath
    : process.platform === 'win32' ? 'python' : 'python3';
    
  const child = spawn(pythonExecutable, [scriptPath], {
    cwd: __dirname,
    env: {
      ...process.env, 
      PYTHON_HOST,
      PYTHON_PORT: String(PYTHON_PORT),
      PYTHONUNBUFFERED: '1',
    },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (shuttingDown) return;
    if (++restarts > 5) {
      console.error('Python backend keeps failing; giving up.');
      return;
    }
    console.error(`Python backend exited with code ${code}; restart ${restarts}/5 in 2s...`);
    setTimeout(() => {
      pythonProcess = startPythonBackend();
    }, 2000);
  });

  return child;
}

function waitForPythonBackend(timeoutMs = 3000): Promise<void> {
  const scriptPath = path.resolve(__dirname, 'backend', 'app.py');
  if (!existsSync(scriptPath)) {
    return Promise.resolve(); // Skip waiting if no Python backend is configured
  }

  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(
        { hostname: PYTHON_HOST, port: PYTHON_PORT, path: '/api/health', timeout: 500 },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else if (Date.now() - startedAt < timeoutMs) {
            setTimeout(check, 150);
          } else {
            resolve();
          }
        }
      );
      req.on('error', () => {
        if (Date.now() - startedAt < timeoutMs) {
          setTimeout(check, 150);
        } else {
          resolve();
        }
      });
    };
    check();
  });
}

function proxyToPython(req: Request, res: Response) {
  const proxyReq = http.request(
    {
      hostname: PYTHON_HOST,
      port: PYTHON_PORT,
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${PYTHON_HOST}:${PYTHON_PORT}`,
      },
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 502);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Python backend unavailable',
        detail: err.message,
      });
    }
  });

  req.pipe(proxyReq);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
async function startServer() {
  await verifyDatabase();
  await initializeDatabase();

  pythonProcess = startPythonBackend();
  await waitForPythonBackend();

  const cleanup = async () => {
    shuttingDown = true;
    if (pythonProcess && !pythonProcess.killed) {
      pythonProcess.kill('SIGTERM');
    }
    try {
      await pool.end(); // drain and close all DB connections
    } catch (err) {
      console.error('Error closing PostgreSQL pool:', (err as Error).message);
    }
  };
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  const app = express();

  // Serve attached proposal PDF & static public files
  app.use('/public', express.static(path.resolve(__dirname, 'public')));

  // Node-side database health check (handled here, before the Python proxy)
  app.get('/api/db-health', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT NOW() AS now');
      res.json({ status: 'ok', time: rows[0].now });
    } catch (err) {
      res.status(503).json({ status: 'error', detail: (err as Error).message });
    }
  });

  app.get('/api/courses', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM courses ORDER BY id ASC');
      res.json({ courses: result.rows });
    } catch (err) {
      console.error('Database error fetching courses:', (err as Error).message);
      res.status(500).json({ error: 'Database error fetching courses' });
    }
  });

  // Forward all other /api/* traffic to the pure-Python backend server
  app.use('/api', proxyToPython);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Frontend gateway listening on http://0.0.0.0:${PORT} -> Python backend on ${PYTHON_HOST}:${PYTHON_PORT}`);
  });
}

startServer();