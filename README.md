<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/016ef33d-5345-4d01-a496-ab2cd18c3e25

## Run Locally

**Prerequisites:** Node.js, Python 3, and PostgreSQL


1. Install dependencies:
   `npm install`
2. Configure PostgreSQL in `lugha_tutor/.env` using [`lugha_tutor/.env.example`](lugha_tutor/.env.example). Set `LUGHA_DATABASE_URL` for the API and `DATABASE_URL` for Django; they may point to the same PostgreSQL database or separate databases.
3. Install the main API's Python dependencies:
   `python3 -m pip install -r backend/requirements.txt`
4. Run the app:
   `npm run dev`

The Node gateway and Python API use the PostgreSQL database configured by `LUGHA_DATABASE_URL`. Apply `schema.sql` to that database before starting the API; startup verifies the canonical tables and does not create the old legacy schema. Django uses `DATABASE_URL` and can use a separate database. The old `backend/lughasmart.db` remains a backup; its legacy schema is incompatible with `schema.sql`, so the SQLite importer intentionally refuses to copy it rather than risk partial or misleading records.

## Applying `schema.sql`

Set `LUGHA_DATABASE_URL` to the API PostgreSQL connection URL, then apply `schema.sql` to that database:

```sh
psql "$LUGHA_DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
```

Run that command from a shell where `LUGHA_DATABASE_URL` is set. `.env` files are loaded by the app and ignored by Git; do not source them as shell scripts or put credentials in `schema.sql`.
