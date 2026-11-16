# LughaSmart — Kenyan Local Languages Tutoring Platform (Django + PostgreSQL)

Production-ready Django 5 + PostgreSQL platform for teaching Kenyan national and indigenous languages (Kiswahili, Gĩkũyũ, Dholuo, Maa, Kalenjin, Kikamba) with strict RBAC, Paystack (M-Pesa + Visa in KES) payment-gated enrollment, piracy-protected media streaming, and live/catch-up sessions.

## Key Security & Architectural Highlights

- **Strict Role Separation**: Students (`is_staff=False`) are blocked from `/tutor/*` (`403 Forbidden`) via `@tutor_required` and cannot access the obscured admin path (`ADMIN_URL_PATH`). Public registration always creates non-staff student accounts.
- **Payment Before Enrollment (M-Pesa + Visa via Paystack)**: Uses Paystack (`card` + `mobile_money` channels in `KES`) with both server-side verification callback and cryptographically verified HMAC-SHA512 webhook (`x-paystack-signature`). Enrollment activation is wrapped in `transaction.atomic()` with row-level locking (`select_for_update()`).
- **Piracy-Protected Audio & PDFs**: Stored via `PrivateMediaStorage` in `private_media/` outside `STATIC_ROOT` / `MEDIA_ROOT`. Files are streamed only through `/media/protected/<lesson_id>/<asset_type>/` after verifying a `completed` `Enrollment` in PostgreSQL (or tutor `is_staff=True`), with HTTP `Range` support for audio scrubbing and `Cache-Control: private, no-store`.
- **Live Sessions + Missed-Class Catch-Up**: Tutors can schedule Zoom/Google Meet/Jitsi links, toggle a one-click **Live Now** switch, and upload MP3/WAV pronunciation audio and PDF notes per lesson.

## PostgreSQL Setup

Both application backends use PostgreSQL and do not support SQLite. They use separate databases because their table layouts differ:

- Django: `lugha_tutor_db` (`DB_NAME`)
- Main API: `lughasmart_db` (`LUGHA_DB_NAME`)

Create these databases and a role with access to them, then set the connection values in `lugha_tutor/.env` (see `.env.example`). For a local PostgreSQL role named `postgres`, for example:

```sql
CREATE DATABASE lugha_tutor_db;
CREATE DATABASE lughasmart_db;
```

Install the API driver's dependency with `python3 -m pip install -r backend/requirements.txt` from the project root.

## Start the Django App

```bash
cd lugha_tutor
chmod +x start.sh
./start.sh
```

`start.sh` automatically creates `.venv`, installs dependencies, runs Django migrations, seeds 6 Kenyan language courses + demo accounts, and starts the server at `http://127.0.0.1:8000`:
- **Tutor Account (`is_staff=True`)**: `tutor` / `LughaTutor2026!`
- **Student Account (`is_staff=False`)**: `student` / `LughaStudent2026!`

## Existing SQLite Data

The old API database at `backend/lughasmart.db` is no longer used at runtime. The API now expects the canonical `schema.sql` tables in its `LUGHA_DATABASE_URL` database. The legacy SQLite importer is incompatible with that schema and deliberately refuses to copy records; keep the SQLite file as a backup until an explicit field mapping is designed.

If you previously ran Django with SQLite, export its data before switching settings and load that export after `python manage.py migrate`; do not point the PostgreSQL configuration at the SQLite file.

## Push to GitHub

The `origin` remote is already configured to `https://github.com/Ngugimwangi-dataeng/Foreign_Tutor.git` on branch `main`:

```bash
cd lugha_tutor
git push -u origin main
```
