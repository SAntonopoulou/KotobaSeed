"""Database backups — SQLite snapshots in dev, pg_dump in production.

Drivers:
- sqlite : the online-backup API, safe under concurrent writes.
- postgres: `pg_dump --format=custom` shelled to the postgres-client
  binary baked into the backend image. Custom format is compact and can
  be restored with pg_restore (no manual SQL editing).

Backups land under `settings.backup_dir`. Old files past
`settings.backup_retention_days` are pruned on each run.

Cron runs daily at 02:00 UTC, but admins can also trigger one ad-hoc
through the admin DB panel.
"""

from __future__ import annotations

import contextlib
import logging
import shutil
import sqlite3
import subprocess
import urllib.parse
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ..config import settings

log = logging.getLogger(__name__)


# --- shared helpers ---------------------------------------------------


def _dest_dir() -> Path:
    d = Path(settings.backup_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def _kind() -> str:
    return "postgres" if settings.database_url.startswith("postgres") else "sqlite"


def _backup_glob() -> str:
    return "database-*.dump" if _kind() == "postgres" else "database-*.db"


# --- sqlite path ------------------------------------------------------


def _resolve_sqlite_path(url: str) -> Path | None:
    if not url.startswith("sqlite"):
        return None
    _, _, raw = url.partition("///")
    if raw.startswith("/"):
        return Path(raw)
    return Path.cwd() / raw


def _backup_sqlite() -> Path | None:
    src = _resolve_sqlite_path(settings.database_url)
    if src is None or not src.exists():
        log.warning("SQLite backup: source missing.")
        return None
    dest = _dest_dir() / f"database-{_stamp()}.db"
    with contextlib.suppress(Exception):
        dest.unlink()
    src_conn = sqlite3.connect(str(src))
    dst_conn = sqlite3.connect(str(dest))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()
    log.info("SQLite backup written to %s", dest)
    return dest


# --- postgres path ----------------------------------------------------


def _parse_pg_url(url: str) -> dict:
    """Pull host/port/user/password/dbname out of a SQLAlchemy postgres URL.

    Handles `postgres://`, `postgresql://`, and `postgresql+psycopg2://`.
    """
    parsed = urllib.parse.urlparse(url.replace("+psycopg2", "").replace("+psycopg", ""))
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "",
        "password": parsed.password or "",
        "dbname": (parsed.path or "/").lstrip("/"),
    }


def _backup_postgres() -> Path | None:
    if shutil.which("pg_dump") is None:
        log.error("pg_dump not found on PATH — install postgresql-client.")
        return None
    cfg = _parse_pg_url(settings.database_url)
    dest = _dest_dir() / f"database-{_stamp()}.dump"
    env = {"PGPASSWORD": cfg["password"]} if cfg["password"] else {}
    cmd = [
        "pg_dump",
        "--host", cfg["host"],
        "--port", cfg["port"],
        "--username", cfg["user"],
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file", str(dest),
        cfg["dbname"],
    ]
    try:
        # Stdin/out captured so any stderr lands in our logs not in container
        # stdout (which gets noisy fast).
        result = subprocess.run(
            cmd,
            env={**env, "LC_ALL": "C"},
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.stderr:
            log.info("pg_dump messages: %s", result.stderr.strip())
    except subprocess.CalledProcessError as e:
        log.error("pg_dump failed (exit %s): %s", e.returncode, e.stderr or e.stdout)
        with contextlib.suppress(OSError):
            dest.unlink()
        return None
    log.info("Postgres backup written to %s", dest)
    return dest


# --- public API -------------------------------------------------------


def run_backup() -> Path | None:
    """Take one snapshot. Dispatches based on DATABASE_URL driver."""
    if _kind() == "postgres":
        return _backup_postgres()
    return _backup_sqlite()


def prune_old(retention_days: int | None = None) -> int:
    """Delete backup files older than retention_days. Idempotent."""
    retention = retention_days or settings.backup_retention_days
    dest_dir = Path(settings.backup_dir)
    if not dest_dir.exists():
        return 0
    cutoff = datetime.now(UTC) - timedelta(days=retention)
    n = 0
    # Sweep both backup naming patterns so a host that switched drivers
    # still cleans up.
    for pattern in ("database-*.db", "database-*.dump"):
        for path in dest_dir.glob(pattern):
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


def list_backups() -> list[dict]:
    """Surface backup files to the admin panel: filename, size, mtime."""
    dest_dir = Path(settings.backup_dir)
    if not dest_dir.exists():
        return []
    out: list[dict] = []
    for pattern in ("database-*.db", "database-*.dump"):
        for path in dest_dir.glob(pattern):
            try:
                stat = path.stat()
            except OSError:
                continue
            out.append(
                {
                    "filename": path.name,
                    "size_bytes": int(stat.st_size),
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=UTC),
                }
            )
    # Newest first.
    out.sort(key=lambda r: r["modified_at"], reverse=True)
    return out


# --- offsite (R2) --------------------------------------------------------

R2_BACKUP_PREFIX = "db-backups/"


def _r2_backup_client():
    """Return a boto3 R2 client if all R2_* env are configured, else None."""
    if not all([
        settings.r2_account_id,
        settings.r2_bucket,
        settings.r2_access_key_id,
        settings.r2_secret_access_key,
    ]):
        return None
    import boto3
    from botocore.client import Config

    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name="auto",
    )


