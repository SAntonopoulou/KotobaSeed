"""SQLite backup snapshots.

Uses sqlite3's online-backup API so concurrent writes during the dump
don't corrupt the snapshot. Old backups beyond `backup_retention_days`
get pruned. Cron runs daily at 02:00 UTC.
"""

from __future__ import annotations

import contextlib
import logging
import os
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ..config import settings

log = logging.getLogger(__name__)


def _resolve_sqlite_path(url: str) -> Path | None:
    """Extract a filesystem path from a sqlite:/// URL. Returns None for
    non-sqlite URLs (Postgres prod)."""
    if not url.startswith("sqlite"):
        return None
    # sqlite:///./database.db or sqlite:////absolute/path.db
    _, _, raw = url.partition("///")
    if raw.startswith("/"):
        return Path(raw)
    return Path.cwd() / raw


def run_backup() -> Path | None:
    """Take one snapshot of the live SQLite DB. No-op when DB is Postgres."""
    src = _resolve_sqlite_path(settings.database_url)
    if src is None:
        return None
    if not src.exists():
        log.warning("DB backup: source %s does not exist; skipping.", src)
        return None
    dest_dir = Path(settings.backup_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    dest = dest_dir / f"database-{stamp}.db"

    with contextlib.suppress(Exception):
        dest.unlink()
    # The online-backup API streams pages while the source DB is live,
    # so writes mid-backup don't corrupt the snapshot.
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(dest))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()
    log.info("DB backup written to %s", dest)
    return dest


def prune_old(retention_days: int | None = None) -> int:
    """Delete backup files older than `retention_days`. Returns count
    deleted. Safe to call even when the backup directory doesn't exist."""
    retention = retention_days or settings.backup_retention_days
    dest_dir = Path(settings.backup_dir)
    if not dest_dir.exists():
        return 0
    cutoff = datetime.now(UTC) - timedelta(days=retention)
    n = 0
    for path in dest_dir.glob("database-*.db"):
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
        except OSError:
            continue
        if mtime < cutoff:
            with contextlib.suppress(OSError):
                path.unlink()
                n += 1
    if n:
        log.info("Pruned %d old DB backup(s).", n)
    return n


def run_backup_and_prune() -> None:
    try:
        run_backup()
    except Exception:
        log.exception("DB backup failed")
    try:
        prune_old()
    except Exception:
        log.exception("DB backup prune failed")
