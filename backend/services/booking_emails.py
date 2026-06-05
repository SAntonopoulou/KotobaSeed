"""Orchestrates booking-related emails — sends to student and tutor, building
URLs and timezone-aware strings from a Booking row.

Send failures are logged but never raised; email is a side-channel, not a
business-critical step. Reminders dedup via Booking.reminder_sent_at.
"""

from __future__ import annotations

import contextlib
import logging
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, and_, select

from ..config import settings
from ..models import (
    Booking,
    BookingStatus,
    LessonPack,
    Tutor,
    User,
)
from . import email as email_service

log = logging.getLogger(__name__)


def _tutor_site_url(tutor_slug: str, path: str = "/") -> str:
    """Build a fully-qualified URL for the tutor's subdomain. The frontend
    constructs these client-side via `useTenant.tutorSiteUrl`; this is the
    server-side equivalent for transactional links."""
    frontend = settings.frontend_url.rstrip("/")
    # Local dev: frontend = http://localhost:5173 — emails point at that
    # subdomain-style URL pattern so dev links work in the browser.
    # Prod: replace the `kotobaseed.net` apex with the tutor's subdomain.
    if "localhost" in frontend:
        return f"http://{tutor_slug}.localhost:5173{path}"
    # https://kotobaseed.net → https://<slug>.kotobaseed.net
    if "://" in frontend:
        scheme, rest = frontend.split("://", 1)
        return f"{scheme}://{tutor_slug}.{rest}{path}"
    return f"https://{tutor_slug}.{frontend}{path}"


def _classroom_url(tutor_slug: str, booking_id: int) -> str:
    return _tutor_site_url(tutor_slug, f"/classroom/{booking_id}")


def _dashboard_url(tutor_slug: str) -> str:
    return _tutor_site_url(tutor_slug, "/dashboard")


def _load_recipients(
    session: Session, booking: Booking
) -> tuple[Tutor | None, User | None, User | None, LessonPack | None]:
    tutor = session.get(Tutor, booking.tutor_id)
    if tutor is None:
        return None, None, None, None
    tutor_user = session.get(User, tutor.user_id)
    student = session.get(User, booking.student_user_id)
    pack = session.get(LessonPack, booking.lesson_pack_id)
    return tutor, tutor_user, student, pack


def send_confirmation_emails(session: Session, booking: Booking) -> None:
    """Send confirmation to student + tutor. Called when a booking moves to
    CONFIRMED — by the Stripe webhook for paid bookings, and directly from
    the trial-book endpoint for free trials. Failures are swallowed."""
    tutor, tutor_user, student, pack = _load_recipients(session, booking)
    if tutor is None or pack is None:
        log.warning("Booking %s missing tutor or pack; skipping emails.", booking.id)
        return
    tutor_slug = tutor.tutor_slug
    tutor_tz = tutor_user.timezone if tutor_user else None
    is_trial = pack.is_trial
    classroom = _classroom_url(tutor_slug, booking.id)
    dashboard = _dashboard_url(tutor_slug)

    if student is not None:
        with contextlib.suppress(Exception):
            email_service.send_booking_confirmation_student(
                to_email=student.email,
                student_name=student.full_name or student.username or "",
                tutor_display_name=tutor.display_name,
                pack_name=pack.name,
                scheduled_at=booking.scheduled_at,
                duration_minutes=booking.duration_minutes,
                classroom_url=classroom,
                tutor_timezone=tutor_tz,
                is_trial=is_trial,
                reply_to=tutor.public_reply_email,
            )

    if tutor_user is not None:
        with contextlib.suppress(Exception):
            email_service.send_booking_confirmation_tutor(
                to_email=tutor_user.email,
                tutor_name=tutor_user.full_name or tutor.display_name,
                student_display_name=(
                    (student.full_name or student.username) if student else "A student"
                ),
                pack_name=pack.name,
                scheduled_at=booking.scheduled_at,
                duration_minutes=booking.duration_minutes,
                dashboard_url=dashboard,
                tutor_timezone=tutor_tz,
                is_trial=is_trial,
            )


def send_reminder_emails(session: Session, booking: Booking) -> None:
    """Send 24h reminder to student + tutor. Failures are swallowed; the
    caller is responsible for stamping `reminder_sent_at` regardless so a
    misconfigured Resend doesn't loop the booking forever."""
    tutor, tutor_user, student, pack = _load_recipients(session, booking)
    if tutor is None or pack is None:
        return
    tutor_slug = tutor.tutor_slug
    tutor_tz = tutor_user.timezone if tutor_user else None
    classroom = _classroom_url(tutor_slug, booking.id)
    dashboard = _dashboard_url(tutor_slug)

    if student is not None:
        with contextlib.suppress(Exception):
            email_service.send_booking_reminder_student(
                to_email=student.email,
                student_name=student.full_name or student.username or "",
                tutor_display_name=tutor.display_name,
                scheduled_at=booking.scheduled_at,
                duration_minutes=booking.duration_minutes,
                classroom_url=classroom,
                tutor_timezone=tutor_tz,
                reply_to=tutor.public_reply_email,
            )

    if tutor_user is not None:
        with contextlib.suppress(Exception):
            email_service.send_booking_reminder_tutor(
                to_email=tutor_user.email,
                tutor_name=tutor_user.full_name or tutor.display_name,
                student_display_name=(
                    (student.full_name or student.username) if student else "A student"
                ),
                scheduled_at=booking.scheduled_at,
                duration_minutes=booking.duration_minutes,
                dashboard_url=dashboard,
                tutor_timezone=tutor_tz,
            )


def sweep_due_reminders(session: Session, *, now: datetime | None = None) -> int:
    """Sweep CONFIRMED bookings whose lesson starts in 22–26 hours and which
    haven't been reminded yet. The wide window absorbs cron drift and worker
    restarts. Returns the number of bookings reminded.

    Run hourly via APScheduler. The reminder_sent_at stamp is the dedup
    guard so multiple worker processes are safe to run this concurrently —
    the first to commit wins; later ones see reminder_sent_at IS NOT NULL
    and skip the row.
    """
    now = now or datetime.now(UTC)
    lower = now + timedelta(hours=22)
    upper = now + timedelta(hours=26)

    candidates = list(
        session.exec(
            select(Booking).where(
                and_(
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.scheduled_at >= lower,
                    Booking.scheduled_at <= upper,
                    Booking.reminder_sent_at == None,  # noqa: E711
                )
            )
        ).all()
    )

    sent = 0
    for booking in candidates:
        try:
            send_reminder_emails(session, booking)
        except Exception:
            log.exception(
                "Reminder send raised for booking %s; stamping anyway to avoid loop.",
                booking.id,
            )
        # Always stamp — even on failure, so a broken email config doesn't
        # spam every hour. If Sophia rotates the Resend key and a few
        # reminders missed during the outage, that's better than the same
        # booking firing 24 emails over the next day.
        booking.reminder_sent_at = now
        session.add(booking)
        sent += 1

    if sent:
        session.commit()
    return sent
