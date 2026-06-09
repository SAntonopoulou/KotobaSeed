"""Admin database controls — backups + migration visibility.

Two surfaces:
- Backups: list, trigger ad-hoc snapshot, see when scheduled cron last
  ran. Admins should never need a server shell to take an emergency
  snapshot before a risky deploy.
- Migrations: read-only view of `alembic current` vs `alembic heads`,
  plus a "run pending migrations" button. The button is admin-only and
  audited — automatic migrations still run on every container boot via
  the entrypoint, so this is a manual override for ops emergencies.

We deliberately don't expose a "restore" button. Restore is destructive,
can't be undone, and should always be a thinking-twice operation done
via SSH with `pg_restore`. The backups list documents the filename to
use; the actual restore stays out of the web UI.
"""

from __future__ import annotations

import logging
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from ..config import settings
from ..database import get_session
from ..deps import CurrentAdmin
from ..services import audit, db_backup

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/db", tags=["admin", "database"])


# --- schemas ----------------------------------------------------------


class BackupRow(BaseModel):
    filename: str
    size_bytes: int
    modified_at: datetime


class BackupListResponse(BaseModel):
    backup_dir: str
    retention_days: int
    driver: str  # "sqlite" or "postgres"
    backups: list[BackupRow]


class BackupCreateResponse(BaseModel):
    filename: str
    size_bytes: int
    modified_at: datetime


class MigrationStatusResponse(BaseModel):
    current_revision: str | None
    head_revision: str | None
    is_up_to_date: bool


class MigrationUpgradeResponse(BaseModel):
    upgraded_to: str | None
    applied: bool


# --- backups ----------------------------------------------------------


@router.get("/backups", response_model=BackupListResponse)
def list_backups(
    current: CurrentAdmin,
) -> BackupListResponse:
    """Admin — list every backup file in BACKUP_DIR, newest first."""
    rows = db_backup.list_backups()
    driver = "postgres" if settings.database_url.startswith("postgres") else "sqlite"
    return BackupListResponse(
        backup_dir=settings.backup_dir,
        retention_days=settings.backup_retention_days,
        driver=driver,
        backups=[BackupRow(**r) for r in rows],
    )


@router.post(
    "/backups", response_model=BackupCreateResponse, status_code=status.HTTP_201_CREATED
)
def trigger_backup(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> BackupCreateResponse:
    """Admin — take a snapshot now. Audited."""
    path = db_backup.run_backup()
    if path is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Backup failed — check server logs.",
        )
    stat = Path(path).stat()
    audit.record_audit(
        session,
        actor=current,
        action="admin.db.backup_triggered",
        target_type="backup",
        target_id=None,
        summary=f"Manual backup: {path.name}",
        details={"filename": path.name, "size_bytes": int(stat.st_size)},
    )
    return BackupCreateResponse(
        filename=path.name,
        size_bytes=int(stat.st_size),
        modified_at=datetime.fromtimestamp(stat.st_mtime),
    )


# --- migrations -------------------------------------------------------


def _alembic_revisions() -> tuple[str | None, str | None]:
    """Run `alembic current` and `alembic heads` and parse their output.

    Both commands print to stdout; we strip any trailing branch markers.
    Returns (current, head). Either side can be None if alembic can't be
    reached (e.g. PATH issue), in which case the endpoint reports unknown.
    """
    try:
        current_out = subprocess.run(
            ["alembic", "current"],
            cwd="backend",
            capture_output=True,
            text=True,
            check=True,
            timeout=15,
        ).stdout.strip().splitlines()
        head_out = subprocess.run(
            ["alembic", "heads"],
            cwd="backend",
            capture_output=True,
            text=True,
            check=True,
            timeout=15,
        ).stdout.strip().splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
        log.error("alembic introspection failed: %s", e)
        return None, None
    current = current_out[-1].split()[0] if current_out else None
    head = head_out[-1].split()[0] if head_out else None
    # alembic's "head (head)" suffix → drop the parenthetical
    if head and " " in head:
        head = head.split()[0]
    return current, head


@router.get("/migrations", response_model=MigrationStatusResponse)
def migration_status(
    current: CurrentAdmin,
) -> MigrationStatusResponse:
    """Admin — show the alembic current revision vs latest head."""
    current_rev, head_rev = _alembic_revisions()
    up_to_date = (
        current_rev is not None
        and head_rev is not None
        and current_rev == head_rev
    )
    return MigrationStatusResponse(
        current_revision=current_rev,
        head_revision=head_rev,
        is_up_to_date=up_to_date,
    )


@router.post("/migrations/upgrade", response_model=MigrationUpgradeResponse)
def run_upgrade(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> MigrationUpgradeResponse:
    """Admin — run `alembic upgrade head`. Audited.

    Migrations also run automatically at container start; this endpoint
    is for the rare case an admin needs to apply a fresh migration
    without restarting the service.
    """
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd="backend",
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upgrade failed: {(e.stderr or e.stdout or '').strip()[:500]}",
        ) from e
    log.info("admin-triggered alembic upgrade: %s", result.stdout.strip())
    new_current, _ = _alembic_revisions()
    audit.record_audit(
        session,
        actor=current,
        action="admin.db.migration_upgraded",
        target_type="migration",
        target_id=None,
        summary=f"Upgraded to {new_current}",
        details={"output": result.stdout[:1000]},
    )
    return MigrationUpgradeResponse(
        upgraded_to=new_current,
        applied=True,
    )
