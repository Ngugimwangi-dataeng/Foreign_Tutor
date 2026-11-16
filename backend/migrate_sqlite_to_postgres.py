#!/usr/bin/env python3
"""Reject the obsolete legacy-schema SQLite importer without changing data."""

import os
from pathlib import Path

SQLITE_PATH = Path(
    os.environ.get(
        "LUGHA_SQLITE_PATH",
        str(Path(__file__).resolve().parent / "lughasmart.db"),
    )
)


def migrate() -> None:
    if not SQLITE_PATH.is_file():
        raise FileNotFoundError(f"SQLite source database not found: {SQLITE_PATH}")
    raise RuntimeError(
        "The legacy SQLite importer is incompatible with schema.sql: the canonical "
        "database uses string course/enrollment IDs and requires payment fields that "
        "the SQLite schema does not contain. No data was copied or changed."
    )


if __name__ == "__main__":
    migrate()
