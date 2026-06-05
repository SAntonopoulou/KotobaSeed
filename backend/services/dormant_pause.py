"""Auto-pause inactive Starter tutors.

A Starter tutor whose `last_completed_lesson_at` is more than
`settings.dormant_pause_days` ago gets flipped to PAUSED_DORMANT. Their
public site stays up (with the paused banner) so students can still find
them, but new bookings are gated until the tutor wakes the account up.

Run daily by the APScheduler job wired in `main.py`. Idempotent — calling
it multiple times in the same day only acts on tutors not already paused.

Pure-function `find_dormant_tutors()` exists so tests can verify the query
without involving the scheduler.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, or_, select

from .. import database as _database  # late-bound engine so tests can swap
from ..config import settings
from ..models import Tutor, TutorAccountStatus, TutorPlan
from .audit import record_audit

log = logging.getLogger(__name__)


def find_dormant_tutors(session: Session, *, now: datetime | None = None) -> list[Tutor]:
    """Return Starter tutors that should be auto-paused.

    A tutor is dormant if:
      - plan == STARTER
      - account_status == ACTIVE
      - last_completed_lesson_at is more than `dormant_pause_days` ago,
        OR last_completed_lesson_at is null AND created_at is that far back
        (a tutor who never taught anything and signed up that long ago)
    """
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(days=settings.dormant_pause_days)
    stmt = select(Tutor).where(
        Tutor.plan == TutorPlan.STARTER,
        Tutor.account_status == TutorAccountStatus.ACTIVE,
        or_(
            Tutor.last_completed_lesson_at < cutoff,
            (Tutor.last_completed_lesson_at.is_(None)) & (Tutor.created_at < cutoff),
        ),
    )
    return list(session.exec(stmt).all())


def _already_ran_today(session: Session, *, now: datetime) -> bool:
    """Check the audit log to see if the sweep already ran today.

    Lightweight multi-worker safety: when uvicorn runs with N workers each
    has its own APScheduler firing the job. The first worker to complete
    a sweep logs `tutor.dormant_sweep_completed`; subsequent workers see
    that and exit early. Not bulletproof (race window in the first second)
    but enough to keep audit-log noise down without a full distributed lock.
    """
    from ..models import AuditLog

    start_of_day = datetime(now.year, now.month, now.day, tzinfo=UTC)
    existing = session.exec(
        select(AuditLog)
        .where(AuditLog.action == "tutor.dormant_sweep_completed")
        .where(AuditLog.created_at >= start_of_day)
    ).first()
    return existing is not None


def pause_dormant_tutors(*, now: datetime | None = None) -> int:
    """Pause every dormant Starter tutor. Returns the count paused.

    Opens its own DB session — safe to call from APScheduler (which runs
    outside the FastAPI request lifecycle). Multi-worker safe via the
    `_already_ran_today` audit-log check.
    """
    now = now or datetime.now(UTC)
    paused = 0
    with Session(_database.engine) as session:
        if _already_ran_today(session, now=now):
            log.info("dormant_pause: already ran today; skipping")
            return 0
        for tutor in find_dormant_tutors(session, now=now):
            tutor.account_status = TutorAccountStatus.PAUSED_DORMANT
            tutor.paused_reason = (
                f"No completed lessons in {settings.dormant_pause_days} days."
            )
            tutor.updated_at = now or datetime.now(UTC)
            session.add(tutor)
            session.commit()
            record_audit(
                session,
                actor=None,
                actor_label="system:cron:dormant_pause",
                action="tutor.paused_dormant",
                target_type="tutor",
                target_id=tutor.id,
                summary=f"Auto-paused tutor {tutor.tutor_slug} after {settings.dormant_pause_days} days of inactivity.",
            )
            paused += 1
        # Stamp the completion so other workers (and tomorrow's race window)
        # see "already done today".
        record_audit(
            session,
            actor=None,
            actor_label="system:cron:dormant_pause",
            action="tutor.dormant_sweep_completed",
            target_type=None,
            target_id=None,
            summary=f"Dormant-pause sweep complete; {paused} tutor(s) paused.",
        )
    log.info("dormant_pause sweep complete: %d tutor(s) paused", paused)
    return paused