def _r2_bucket_size(client) -> int:
    """Sum the bytes across every object under R2_BACKUP_PREFIX. Used as
    a pre-upload guard so a runaway DB can't push us past the free tier.
    """
    total = 0
    continuation: str | None = None
    while True:
        kwargs: dict = {"Bucket": settings.r2_bucket, "Prefix": R2_BACKUP_PREFIX}
        if continuation:
            kwargs["ContinuationToken"] = continuation
        resp = client.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []) or []:
            total += int(obj.get("Size") or 0)
        if not resp.get("IsTruncated"):
            return total
        continuation = resp.get("NextContinuationToken")


def upload_to_r2(path: Path) -> str | None:
    """Upload a local backup file to R2. Returns the R2 key, or None on failure.

    Refuses to upload if the bucket already holds more than
    ``settings.r2_backup_quota_bytes`` worth of backups. Local backups
    continue regardless — the offsite copy is a belt-and-braces layer,
    not the primary.
    """
    client = _r2_backup_client()
    if client is None:
        log.info("R2 not configured — skipping offsite backup upload.")
        return None

    file_size = path.stat().st_size
    try:
        used = _r2_bucket_size(client)
    except Exception:
        log.exception("R2 bucket size probe failed; skipping upload as a precaution")
        return None
    if used + file_size > settings.r2_backup_quota_bytes:
        log.warning(
            "R2 backup quota guard tripped: used=%d bytes + file=%d bytes "
            "would exceed quota=%d bytes. Skipping offsite upload — "
            "local backup still recorded.",
            used,
            file_size,
            settings.r2_backup_quota_bytes,
        )
        return None

    key = f"{R2_BACKUP_PREFIX}{path.name}"
    try:
        with path.open("rb") as fh:
            client.put_object(
                Bucket=settings.r2_bucket,
                Key=key,
                Body=fh,
                ContentType="application/octet-stream",
                CacheControl="private, max-age=0, no-cache",
            )
        log.info("Offsite backup uploaded to R2 key=%s", key)
        return key
    except Exception:
        log.exception("Offsite backup upload to R2 failed for %s", path)
        return None


def prune_r2_backups(retention_days: int | None = None) -> int:
    """Delete R2 backup objects past the retention window, then enforce
    a hard object-count ceiling so even a misconfigured clock can't
    leave us with more than ``settings.r2_backup_max_objects`` files.

    Idempotent. Loops list_objects_v2 pages so a long-running deployment
    with thousands of historical backups still prunes correctly.
    """
    client = _r2_backup_client()
    if client is None:
        return 0
    retention = retention_days or settings.backup_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=retention)
    deleted = 0

    # Collect every object first so the count cap can act on the full
    # list. Backup buckets are O(weeks), not O(millions), so this is
    # cheap.
    all_objects: list[dict] = []
    continuation_token: str | None = None
    while True:
        kwargs: dict = {"Bucket": settings.r2_bucket, "Prefix": R2_BACKUP_PREFIX}
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token
        try:
            resp = client.list_objects_v2(**kwargs)
        except Exception:
            log.exception("R2 backup prune list failed")
            return deleted
        for obj in resp.get("Contents", []) or []:
            last_modified = obj.get("LastModified")
            if last_modified is None:
                continue
            if last_modified.tzinfo is None:
                last_modified = last_modified.replace(tzinfo=UTC)
            all_objects.append(
                {"Key": obj["Key"], "LastModified": last_modified}
            )
        if not resp.get("IsTruncated"):
            break
        continuation_token = resp.get("NextContinuationToken")

    # Newest first so the count-cap step can keep the freshest N.
    all_objects.sort(key=lambda o: o["LastModified"], reverse=True)

    age_doomed = [
        {"Key": o["Key"]}
        for o in all_objects
        if o["LastModified"] < cutoff
    ]
    # Anything past the max-objects ceiling that wasn't already
    # age-doomed gets caught by the count cap.
    cap = settings.r2_backup_max_objects
    count_doomed: list[dict] = []
    if cap > 0 and len(all_objects) > cap:
        already_doomed_keys = {d["Key"] for d in age_doomed}
        for o in all_objects[cap:]:
            if o["Key"] not in already_doomed_keys:
                count_doomed.append({"Key": o["Key"]})

    to_delete = age_doomed + count_doomed
    if to_delete:
        try:
            client.delete_objects(
                Bucket=settings.r2_bucket,
                Delete={"Objects": to_delete, "Quiet": True},
            )
            deleted = len(to_delete)
        except Exception:
            log.exception("R2 backup prune delete failed")
    if deleted:
        log.info(
            "Pruned %d R2 backup object(s) (age=%d, count-cap=%d).",
            deleted,
            len(age_doomed),
            len(count_doomed),
        )
    return deleted


def run_backup_and_prune() -> None:
    """Cron-friendly wrapper that swallows individual failures.

    Order matters: local snapshot → R2 upload → local prune → R2 prune.
    Each phase is independent; a failure in one doesn't skip the
    others. Means a single transient R2 outage doesn't break local
    backups (the local snapshot still happens), and a local pg_dump
    failure doesn't mean we miss the day's R2 prune.
    """
    snapshot: Path | None = None
    try:
        snapshot = run_backup()
    except Exception:
        log.exception("DB backup failed")
    if snapshot is not None:
        try:
            upload_to_r2(snapshot)
        except Exception:
            log.exception("Offsite backup upload failed")
    try:
        prune_old()
    except Exception:
        log.exception("Local backup prune failed")
    try:
        prune_r2_backups()
    except Exception:
        log.exception("R2 backup prune failed")
