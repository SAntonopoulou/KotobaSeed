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
    Notification,
    Tutor,
    User,
)
from . import email as email_service, email_templates

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


def send_cancellation_email_student(session: Session, booking: Booking) -> None:
    """Send a cancellation confirmation to the student.

    `refund_note` adapts to whether the cancel triggered a refund. We never
    raise — email is a side-channel; the cancel itself has already happened.
    """
    tutor, _tutor_user, student, pack = _load_recipients(session, booking)
    if tutor is None or pack is None or student is None:
        log.warning(
            "Booking %s missing tutor/pack/student; skipping cancel email.",
            booking.id,
        )
        return
    tutor_user = session.get(User, tutor.user_id)
    tutor_tz = tutor_user.timezone if tutor_user else None
    when_str = email_service._format_when(booking.scheduled_at, tutor_tz)

    if booking.status == BookingStatus.REFUNDED:
        refund_note = (
            "We've refunded the lesson back to your card. Stripe may take a "
            "few business days to return it to your statement."
        )
    else:
        # PENDING_PAYMENT path — no money moved, just freeing the slot.
        refund_note = (
            "No charge was made for this booking, so there's nothing to refund."
        )

    ctx = {
        "student_name": student.full_name or student.username or "there",
        "tutor_name": tutor.display_name,
        "when": when_str,
        "duration_minutes": booking.duration_minutes,
        "pack_name": pack.name,
        "refund_note": refund_note,
    }
    with contextlib.suppress(Exception):
        subject, body_html = email_templates.render(
            "booking_cancelled_student", ctx, session=session, tutor=tutor
        )
        email_service.send_email(
            to=student.email,
            subject=subject,
            html=email_service._wrap(subject, body_html),
            reply_to=tutor.public_reply_email,
        )


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
            when_str = email_service._format_when(booking.scheduled_at, tutor_tz)
            ctx = {
                "student_name": student.full_name or student.username or "there",
                "tutor_name": tutor.display_name,
                "when": when_str,
                "duration_minutes": booking.duration_minutes,
                "pack_name": pack.name,
                "classroom_url": classroom,
            }
            template_key = (
                "trial_welcome_student" if is_trial else "booking_confirmation_student"
            )
            subject, body_html = email_templates.render(
                template_key, ctx, session=session, tutor=tutor
            )
            email_service.send_email(
                to=student.email,
                subject=subject,
                html=email_service._wrap(subject, body_html),
                reply_to=tutor.public_reply_email,
            )

    if tutor_user is not None:
        with contextlib.suppress(Exception):
            when_str = email_service._format_when(booking.scheduled_at, tutor_tz)
            student_display = (
                (student.full_name or student.username) if student else "A student"
            )
            ctx = {
                "student_name": student_display,
                "tutor_name": tutor_user.full_name or tutor.display_name,
                "when": when_str,
                "duration_minutes": booking.duration_minutes,
                "pack_name": pack.name,
                "dashboard_url": dashboard,
            }
            subject, body_html = email_templates.render(
                "booking_confirmation_tutor", ctx, session=session, tutor=tutor
            )
            email_service.send_email(
                to=tutor_user.email,
                subject=subject,
                html=email_service._wrap(subject, body_html),
            )


def send_reminder_emails(session: Session, booking: Booking) -> None:
    """Send 24h reminder to student + tutor across email *and* in-app
    Notifications. Failures are swallowed; the caller is responsible for
    stamping `reminder_sent_at` regardless so a misconfigured Resend
    doesn't loop the booking forever."""
    tutor, tutor_user, student, pack = _load_recipients(session, booking)
    if tutor is None or pack is None:
        return
    tutor_slug = tutor.tutor_slug
    tutor_tz = tutor_user.timezone if tutor_user else None
    classroom = _classroom_url(tutor_slug, booking.id)
    dashboard = _dashboard_url(tutor_slug)

    # In-app notification — drives the inbox bell badge + the dropdown.
    # Best-effort; swallow exceptions so an audit-log/notification table
    # hiccup never blocks the email send.
    with contextlib.suppress(Exception):
        when_short = email_service._format_when(booking.scheduled_at, tutor_tz)
        if student is not None:
            session.add(
                Notification(
                    user_id=student.id,
                    message=(
                        f"Your lesson with {tutor.display_name} is in about a day "
                        f"({when_short})."
                    ),
                    link="/student/dashboard",
                )
            )
        if tutor_user is not None:
            session.add(
                Notification(
                    user_id=tutor_user.id,
                    message=(
                        f"Lesson with {(student.full_name or 'a student') if student else 'a student'} "
                        f"in about a day ({when_short})."
                    ),
                    link="/dashboard",
                )
            )
        session.commit()

    if student is not None:
        with contextlib.suppress(Exception):
            when_str = email_service._format_when(booking.scheduled_at, tutor_tz)
            ctx = {
                "student_name": student.full_name or student.username or "there",
                "tutor_name": tutor.display_name,
                "when": when_str,
                "duration_minutes": booking.duration_minutes,
                "pack_name": pack.name,
                "classroom_url": classroom,
            }
            subject, body_html = email_templates.render(
                "booking_reminder_student", ctx, session=session, tutor=tutor
            )
            email_service.send_email(
                to=student.email,
                subject=subject,
                html=email_service._wrap(subject, body_html),
                reply_to=tutor.public_reply_email,
            )

    if tutor_user is not None:
        with contextlib.suppress(Exception):
            when_str = email_service._format_when(booking.scheduled_at, tutor_tz)
            student_display = (
                (student.full_name or student.username) if student else "A student"
            )
            ctx = {
                "student_name": student_display,
                "tutor_name": tutor_user.full_name or tutor.display_name,
                "when": when_str,
                "duration_minutes": booking.duration_minutes,
                "pack_name": pack.name,
                "dashboard_url": dashboard,
            }
            subject, body_html = email_templates.render(
                "booking_reminder_tutor", ctx, session=session, tutor=tutor
            )
            email_service.send_email(
                to=tutor_user.email,
                subject=subject,
                html=email_service._wrap(subject, body_html),
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
