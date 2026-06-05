"""Audit-log writer.

Single entry point: `record_audit(...)`. Wrapped in a broad try/except so a
hiccup writing the audit row never rolls back the originating action — the
business work is more important than the paper trail.

Use from admin endpoints AND from system tasks (cron jobs). For system
tasks, pass `actor=None` and a descriptive `actor_label` like "system:cron".
"""

from __future__ import annotations

import contextlib
import json
import logging
from typing import Any

from sqlmodel import Session

from ..models import AuditLog, User

log = logging.getLogger(__name__)


def record_audit(
    session: Session,
    *,
    actor: User | None,
    action: str,
    target_type: str | None = None,
    target_id: int | None = None,
    summary: str,
    details: dict[str, Any] | None = None,
    actor_label: str | None = None,
) -> None:
    """Append a row to the audit log.

    - `actor` is the User performing the action, or None for system tasks.
    - `actor_label` overrides the default label ("user:<email>" or
      "system:unknown"). Use it for cron jobs ("system:cron:dormant_pause").
    - `summary` is a short human-readable description for the admin UI.
    - `details` is an optional dict serialized to `details_json`.

    Failures are swallowed with a log line — DO NOT let an audit-write
    problem roll back the action it was recording.
    """
    try:
        if actor_label is None:
            actor_label = f"user:{actor.email}" if actor else "system:unknown"
        entry = AuditLog(
            actor_user_id=actor.id if actor else None,
            actor_label=actor_label[:120],
            action=action[:80],
            target_type=target_type[:40] if target_type else None,
            target_id=target_id,
            summary=summary[:500],
            details_json=json.dumps(details) if details else None,
        )
        session.add(entry)
        session.commit()
    except Exception:
        log.exception("Failed to record audit entry (action=%s target=%s/%s)", action, target_type, target_id)
        with contextlib.suppress(Exception):
            session.rollback()
