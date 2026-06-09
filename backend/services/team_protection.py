"""Non-compete enforcement when a tutor leaves a TutorTeam.

When a tutor stops being part of a team — whether the owner removed
them or they chose to leave — we owe the team a window of protection
against client poaching. The team owner sets the window length
(0–365 days, default 90); this module turns that policy into concrete
TutorProtectedStudent rows and into the booking-time block check.

Public API:
- process_tutor_left_team(tutor, former_team, session)
- is_student_protected_from_tutor(tutor_id, student_user_id, session) -> bool
- list_active_protections_for_tutor(tutor_id, session) -> list[TutorProtectedStudent]

Booking checkout calls `is_student_protected_from_tutor` before creating
the Booking row; if True it raises 403 with a friendly message.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from ..models import (
    Booking,
    Tutor,
    TutorPageSection,
    TutorProtectedStudent,
    TutorTeam,
)

log = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def process_tutor_left_team(
    tutor: Tutor,
    former_team: TutorTeam,
    session: Session,
    *,
    commit: bool = False,
) -> int:
    """Apply all side-effects of a tutor leaving a team:

    1. Stamp `Tutor.team_id = NULL` (caller is expected to have done this
       already; this function reasserts it so paths can call us either
       order).
    2. Wipe the tutor's per-section overrides (TutorPageSection rows) so
       their public site falls back to the platform default. Phase 3 will
       extend this to restore a personal CustomTheme when present.
    3. For every distinct student who booked with this tutor while the
       team_id matched the former team, insert a TutorProtectedStudent
       row whose `protection_ends_at` is `now + team.poaching_protection_days`.

    Returns the number of protected-student rows inserted.
    Idempotent in spirit: re-running on the same (tutor, team) just
    refreshes the protection window. We delete any existing protection
    rows for the same (tutor, former_team) before inserting fresh ones.
    """
    # 1. Detach
    tutor.team_id = None
    tutor.updated_at = _utc_now()
    session.add(tutor)

    # 2. Reset theme. If the tutor has a personally-owned READY
    # CustomTheme we apply that; otherwise we wipe their section
    # overrides so the public renderer falls back to the platform
    # default. Either way, the team's shared theme is gone.
    from . import custom_themes as _ct
    _ct.restore_or_default_for_tutor(session, tutor, commit=False)

    # 3. Compute protection.
    days = int(former_team.poaching_protection_days or 0)
    if days <= 0:
        # Owner opted out of protection entirely.
        if commit:
            session.commit()
        return 0

    # Wipe any old protection rows for this exact (tutor, team) pair so
    # the new policy takes precedence cleanly.
    old = session.exec(
        select(TutorProtectedStudent).where(
            TutorProtectedStudent.tutor_id == tutor.id,
            TutorProtectedStudent.former_team_id == former_team.id,
        )
    ).all()
    for row in old:
        session.delete(row)

    # Find every student this tutor taught (or had a confirmed booking
    # with) while team_id == former_team.id. We pick the bookings table
    # because it's the authoritative ledger of paid student↔tutor
    # interactions; the team_id stamp on Booking gives us a faithful
    # historical view even after the tutor has left.
    rows = session.exec(
        select(Booking.student_user_id).where(
            Booking.tutor_id == tutor.id,
            Booking.tutor_team_id == former_team.id,
        )
    ).all()
    student_ids: set[int] = {int(sid) for sid in rows}
    if not student_ids:
        if commit:
            session.commit()
        return 0

    ends_at = _utc_now() + timedelta(days=days)
    for sid in student_ids:
        session.add(
            TutorProtectedStudent(
                tutor_id=tutor.id,
                student_user_id=sid,
                former_team_id=former_team.id,
                protection_ends_at=ends_at,
            )
        )
    log.info(
        "Tutor %s left team %s — created %d protection rows (ends %s).",
        tutor.id,
        former_team.id,
        len(student_ids),
        ends_at.isoformat(),
    )
    if commit:
        session.commit()
    return len(student_ids)


def is_student_protected_from_tutor(
    *,
    tutor_id: int,
    student_user_id: int,
    session: Session,
) -> TutorProtectedStudent | None:
    """Return the protection row currently barring this student from
    booking this tutor, or None if no active protection exists.

    Caller-side check at booking creation. If the function returns a row,
    raise a 403 with `row.protection_ends_at` in the message.
    """
    row = session.exec(
        select(TutorProtectedStudent)
        .where(
            TutorProtectedStudent.tutor_id == tutor_id,
            TutorProtectedStudent.student_user_id == student_user_id,
        )
        .order_by(TutorProtectedStudent.protection_ends_at.desc())
    ).first()
    if row is None:
        return None
    ends_at = row.protection_ends_at
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=UTC)
    if ends_at < _utc_now():
        return None
    return row


def list_active_protections_for_tutor(
    tutor_id: int, session: Session
) -> list[TutorProtectedStudent]:
    """Used by the tutor's own dashboard to show "these N students can't
    book you for X more days" — full transparency to the ex-member."""
    rows = session.exec(
        select(TutorProtectedStudent).where(
            TutorProtectedStudent.tutor_id == tutor_id,
        )
    ).all()
    out: list[TutorProtectedStudent] = []
    now = _utc_now()
    for r in rows:
        ends_at = r.protection_ends_at
        if ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=UTC)
        if ends_at >= now:
            out.append(r)
    return out
