"""Admin-schedulable maintenance windows + public banner endpoint.

Three surfaces:

- ``GET /platform/maintenance`` — public, returns the current/next
  scheduled window. The SPA polls this every 5 minutes (every 30s in
  the last 10) so the banner + hard modal stay in sync without a WS
  channel. Cheap query.

- ``GET /admin/maintenance`` — admin-only list, with affected-booking
  counts denormalised.

- ``POST /admin/maintenance`` — admin schedules a new window. Walks
  the affected bookings, issues a BookingCredit to each affected
  student + tutor pair, and emits Notification rows so they see it
  in their inbox.

- ``DELETE /admin/maintenance/{id}`` — cancel a not-yet-started
  window. Reverses every BookingCredit issued for it.

The classroom + booking endpoints check the active maintenance
window via the shared helper and refuse new actions during it.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_admin, get_current_user_optional
from ..models import (
    Booking,
    BookingCredit,
    BookingCreditKind,
    BookingCreditStatus,
    BookingStatus,
    MaintenanceStatus,
    MaintenanceWindow,
    Notification,
    User,
)

router = APIRouter(tags=["maintenance"])


# --- Schemas -----------------------------------------------------------------


class MaintenancePublicRead(BaseModel):
    """What the SPA polls. Returns the next non-completed window or null."""

    id: int
    scheduled_start_at: datetime
    duration_minutes: int
    message: str
    status: MaintenanceStatus
    # Convenience: seconds until the window starts. Negative if the
    # window has begun (status will be ACTIVE in that case). The SPA
    # uses this to flip between banner and hard modal without doing
    # its own clock math.
    seconds_until_start: int


class MaintenanceAdminRead(MaintenancePublicRead):
    affected_booking_count: int
    created_by_user_id: int
    created_at: datetime
    cancelled_at: datetime | None = None
    cancelled_by_user_id: int | None = None


class MaintenanceCreate(BaseModel):
    scheduled_start_at: datetime
    duration_minutes: int = Field(ge=5, le=480)
    message: str = Field(min_length=1, max_length=1000)


# --- Helpers -----------------------------------------------------------------


def _active_or_upcoming(session: Session) -> MaintenanceWindow | None:
    """The single window the SPA should care about right now.

    Picks the earliest SCHEDULED window, OR the currently ACTIVE one
    if a window has started but not finished. COMPLETED + CANCELLED
    windows are invisible to the SPA — they're history.
    """
    now = datetime.now(UTC)
    rows = session.exec(
        select(MaintenanceWindow)
        .where(MaintenanceWindow.status.in_([
            MaintenanceStatus.SCHEDULED,
            MaintenanceStatus.ACTIVE,
        ]))
        .order_by(MaintenanceWindow.scheduled_start_at.asc())
    ).all()
    for row in rows:
        start = row.scheduled_start_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        end = start + timedelta(minutes=row.duration_minutes)
        if end <= now:
            # Past — caller should mark it COMPLETED via the cron path.
            continue
        return row
    return None


def _serialize_public(w: MaintenanceWindow) -> MaintenancePublicRead:
    start = w.scheduled_start_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    return MaintenancePublicRead(
        id=w.id,
        scheduled_start_at=start,
        duration_minutes=w.duration_minutes,
        message=w.message,
        status=w.status,
        seconds_until_start=int((start - datetime.now(UTC)).total_seconds()),
    )


def _serialize_admin(w: MaintenanceWindow) -> MaintenanceAdminRead:
    base = _serialize_public(w).model_dump()
    return MaintenanceAdminRead(
        **base,
        affected_booking_count=w.affected_booking_count,
        created_by_user_id=w.created_by_user_id,
        created_at=w.created_at,
        cancelled_at=w.cancelled_at,
        cancelled_by_user_id=w.cancelled_by_user_id,
    )


def _affected_bookings(session: Session, window: MaintenanceWindow) -> list[Booking]:
    """Confirmed/pending bookings that overlap the maintenance window."""
    start = window.scheduled_start_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    end = start + timedelta(minutes=window.duration_minutes)
    rows = session.exec(
        select(Booking).where(
            Booking.status.in_([
                BookingStatus.CONFIRMED,
                BookingStatus.PENDING_PAYMENT,
                BookingStatus.PENDING_GROUP_MIN,
            ]),
            Booking.scheduled_at < end,
        )
    ).all()
    out: list[Booking] = []
    for b in rows:
        sched = b.scheduled_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=UTC)
        # Overlap if the lesson's window [sched, sched+duration) intersects
        # the maintenance window [start, end).
        booking_end = sched + timedelta(minutes=b.duration_minutes)
        if booking_end > start and sched < end:
            out.append(b)
    return out


def _notify_affected(session: Session, window: MaintenanceWindow, bookings: list[Booking]) -> None:
    """One Notification per affected user pair + tutor + a BookingCredit.

    Idempotent on the credit side: if a credit already exists for the
    same affected_booking_id we don't issue a second one.
    """
    now = datetime.now(UTC)
    for b in bookings:
        existing = session.exec(
            select(BookingCredit).where(
                BookingCredit.affected_booking_id == b.id,
                BookingCredit.status == BookingCreditStatus.AVAILABLE,
            )
        ).first()
        if existing is None:
            session.add(BookingCredit(
                user_id=b.student_user_id,
                tutor_id=b.tutor_id,
                affected_booking_id=b.id,
                duration_minutes=b.duration_minutes,
                kind=BookingCreditKind.MAINTENANCE,
                note=(
                    "Your lesson on "
                    f"{b.scheduled_at.strftime('%d %b %Y at %H:%M UTC')} "
                    "is during scheduled maintenance. Here's a free "
                    "lesson with this tutor — usable any time in the "
                    "next 30 days, fee-free."
                ),
                expires_at=now + timedelta(days=30),
            ))
        session.add(Notification(
            user_id=b.student_user_id,
            message=(
                "Scheduled maintenance overlaps your lesson on "
                f"{b.scheduled_at.strftime('%d %b at %H:%M UTC')}. "
                "We've added a free-lesson credit to your account."
            ),
            link="/dashboard?tab=credits",
        ))


# --- Endpoints ---------------------------------------------------------------


@router.get("/platform/maintenance", response_model=MaintenancePublicRead | None)
def public_maintenance(
    session: Annotated[Session, Depends(get_session)],
    # Auth optional — anonymous browse should also see the banner.
    _viewer: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> MaintenancePublicRead | None:
    """SPA polls this for the banner + hard modal data."""
    w = _active_or_upcoming(session)
    return _serialize_public(w) if w is not None else None


@router.get("/admin/maintenance", response_model=list[MaintenanceAdminRead])
def admin_list_maintenance(
    current_user: Annotated[User, Depends(get_current_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> list[MaintenanceAdminRead]:
    rows = session.exec(
        select(MaintenanceWindow).order_by(MaintenanceWindow.scheduled_start_at.desc())
    ).all()
    return [_serialize_admin(r) for r in rows]


@router.post(
    "/admin/maintenance",
    response_model=MaintenanceAdminRead,
    status_code=status.HTTP_201_CREATED,
)
def admin_schedule_maintenance(
    payload: MaintenanceCreate,
    current_user: Annotated[User, Depends(get_current_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> MaintenanceAdminRead:
    """Schedule a new window + auto-issue credits to affected bookings."""
    start = payload.scheduled_start_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    if start < now + timedelta(minutes=10):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Schedule maintenance at least 10 minutes in the future "
                "so users have time to see the banner."
            ),
        )

    window = MaintenanceWindow(
        scheduled_start_at=start,
        duration_minutes=payload.duration_minutes,
        message=payload.message.strip(),
        status=MaintenanceStatus.SCHEDULED,
        created_by_user_id=current_user.id,
        affected_booking_count=0,
    )
    session.add(window)
    session.commit()
    session.refresh(window)

    affected = _affected_bookings(session, window)
    window.affected_booking_count = len(affected)
    session.add(window)
    _notify_affected(session, window, affected)
    session.commit()
    session.refresh(window)
    return _serialize_admin(window)


@router.delete("/admin/maintenance/{window_id}", response_model=MaintenanceAdminRead)
def admin_cancel_maintenance(
    window_id: int,
    current_user: Annotated[User, Depends(get_current_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> MaintenanceAdminRead:
    """Cancel a not-yet-started window. Revokes the credits we issued."""
    window = session.get(MaintenanceWindow, window_id)
    if window is None:
        raise HTTPException(status_code=404, detail="Maintenance window not found.")
    if window.status not in (MaintenanceStatus.SCHEDULED,):
        raise HTTPException(
            status_code=409,
            detail="Only scheduled (not started) windows can be cancelled.",
        )

    # Revoke credits we issued for this specific window's affected bookings.
    affected = _affected_bookings(session, window)
    booking_ids = [b.id for b in affected]
    if booking_ids:
        credits = session.exec(
            select(BookingCredit).where(
                BookingCredit.affected_booking_id.in_(booking_ids),
                BookingCredit.status == BookingCreditStatus.AVAILABLE,
                BookingCredit.kind == BookingCreditKind.MAINTENANCE,
            )
        ).all()
        for c in credits:
            c.status = BookingCreditStatus.EXPIRED
            session.add(c)

    window.status = MaintenanceStatus.CANCELLED
    window.cancelled_at = datetime.now(UTC)
    window.cancelled_by_user_id = current_user.id
    session.add(window)
    session.commit()
    session.refresh(window)
    return _serialize_admin(window)


def is_maintenance_in_progress(session: Session) -> bool:
    """Helper used by the booking + classroom endpoints to refuse new
    actions during an active window. Trips when status == ACTIVE OR
    when a SCHEDULED window's start has passed but the periodic
    transitioner hasn't run yet."""
    now = datetime.now(UTC)
    rows = session.exec(
        select(MaintenanceWindow).where(
            MaintenanceWindow.status.in_([
                MaintenanceStatus.SCHEDULED,
                MaintenanceStatus.ACTIVE,
            ])
        )
    ).all()
    for r in rows:
        start = r.scheduled_start_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        end = start + timedelta(minutes=r.duration_minutes)
        if start <= now < end:
            return True
    return False
