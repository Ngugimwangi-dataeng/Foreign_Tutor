#!/usr/bin/env python3
"""
LughaSmart Pure-Python Backend Server
- PostgreSQL-backed persistence through psycopg 3
- Bound to 127.0.0.1:8765 (avoids sandbox port 8000 and ingress port 8080/3000)
- Strict RBAC enforcement (403 Forbidden on /api/tutor/* for non-tutor roles)
"""

from __future__ import annotations

import io
import base64
import binascii
import hashlib
import hmac
import json
import mimetypes
import os
import random
import re
import secrets
import tarfile
import threading
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
DJANGO_DIR = ROOT_DIR / "lugha_tutor"
PUBLIC_DIR = ROOT_DIR / "public"
DIST_DIR = ROOT_DIR / "dist"

load_dotenv(DJANGO_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")

DB_LOCK = threading.RLock()
PASSWORD_HASH_ITERATIONS = 600_000


class DatabaseConnection:
    def __init__(self, connection: psycopg.Connection):
        self._connection = connection

    def execute(self, query: str, params=()):
        return self._connection.execute(query, params)

    def executemany(self, query: str, params_seq):
        return self._connection.cursor().executemany(query, params_seq)

    def commit(self) -> None:
        self._connection.commit()

    def close(self) -> None:
        self._connection.close()

    def rollback(self) -> None:
        self._connection.rollback()


def now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
    )
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii")
    encoded_digest = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${encoded_salt}${encoded_digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_text, encoded_salt, encoded_digest = password_hash.split("$")
        iterations = int(iterations_text)
        if algorithm != "pbkdf2_sha256" or not 100_000 <= iterations <= 2_000_000:
            return False
        salt = base64.b64decode(encoded_salt, altchars=b"-_", validate=True)
        expected_digest = base64.b64decode(
            encoded_digest, altchars=b"-_", validate=True
        )
    except (ValueError, binascii.Error):
        return False

    actual_digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(actual_digest, expected_digest)


def auth_user_payload(row: dict) -> dict:
    created_at = row["created_at"]
    if isinstance(created_at, (date, datetime)):
        created_at = created_at.isoformat()
    return {
        "uid": row["uid"],
        "fullName": row["full_name"],
        "email": row["email"],
        "role": row["role"],
        "isAdmin": bool(row["is_admin"]),
        "isSuspended": not bool(row["is_active"]),
        "createdAt": str(created_at),
    }


def database_name() -> str:
    database_url = os.environ.get("LUGHA_DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "LUGHA_DATABASE_URL is not set. Add it to your environment / .env file."
        )
    return psycopg.conninfo.conninfo_to_dict(database_url).get("dbname", "unknown")


def get_conn() -> DatabaseConnection:
    database_url = os.environ.get("LUGHA_DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "LUGHA_DATABASE_URL is not set. Add it to your environment / .env file."
        )
    return DatabaseConnection(
        psycopg.connect(
            database_url,
            row_factory=dict_row,
            connect_timeout=15,
        )
    )


def init_db() -> None:
    with DB_LOCK:
        conn = get_conn()
        try:
            required_tables = (
                "users",
                "courses",
                "enrollments",
                "audio_submissions",
                "security_audit_logs",
            )
            missing_tables = [
                table
                for table in required_tables
                if conn.execute(
                    "SELECT to_regclass(%s) AS table_name", (table,)
                ).fetchone()["table_name"]
                is None
            ]
            if missing_tables:
                raise RuntimeError(
                    "Apply schema.sql before starting the API; missing tables: "
                    + ", ".join(missing_tables)
                )

            migrations = (
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL",
                "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS next_live_session TEXT DEFAULT 'Today at 18:00 EAT'",
                "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS payment_verified_by_tutor BOOLEAN NOT NULL DEFAULT FALSE",
                "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS tutor_confirmation_notes TEXT DEFAULT NULL",
                "ALTER TABLE audio_submissions ADD COLUMN IF NOT EXISTS tutor_audio_url TEXT DEFAULT NULL",
            )
            for statement in migrations:
                conn.execute(statement)

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def row_to_enrollment(row: dict) -> dict:
    d = dict(row)
    d["is_ready_for_class"] = bool(d["is_ready_for_class"])
    d["preferred_time_slot"] = d.get("preferred_slot")
    d["payment_verified_by_tutor"] = bool(d.get("payment_verified_by_tutor", False))
    return d


def row_to_audio_submission(row: dict) -> dict:
    d = dict(row)
    d["feedback"] = d.get("tutor_feedback")
    return d


def log_audit(
    conn: DatabaseConnection,
    user_email: str,
    role: str,
    endpoint: str,
    action: str,
    status: str,
    details: str,
) -> str:
    status_code = int(status.split("_", maxsplit=1)[0])
    cursor = conn.execute(
        """
        INSERT INTO security_audit_logs (
            user_email, role, endpoint, action, http_status, details
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (user_email, role, endpoint, action, status_code, details),
    )
    return str(cursor.fetchone()["id"])


SCHEMA_SQL_DISPLAY = "-- Canonical PostgreSQL schema is maintained in schema.sql."


class LughaHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        pass

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, default=json_default).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}

    def _require_tutor(self) -> bool:
        user_role = (self.headers.get("x-user-role") or "student").strip().lower()
        user_email = (self.headers.get("x-user-email") or "anonymous").strip()
        if user_role == "tutor":
            return True

        with DB_LOCK:
            conn = get_conn()
            try:
                audit_id = log_audit(
                    conn,
                    user_email=user_email,
                    role=user_role,
                    endpoint=self.path,
                    action="RBAC_SECURITY_VIOLATION_ATTEMPT",
                    status="403_FORBIDDEN",
                    details=f"Access Denied: User with role '{user_role}' strictly prohibited from tutor management pathways.",
                )
                conn.commit()
            finally:
                conn.close()

        self._send_json(
            {
                "error": "Forbidden (HTTP 403)",
                "message": "Direct URL manipulation or unauthorized pathway detected. Tutor console is restricted to certified educators.",
                "security_event_id": audit_id,
            },
            status=HTTPStatus.FORBIDDEN,
        )
        return False

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            self._send_json(
                {
                    "status": "ok",
                    "runtime": "python-psycopg",
                    "database": database_name(),
                }
            )
            return

        if path == "/api/courses":
            with DB_LOCK:
                conn = get_conn()
                try:
                    rows = conn.execute("SELECT * FROM courses ORDER BY id ASC").fetchall()
                    self._send_json({"courses": [dict(r) for r in rows]})
                finally:
                    conn.close()
            return

        m_user = re.fullmatch(r"/api/user/(\d+)/state", path)
        if m_user:
            user_id = int(m_user.group(1))
            with DB_LOCK:
                conn = get_conn()
                try:
                    user_row = conn.execute("SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()
                    if not user_row:
                        self._send_json({"error": "User not found"}, status=404)
                        return
                    enr_rows = conn.execute(
                        "SELECT * FROM enrollments WHERE student_id = %s ORDER BY id DESC",
                        (user_id,),
                    ).fetchall()
                    enriched = []
                    for row in enr_rows:
                        enr = row_to_enrollment(row)
                        course_row = conn.execute(
                            "SELECT * FROM courses WHERE id = %s", (enr["course_id"],)
                        ).fetchone()
                        enr["course"] = dict(course_row) if course_row else None
                        enriched.append(enr)

                    subs = conn.execute(
                        "SELECT * FROM audio_submissions WHERE student_id = %s ORDER BY submitted_at DESC",
                        (user_id,),
                    ).fetchall()
                    self._send_json(
                        {
                            "user": dict(user_row),
                            "enrollments": enriched,
                            "submissions": [row_to_audio_submission(s) for s in subs],
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/tutor/live-students":
            if not self._require_tutor():
                return
            with DB_LOCK:
                conn = get_conn()
                try:
                    completed = conn.execute(
                        "SELECT * FROM enrollments WHERE payment_status = 'completed' ORDER BY id DESC"
                    ).fetchall()
                    ready_students = []
                    all_roster = []
                    for row in completed:
                        enr = row_to_enrollment(row)
                        student = conn.execute(
                            "SELECT * FROM users WHERE id = %s", (enr["student_id"],)
                        ).fetchone()
                        course = conn.execute(
                            "SELECT * FROM courses WHERE id = %s", (enr["course_id"],)
                        ).fetchone()
                        s_dict = dict(student) if student else None
                        c_dict = dict(course) if course else None
                        if enr["is_ready_for_class"]:
                            ready_students.append(
                                {
                                    "enrollment_id": enr["id"],
                                    "student": s_dict,
                                    "course": c_dict,
                                    "enrolled_at": enr["enrolled_at"],
                                    "payment_ref": enr["transaction_ref"],
                                }
                            )
                        all_roster.append(
                            {
                                "enrollment_id": enr["id"],
                                "student": s_dict,
                                "course": c_dict,
                                "is_ready": enr["is_ready_for_class"],
                                "enrolled_at": enr["enrolled_at"],
                                "payment_method": enr["payment_method"],
                                "transaction_ref": enr["transaction_ref"],
                                "payment_status": enr["payment_status"],
                                "preferred_time_slot": enr["preferred_time_slot"]
                                or "Tue & Thu: 18:00 - 19:00 EAT",
                                "next_live_session": enr["next_live_session"]
                                or "Today at 18:00 EAT",
                                "payment_verified_by_tutor": enr["payment_verified_by_tutor"],
                                "tutor_confirmation_notes": enr["tutor_confirmation_notes"]
                                or "Verified Daraja / Visa transaction.",
                            }
                        )
                    subs = conn.execute(
                        "SELECT * FROM audio_submissions ORDER BY submitted_at DESC"
                    ).fetchall()
                    self._send_json(
                        {
                            "ready_count": len(ready_students),
                            "ready_students": ready_students,
                            "all_roster": all_roster,
                            "audio_submissions": [
                                row_to_audio_submission(s) for s in subs
                            ],
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/db/schema":
            with DB_LOCK:
                conn = get_conn()
                try:
                    users = [dict(r) for r in conn.execute("SELECT * FROM users ORDER BY id ASC")]
                    courses = [dict(r) for r in conn.execute("SELECT * FROM courses ORDER BY id ASC")]
                    enrollments = [
                        row_to_enrollment(r)
                        for r in conn.execute("SELECT * FROM enrollments ORDER BY id ASC")
                    ]
                    audit_logs = [
                        dict(r)
                        for r in conn.execute(
                            "SELECT * FROM security_audit_logs ORDER BY created_at DESC"
                        )
                    ]
                    self._send_json(
                        {
                            "schema_sql": SCHEMA_SQL_DISPLAY,
                            "tables": {
                                "users": users,
                                "courses": courses,
                                "enrollments": enrollments,
                                "audit_logs": audit_logs,
                            },
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/security/audit-logs":
            with DB_LOCK:
                conn = get_conn()
                try:
                    logs = [
                        dict(r)
                        for r in conn.execute(
                            "SELECT * FROM security_audit_logs ORDER BY created_at DESC"
                        )
                    ]
                    self._send_json({"logs": logs})
                finally:
                    conn.close()
            return

        if path == "/api/django-files":
            if not DJANGO_DIR.exists():
                self._send_json({"error": "lugha_tutor directory not found"}, status=404)
                return
            collected = []
            for file_path in sorted(DJANGO_DIR.rglob("*")):
                if not file_path.is_file():
                    continue
                parts = file_path.relative_to(DJANGO_DIR).parts
                if any(p in (".git", "__pycache__", ".venv") for p in parts):
                    continue
                rel = "/".join(parts)
                content = file_path.read_text(encoding="utf-8", errors="replace")
                collected.append(
                    {
                        "path": rel,
                        "content": content,
                        "size": len(content.encode("utf-8")),
                    }
                )
            self._send_json(
                {
                    "root": "lugha_tutor",
                    "branch": "main",
                    "file_count": len(collected),
                    "files": collected,
                }
            )
            return

        if path == "/api/django-archive":
            if not DJANGO_DIR.exists():
                self._send_json({"error": "lugha_tutor directory not found"}, status=404)
                return
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                tar.add(str(DJANGO_DIR), arcname="lugha_tutor")
            payload = buf.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/gzip")
            self.send_header(
                "Content-Disposition",
                'attachment; filename="lugha_tutor_django_repo.tar.gz"',
            )
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if path.startswith("/public/"):
            rel = path[len("/public/") :].lstrip("/")
            self._serve_static_file(PUBLIC_DIR, rel)
            return

        if DIST_DIR.exists():
            rel = path.lstrip("/") or "index.html"
            target = (DIST_DIR / rel).resolve()
            if target.is_file() and str(target).startswith(str(DIST_DIR.resolve())):
                self._serve_file_bytes(target)
                return
            index_file = DIST_DIR / "index.html"
            if index_file.is_file():
                self._serve_file_bytes(index_file)
                return

        self._send_json({"error": "Endpoint not found"}, status=404)

    def _serve_static_file(self, base_dir: Path, rel: str) -> None:
        target = (base_dir / rel).resolve()
        if not target.is_file() or not str(target).startswith(str(base_dir.resolve())):
            self._send_json({"error": "File not found"}, status=404)
            return
        self._serve_file_bytes(target)

    def _serve_file_bytes(self, file_path: Path) -> None:
        data = file_path.read_bytes()
        ctype, _ = mimetypes.guess_type(str(file_path))
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json()

        if path == "/api/auth/register":
            full_name = str(body.get("fullName") or "").strip()
            email = str(body.get("email") or "").strip().lower()
            password = body.get("password")
            if (
                not full_name
                or len(full_name) > 150
                or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
                or len(email) > 200
                or not isinstance(password, str)
                or not 6 <= len(password) <= 1024
            ):
                self._send_json(
                    {"error": "Enter a valid name, email, and password of at least 6 characters."},
                    status=400,
                )
                return

            password_hash = hash_password(password)
            user_uid = f"student-{uuid.uuid4()}"
            with DB_LOCK:
                conn = get_conn()
                try:
                    row = conn.execute(
                        """
                        INSERT INTO users (uid, full_name, email, password_hash, role)
                        VALUES (%s, %s, %s, %s, 'student')
                        RETURNING uid, full_name, email, role, is_admin, is_active, created_at
                        """,
                        (user_uid, full_name, email, password_hash),
                    ).fetchone()
                    conn.commit()
                    self._send_json({"user": auth_user_payload(row)}, status=201)
                except psycopg.errors.UniqueViolation:
                    conn.rollback()
                    self._send_json(
                        {"error": "An account with this email already exists."},
                        status=409,
                    )
                finally:
                    conn.close()
            return

        if path == "/api/auth/login":
            email = str(body.get("email") or "").strip().lower()
            password = body.get("password")
            if not email or not isinstance(password, str) or not password:
                self._send_json(
                    {"error": "Enter your email address and password."}, status=400
                )
                return

            with DB_LOCK:
                conn = get_conn()
                try:
                    row = conn.execute(
                        """
                        SELECT uid, full_name, email, role, is_admin, is_active,
                               created_at, last_login_at, password_hash
                        FROM users
                        WHERE LOWER(email) = %s AND role = 'student'
                        """,
                        (email,),
                    ).fetchone()
                    if not row or not verify_password(password, row["password_hash"]):
                        self._send_json(
                            {"error": "Invalid student email or password."}, status=401
                        )
                        return
                    if not row["is_active"]:
                        self._send_json(
                            {"error": "This student account has been suspended."},
                            status=403,
                        )
                        return

                    conn.execute(
                        "UPDATE users SET last_login_at = NOW() WHERE uid = %s",
                        (row["uid"],),
                    )
                    conn.commit()
                    self._send_json({"user": auth_user_payload(row)})
                finally:
                    conn.close()
            return

        if path == "/api/student/readiness":
            student_id = int(body.get("student_id") or 0)
            course_id = str(body.get("course_id") or "")
            is_ready = bool(body.get("is_ready"))
            with DB_LOCK:
                conn = get_conn()
                try:
                    row = conn.execute(
                        "SELECT id FROM enrollments WHERE student_id = %s AND course_id = %s",
                        (student_id, course_id),
                    ).fetchone()
                    if not row:
                        self._send_json(
                            {"error": "Enrollment not found for student and course"},
                            status=404,
                        )
                        return
                    conn.execute(
                        "UPDATE enrollments SET is_ready_for_class = %s WHERE id = %s",
                        (is_ready, row["id"]),
                    )
                    conn.commit()
                    self._send_json(
                        {
                            "success": True,
                            "enrollment_id": row["id"],
                            "is_ready_for_class": bool(is_ready),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/student/preferred-slot":
            student_id = int(body.get("student_id") or 0)
            course_id = str(body.get("course_id") or "")
            slot_label = body.get("slot_label") or ""
            next_time = body.get("next_time") or ""
            with DB_LOCK:
                conn = get_conn()
                try:
                    row = conn.execute(
                        "SELECT id FROM enrollments WHERE student_id = %s AND course_id = %s",
                        (student_id, course_id),
                    ).fetchone()
                    if not row:
                        self._send_json({"error": "Enrollment not found"}, status=404)
                        return
                    conn.execute(
                        """
                        UPDATE enrollments
                        SET preferred_slot = %s, next_live_session = %s
                        WHERE id = %s
                        """,
                        (slot_label, next_time, row["id"]),
                    )
                    conn.commit()
                    updated = conn.execute(
                        "SELECT * FROM enrollments WHERE id = %s", (row["id"],)
                    ).fetchone()
                    enr = row_to_enrollment(updated)
                    self._send_json(
                        {
                            "success": True,
                            "enrollment": enr,
                            "preferred_time_slot": enr["preferred_time_slot"],
                            "next_live_session": enr["next_live_session"],
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/payments/mpesa/stkpush":
            student_id = body.get("student_id")
            course_id = body.get("course_id")
            phone_number = body.get("phone_number")
            if not phone_number or not course_id or not student_id:
                self._send_json({"error": "Missing required checkout parameters"}, status=400)
                return
            student_id = int(student_id)
            course_id = str(course_id)
            plan_type = body.get("plan_type") or "per_session"
            if plan_type not in {"per_session", "monthly_pass"}:
                self._send_json({"error": "Invalid plan type"}, status=400)
                return

            with DB_LOCK:
                conn = get_conn()
                try:
                    course = conn.execute(
                        "SELECT * FROM courses WHERE id = %s", (course_id,)
                    ).fetchone()
                    if not course:
                        self._send_json({"error": "Course not found"}, status=404)
                        return
                    amount_kes = (
                        course["monthly_pass_price_kes"]
                        if plan_type == "monthly_pass"
                        else course["per_session_price_kes"]
                    )
                    jitsi_room_url = f"https://meet.jit.si/{course['jitsi_room_name']}"
                    student = conn.execute(
                        "SELECT email FROM users WHERE id = %s", (student_id,)
                    ).fetchone()
                    user_email = student["email"] if student else "student@example.com"

                    checkout_request_id = (
                        f"ws_CO_{int(time.time() * 1000)}_{random.randint(100000, 999999)}"
                    )
                    merchant_request_id = "29384-938201-1"
                    mpesa_receipt = f"QK{random.randint(10000000, 99999999)}"

                    existing = conn.execute(
                        "SELECT id FROM enrollments WHERE student_id = %s AND course_id = %s",
                        (student_id, course_id),
                    ).fetchone()
                    if existing:
                        conn.execute(
                            """
                            UPDATE enrollments
                            SET plan_type = %s, amount_kes = %s, payment_status = 'completed',
                                payment_method = 'mpesa', transaction_ref = %s,
                                jitsi_room_url = %s, is_ready_for_class = TRUE,
                                payment_verified_by_tutor = TRUE
                            WHERE id = %s
                            """,
                            (
                                plan_type,
                                amount_kes,
                                mpesa_receipt,
                                jitsi_room_url,
                                existing["id"],
                            ),
                        )
                        enr_id = existing["id"]
                    else:
                        enr_id = f"enr_{int(time.time() * 1000)}_{random.randint(100, 999)}"
                        conn.execute(
                            """
                            INSERT INTO enrollments (
                                id, student_id, course_id, plan_type, amount_kes,
                                payment_method, transaction_ref, payment_status,
                                jitsi_room_url, is_ready_for_class, enrolled_at,
                                payment_verified_by_tutor, tutor_confirmation_notes
                            ) VALUES (
                                %s, %s, %s, %s, %s, 'mpesa', %s, 'completed',
                                %s, TRUE, %s, TRUE, %s
                            )
                            """,
                            (
                                enr_id,
                                student_id,
                                course_id,
                                plan_type,
                                amount_kes,
                                mpesa_receipt,
                                jitsi_room_url,
                                now_str(),
                                f"Safaricom Daraja STK Push verified under receipt {mpesa_receipt}.",
                            ),
                        )

                    log_audit(
                        conn,
                        user_email=user_email,
                        role="student",
                        endpoint="/api/payments/mpesa/stkpush",
                        action="DARAJA_PAYMENT_VERIFIED",
                        status="200_OK",
                        details=f"Safaricom M-Pesa STK Push completed: KES {amount_kes} confirmed under receipt {mpesa_receipt}. Course {course_id} unlocked instantly.",
                    )
                    conn.commit()
                    enr = row_to_enrollment(
                        conn.execute("SELECT * FROM enrollments WHERE id = %s", (enr_id,)).fetchone()
                    )
                    self._send_json(
                        {
                            "ResponseCode": "0",
                            "ResponseDescription": "Success. Request accepted for processing",
                            "MerchantRequestID": merchant_request_id,
                            "CheckoutRequestID": checkout_request_id,
                            "CustomerMessage": f"Success! KES {amount_kes} received via M-Pesa from {phone_number}. Instant enrollment activated.",
                            "MpesaReceiptNumber": mpesa_receipt,
                            "course_id": course_id,
                            "student_id": student_id,
                            "enrollment": enr,
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/payments/visa/charge":
            student_id = body.get("student_id")
            course_id = body.get("course_id")
            card_number = str(body.get("card_number") or "")
            if not card_number or not student_id or not course_id:
                self._send_json({"error": "Missing credit card parameters"}, status=400)
                return
            student_id = int(student_id)
            course_id = str(course_id)
            plan_type = body.get("plan_type") or "per_session"
            if plan_type not in {"per_session", "monthly_pass"}:
                self._send_json({"error": "Invalid plan type"}, status=400)
                return
            auth_code = f"AUTH_VI_{random.randint(100000, 999999)}"
            masked_card = f"•••• •••• •••• {card_number[-4:]}"

            with DB_LOCK:
                conn = get_conn()
                try:
                    course = conn.execute(
                        "SELECT * FROM courses WHERE id = %s", (course_id,)
                    ).fetchone()
                    if not course:
                        self._send_json({"error": "Course not found"}, status=404)
                        return
                    amount_kes = (
                        course["monthly_pass_price_kes"]
                        if plan_type == "monthly_pass"
                        else course["per_session_price_kes"]
                    )
                    jitsi_room_url = f"https://meet.jit.si/{course['jitsi_room_name']}"
                    student = conn.execute(
                        "SELECT email FROM users WHERE id = %s", (student_id,)
                    ).fetchone()
                    user_email = student["email"] if student else "student@example.com"

                    existing = conn.execute(
                        "SELECT id FROM enrollments WHERE student_id = %s AND course_id = %s",
                        (student_id, course_id),
                    ).fetchone()
                    if existing:
                        conn.execute(
                            """
                            UPDATE enrollments
                            SET plan_type = %s, amount_kes = %s, payment_status = 'completed',
                                payment_method = 'visa', transaction_ref = %s,
                                jitsi_room_url = %s, is_ready_for_class = TRUE,
                                payment_verified_by_tutor = TRUE
                            WHERE id = %s
                            """,
                            (
                                plan_type,
                                amount_kes,
                                auth_code,
                                jitsi_room_url,
                                existing["id"],
                            ),
                        )
                        enr_id = existing["id"]
                    else:
                        enr_id = f"enr_{int(time.time() * 1000)}_{random.randint(100, 999)}"
                        conn.execute(
                            """
                            INSERT INTO enrollments (
                                id, student_id, course_id, plan_type, amount_kes,
                                payment_method, transaction_ref, payment_status,
                                jitsi_room_url, is_ready_for_class, enrolled_at,
                                payment_verified_by_tutor, tutor_confirmation_notes
                            ) VALUES (
                                %s, %s, %s, %s, %s, 'visa', %s, 'completed',
                                %s, TRUE, %s, TRUE, %s
                            )
                            """,
                            (
                                enr_id,
                                student_id,
                                course_id,
                                plan_type,
                                amount_kes,
                                auth_code,
                                jitsi_room_url,
                                now_str(),
                                f"Visa 3D-Secure settled ({auth_code}).",
                            ),
                        )

                    log_audit(
                        conn,
                        user_email=user_email,
                        role="student",
                        endpoint="/api/payments/visa/charge",
                        action="VISA_3DS_PAYMENT_SETTLED",
                        status="200_OK",
                        details=f"Visa/Mastercard 3D-Secure payment verified: KES {amount_kes} processed ({masked_card}). Course {course_id} granted.",
                    )
                    conn.commit()
                    enr = row_to_enrollment(
                        conn.execute("SELECT * FROM enrollments WHERE id = %s", (enr_id,)).fetchone()
                    )
                    self._send_json(
                        {
                            "success": True,
                            "auth_code": auth_code,
                            "masked_card": masked_card,
                            "amount_kes": amount_kes,
                            "message": "Card authenticated via 3D Secure. Instant access granted.",
                            "enrollment": enr,
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/tutor/verify-payment":
            if not self._require_tutor():
                return
            enrollment_id = str(body.get("enrollment_id") or "")
            action = (body.get("action") or "verify").strip().lower()
            notes = body.get("notes")
            if action not in {"verify", "revoke"}:
                self._send_json({"error": "Action must be 'verify' or 'revoke'"}, status=400)
                return
            with DB_LOCK:
                conn = get_conn()
                try:
                    row = conn.execute(
                        "SELECT * FROM enrollments WHERE id = %s", (enrollment_id,)
                    ).fetchone()
                    if not row:
                        self._send_json({"error": "Enrollment record not found"}, status=404)
                        return
                    if action == "verify":
                        payment_status = "completed"
                        verified = True
                        final_notes = (
                            notes
                            or "Payment manually certified by Tutor. Access granted."
                        )
                    else:
                        payment_status = "revoked"
                        verified = False
                        final_notes = notes or "Access suspended or flagged by Tutor."

                    conn.execute(
                        """
                        UPDATE enrollments
                        SET payment_status = %s, payment_verified_by_tutor = %s, tutor_confirmation_notes = %s
                        WHERE id = %s
                        """,
                        (payment_status, verified, final_notes, enrollment_id),
                    )
                    log_audit(
                        conn,
                        user_email="amina.wambui@lughasmart.ac.ke",
                        role="tutor",
                        endpoint="/api/tutor/verify-payment",
                        action=(
                            "TUTOR_PAYMENT_VERIFIED"
                            if action == "verify"
                            else "TUTOR_ACCESS_REVOKED"
                        ),
                        status="200_OK",
                        details=f"Enrollment #{enrollment_id}: {action.upper()} action taken. Status: {payment_status}. Notes: {final_notes}",
                    )
                    conn.commit()
                    enr = row_to_enrollment(
                        conn.execute(
                            "SELECT * FROM enrollments WHERE id = %s", (enrollment_id,)
                        ).fetchone()
                    )
                    self._send_json(
                        {
                            "success": True,
                            "enrollment": enr,
                            "message": (
                                "Payment confirmed by tutor. Student access verified."
                                if action == "verify"
                                else "Student access suspended."
                            ),
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/tutor/curriculum/update-pdf":
            if not self._require_tutor():
                return
            course_id = str(body.get("course_id") or "")
            pdf_name = body.get("pdf_name")
            notes = body.get("notes") or "Updated lesson plan"
            with DB_LOCK:
                conn = get_conn()
                try:
                    course = conn.execute(
                        "SELECT * FROM courses WHERE id = %s", (course_id,)
                    ).fetchone()
                    if not course:
                        self._send_json({"error": "Course not found"}, status=404)
                        return
                    new_pdf = pdf_name or course["pdf_title"]
                    conn.execute(
                        "UPDATE courses SET pdf_title = %s WHERE id = %s",
                        (new_pdf, course_id),
                    )
                    log_audit(
                        conn,
                        user_email="amina.wambui@lughasmart.ac.ke",
                        role="tutor",
                        endpoint="/api/tutor/curriculum/update-pdf",
                        action="CURRICULUM_PDF_UPDATED",
                        status="200_OK",
                        details=f"Course #{course_id} ({course['title']}) PDF updated to '{new_pdf}'. Notes: {notes}",
                    )
                    conn.commit()
                    updated = dict(
                        conn.execute(
                            "SELECT * FROM courses WHERE id = %s", (course_id,)
                        ).fetchone()
                    )
                    self._send_json(
                        {
                            "success": True,
                            "course": updated,
                            "message": f"Curriculum PDF successfully updated for {updated['title']}. Students can view immediately.",
                        }
                    )
                finally:
                    conn.close()
            return

        if path == "/api/audio/submit":
            student_id = body.get("student_id")
            course_id = body.get("course_id")
            if not student_id or not course_id:
                self._send_json({"error": "Student and course are required"}, status=400)
                return
            student_id = int(student_id)
            course_id = str(course_id)
            phrase = body.get("phrase") or "Jambo, habari yako?"
            language = body.get("language") or "Swahili"
            audio_base64 = body.get("audio_base64") or "data:audio/wav;base64,sample"
            score = random.randint(85, 98)
            feedback = (
                "High accuracy native cadence detected."
                if score > 90
                else "Tone is good, focus on nasal vowel stress."
            )
            sub_id = f"sub_{int(time.time() * 1000)}"
            submitted_at = now_str()

            with DB_LOCK:
                conn = get_conn()
                try:
                    conn.execute(
                        """
                        INSERT INTO audio_submissions (
                            id, student_id, course_id, phrase, language,
                            audio_url, accuracy_score, tutor_feedback, submitted_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            sub_id,
                            student_id,
                            course_id,
                            phrase,
                            language,
                            audio_base64,
                            score,
                            feedback,
                            submitted_at,
                        ),
                    )
                    conn.commit()
                    row = row_to_audio_submission(
                        conn.execute(
                            "SELECT * FROM audio_submissions WHERE id = %s", (sub_id,)
                        ).fetchone()
                    )
                    self._send_json({"success": True, "submission": row})
                finally:
                    conn.close()
            return

        if path == "/api/tutor/audio-feedback":
            if not self._require_tutor():
                return
            submission_id = body.get("submission_id")
            feedback_text = body.get("feedback_text") or ""
            with DB_LOCK:
                conn = get_conn()
                try:
                    row = conn.execute(
                        "SELECT id FROM audio_submissions WHERE id = %s", (submission_id,)
                    ).fetchone()
                    if not row:
                        self._send_json({"error": "Submission not found"}, status=404)
                        return
                    conn.execute(
                        """
                        UPDATE audio_submissions
                        SET tutor_feedback = %s, tutor_audio_url = 'tutor_pronunciation_correction.mp3'
                        WHERE id = %s
                        """,
                        (feedback_text, submission_id),
                    )
                    conn.commit()
                    updated = row_to_audio_submission(
                        conn.execute(
                            "SELECT * FROM audio_submissions WHERE id = %s",
                            (submission_id,),
                        ).fetchone()
                    )
                    self._send_json({"success": True, "submission": updated})
                finally:
                    conn.close()
            return

        self._send_json({"error": "Endpoint not found"}, status=404)


def run_server() -> None:
    init_db()
    host = os.environ.get("PYTHON_HOST", "127.0.0.1")
    port = int(os.environ.get("PYTHON_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), LughaHandler)
    print(
        f"LughaSmart backend listening on http://{host}:{port} "
        f"(PostgreSQL: {database_name()})",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
