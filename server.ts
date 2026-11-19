import express, { Request, Response } from 'express';
import { existsSync } from 'fs';
import http from 'http';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

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
const DJANGO_HOST = '127.0.0.1';
const DJANGO_PORT = Number(process.env.DJANGO_PORT) || 8000;
const ADMIN_URL_PREFIX = '/' + (process.env.ADMIN_URL_PATH || 'secure-faculty-admin-9f3a').replace(/^\/+|\/+$/g, '');

// ---------------------------------------------------------------------------
// PostgreSQL (Neon Cloud via WebSockets / Port 443)
// ---------------------------------------------------------------------------
if (!process.env.LUGHA_DATABASE_URL) {
  console.error('LUGHA_DATABASE_URL is not set. Add it to your environment / .env file.');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.LUGHA_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

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
// Python API backend (app.py) & Django Tutor/Admin backend (lugha_tutor)
// ---------------------------------------------------------------------------
let pythonProcess: ChildProcess | null = null;
let djangoProcess: ChildProcess | null = null;
let shuttingDown = false;
let pythonRestarts = 0;
let djangoRestarts = 0;

function resolvePythonExecutable(): string {
  for (const base of [ROOT, path.resolve(ROOT, 'lugha_tutor')]) {
    const venvPython = path.resolve(
      base,
      '.venv',
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python',
    );
    if (existsSync(venvPython)) return venvPython;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function startPythonBackend() {
  const scriptPath = path.resolve(ROOT, 'backend', 'app.py');
  if (!existsSync(scriptPath)) {
    console.log('Python backend script not found at path; skipping.');
    return null;
  }

  const child = spawn(resolvePythonExecutable(), [scriptPath], {
    cwd: ROOT,
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
    if (++pythonRestarts > 5) {
      console.error('Python backend keeps failing; giving up.');
      return;
    }
    console.error(`Python backend exited with code ${code}; restart ${pythonRestarts}/5 in 2s...`);
    setTimeout(() => {
      pythonProcess = startPythonBackend();
    }, 2000);
  });

  return child;
}

function startDjangoBackend() {
  const djangoDir = path.resolve(ROOT, 'lugha_tutor');
  if (!existsSync(path.resolve(djangoDir, 'manage.py'))) {
    console.log('Django tutor project not found; skipping.');
    return null;
  }

  const child = spawn(
    resolvePythonExecutable(),
    [
      '-m',
      'gunicorn',
      'config.wsgi:application',
      '--bind',
      `${DJANGO_HOST}:${DJANGO_PORT}`,
      '--workers',
      '1',
      '--threads',
      '4',
    ],
    {
      cwd: djangoDir,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || process.env.LUGHA_DATABASE_URL,
        PYTHONUNBUFFERED: '1',
      },
      stdio: 'inherit',
    },
  );

  child.on('exit', (code) => {
    if (shuttingDown) return;
    if (++djangoRestarts > 5) {
      console.error('Django tutor backend keeps failing; giving up.');
      return;
    }
    console.error(`Django tutor backend exited with code ${code}; restart ${djangoRestarts}/5 in 2s...`);
    setTimeout(() => {
      djangoProcess = startDjangoBackend();
    }, 2000);
  });

  return child;
}

function waitForPort(host: string, port: number, checkPath: string, timeoutMs = 6000): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get({ hostname: host, port, path: checkPath, timeout: 500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - startedAt < timeoutMs) {
          setTimeout(check, 200);
        } else {
          resolve();
        }
      });
    };
    check();
  });
}

function proxyRequest(targetHost: string, targetPort: number, preserveOriginalHost = false) {
  return (req: Request, res: Response) => {
    const headers: http.OutgoingHttpHeaders = {
      ...req.headers,
      host: preserveOriginalHost && req.headers.host ? req.headers.host : `${targetHost}:${targetPort}`,
      'x-forwarded-proto': (req.headers['x-forwarded-proto'] as string) || 'https',
    };

    const proxyReq = http.request(
      {
        hostname: targetHost,
        port: targetPort,
        path: req.originalUrl,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 502);
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        });
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Upstream backend unavailable',
          detail: err.message,
        });
      }
    });

    req.pipe(proxyReq);
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
async function startServer() {
  await verifyDatabase();
  await initializeDatabase();

  pythonProcess = startPythonBackend();
  djangoProcess = startDjangoBackend();

  await Promise.all([
    waitForPort(PYTHON_HOST, PYTHON_PORT, '/api/health'),
    waitForPort(DJANGO_HOST, DJANGO_PORT, '/accounts/login/'),
  ]);

  const cleanup = async () => {
    shuttingDown = true;
    if (pythonProcess && !pythonProcess.killed) pythonProcess.kill('SIGTERM');
    if (djangoProcess && !djangoProcess.killed) djangoProcess.kill('SIGTERM');
    try {
      await pool.end();
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

  app.use('/public', express.static(path.resolve(ROOT, 'public')));

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

  // 1. Main Python API
  app.use('/api', proxyRequest(PYTHON_HOST, PYTHON_PORT, false));

  // 2. Private Django Tutor & Admin routes (not linked on the landing page)
  const djangoProxy = proxyRequest(DJANGO_HOST, DJANGO_PORT, true);
  app.use(['/tutor', '/accounts/login', '/accounts/logout', '/static', ADMIN_URL_PREFIX], djangoProxy);

  // 3. Public Landing Page & Student Frontend (unchanged)
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(ROOT, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
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
    console.log(
      `Gateway listening on http://0.0.0.0:${PORT} -> Python API (${PYTHON_PORT}) & Django Tutor (${DJANGO_PORT})`,
    );
  });
}

startServer();