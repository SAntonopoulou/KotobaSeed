"""Per-tenant student enrollment ledger.

A `StudentEnrollment` row records that student X is on tutor Y's roster.
We create one at the *first* booking (any status) the student makes with
the tutor — pre-checkout is fine, the enrollment is just an
acknowledgement of the relationship, not a paid commitment.

Status is mostly tutor-curated:
- ACTIVE   — default; visible in "My students"
- INACTIVE — tutor archived the relationship (moved away, etc.)

`last_active_at` is bumped on each booking event so the dashboard can
sort by recency and surface "active 3 days ago" / "no lessons in 4 months".
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import Session, select

from ..models import StudentEnrollment, StudentEnrollmentStatus


def ensure_enrollment(
    *,
    student_user_id: int,
    tutor_id: int,
    session: Session,
    commit: bool = False,
) -> StudentEnrollment:
    """Create the enrollment if it doesn't exist, otherwise return it.

    Always safe to call inside a booking-creation path — the row is a
    cheap acknowledgement of (student, tutor).
    """
    existing = session.exec(
        select(StudentEnrollment).where(
            StudentEnrollment.student_user_id == student_user_id,
            StudentEnrollment.tutor_id == tutor_id,
        )
    ).first()
    if existing is not None:
        return existing
    row = StudentEnrollment(
        student_user_id=student_user_id,
        tutor_id=tutor_id,
        status=StudentEnrollmentStatus.ACTIVE,
    )
    session.add(row)
    if commit:
        session.commit()
        session.refresh(row)
    return row


def touch_enrollment(
    *,
    student_user_id: int,
    tutor_id: int,
    session: Session,
    commit: bool = False,
) -> None:
    """Bump `last_active_at` on the enrollment. No-op if none exists.

    Use this on lesson-completion / message events so "active 3 days ago"
    stays accurate without a cron sweep.
    """
    row = session.exec(
        select(StudentEnrollment).where(
            StudentEnrollment.student_user_id == student_user_id,
            StudentEnrollment.tutor_id == tutor_id,
        )
    ).first()
    if row is None:
        return
    row.last_active_at = datetime.now(UTC)
    session.add(row)
    if commit:
        session.commit()
