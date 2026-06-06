"""Resend-backed email sender for transactional mail.

Every public helper is safe to call when RESEND_API_KEY is unset — it no-ops
with an info log line so local dev never chokes on missing credentials. Sends
never propagate exceptions either; everything returns a bool so callers don't
need to wrap individual sends in try/except.

Multi-tenant note: tutor-scoped templates with per-tutor branding land in a
later phase. For now the platform sends platform-branded mail (verification,
password reset, etc.) — anything tutor-facing will gain a tutor argument and
pull branding from the Tutor row.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence

import resend

from ..config import settings

log = logging.getLogger(__name__)

_initialized = False


def _ensure_initialized() -> bool:
    global _initialized
    if not settings.resend_api_key:
        return False
    if not _initialized:
        resend.api_key = settings.resend_api_key
        _initialized = True
    return True


def from_address() -> str:
    name = settings.resend_from_name or "Kotobaseed"
    return f"{name} <{settings.resend_from_email}>"


def send_email(
    *,
    to: Sequence[str] | str,
    subject: str,
    html: str,
    reply_to: str | None = None,
) -> bool:
    if not _ensure_initialized():
        log.info("Resend not configured; would send to=%s subject=%r", to, subject)
        return False
    payload: dict = {
        "from": from_address(),
        "to": [to] if isinstance(to, str) else list(to),
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    try:
        resend.Emails.send(payload)
        return True
    except Exception:
        log.exception("Resend send failed (to=%s subject=%r)", to, subject)
        return False


def _wrap(title: str, body_html: str) -> str:
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        f"<title>{title}</title></head>"
        '<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'
        '\'Segoe UI\',Roboto,sans-serif;background:#f7f5f2;color:#2a2725;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">'
        '<tr><td align="center" style="padding:24px;">'
        '<table role="presentation" width="600" cellspacing="0" cellpadding="0" '
        'style="background:#ffffff;border-radius:8px;padding:32px;max-width:600px;">'
        f"<tr><td>{body_html}</td></tr>"
        '<tr><td style="padding-top:24px;border-top:1px solid #ece5dc;'
        'color:#7c6f68;font-size:12px;">'
        "Kotobaseed · "
        '<a href="https://kotobaseed.net" style="color:#7c6f68;">kotobaseed.net</a>'
        "</td></tr></table></td></tr></table></body></html>"
    )


def send_verification_code(
    *,
    to_email: str,
    full_name: str,
    code: str,
    expires_minutes: int = 15,
) -> bool:
    first_name = full_name.split()[0] if full_name else "there"
    subject = "Your Kotobaseed verification code"
    body = (
        f"<p>Hi {first_name},</p>"
        "<p>Use the code below to finish setting up your Kotobaseed account:</p>"
        f'<p style="font-size:28px;letter-spacing:6px;font-weight:600;'
        f'background:#f7f5f2;padding:16px 24px;border-radius:6px;'
        f'display:inline-block;">{code}</p>'
        f"<p>The code expires in {expires_minutes} minutes. If you didn't sign up, "
        "you can ignore this email.</p>"
    )
    return send_email(to=to_email, subject=subject, html=_wrap(subject, body))


def send_password_reset(
    *,
    to_email: str,
    full_name: str,
    token: str,
    expires_minutes: int = 60,
) -> bool:
    """Email the password reset link. The token is opaque and large; we
    build the URL against `settings.frontend_url` and include the email
    too so the reset page has both pieces it needs."""
    first_name = full_name.split()[0] if full_name else "there"
    subject = "Reset your Kotobaseed password"
    frontend = settings.frontend_url.rstrip("/")
    # URL-encode minimally — token is already URL-safe (token_urlsafe), the
    # email gets normalised by the frontend before submission.
    reset_url = (
        f"{frontend}/reset-password"
        f"?email={to_email}&token={token}"
    )
    body = (
        f"<p>Hi {first_name},</p>"
        "<p>You asked to reset your Kotobaseed password. Click the button "
        "below to set a new one:</p>"
        f'<p style="margin:24px 0;"><a href="{reset_url}" '
        'style="display:inline-block;background:#16561D;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">Reset password</a></p>'
        f"<p>This link expires in {expires_minutes} minutes. If you didn't "
        "ask to reset your password, you can safely ignore this email — your "
        "password stays unchanged.</p>"
        '<p style="font-size:12px;color:#6b6660;margin-top:24px;">'
        "If the button doesn't work, copy and paste this URL into your browser:"
        f'<br><span style="word-break:break-all;">{reset_url}</span></p>'
    )
    return send_email(to=to_email, subject=subject, html=_wrap(subject, body))


def _first_name(full_name: str | None) -> str:
    if not full_name:
        return "there"
    return full_name.split()[0]


def _format_when(scheduled_at, tz_name: str | None) -> str:
    """Render a booking time in the recipient's timezone if known, else UTC.

    Resend doesn't do per-recipient locales, so we just pick the most
    intuitive single string — the tutor's timezone is a fine default
    because the tutor is the one who scheduled their availability there,
    and most students booking will be in the same general region.
    """
    from datetime import UTC
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    when = scheduled_at
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    tz = None
    if tz_name:
        try:
            tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            tz = None
    if tz is not None:
        when = when.astimezone(tz)
        return when.strftime("%A %d %B at %H:%M") + f" ({tz_name})"
    return when.strftime("%A %d %B at %H:%M UTC")


def send_booking_confirmation_student(
    *,
    to_email: str,
    student_name: str,
    tutor_display_name: str,
    pack_name: str,
    scheduled_at,
    duration_minutes: int,
    classroom_url: str,
    tutor_timezone: str | None = None,
    is_trial: bool = False,
    reply_to: str | None = None,
) -> bool:
    when = _format_when(scheduled_at, tutor_timezone)
    headline = (
        "Your free trial is booked"
        if is_trial
        else f"Your lesson with {tutor_display_name} is confirmed"
    )
    subject = headline
    body = (
        f"<p>Hi {_first_name(student_name)},</p>"
        f"<p>{headline} for <strong>{when}</strong> "
        f"({duration_minutes} minutes).</p>"
        f"<p><strong>Pack:</strong> {pack_name}</p>"
        f'<p style="margin:24px 0;"><a href="{classroom_url}" '
        'style="display:inline-block;background:#2a6e3f;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">Join the classroom</a></p>'
        "<p>The classroom opens 15 minutes before your lesson. We'll send a "
        "reminder roughly a day before too.</p>"
    )
    return send_email(
        to=to_email,
        subject=subject,
        html=_wrap(subject, body),
        reply_to=reply_to,
    )


def send_booking_confirmation_tutor(
    *,
    to_email: str,
    tutor_name: str,
    student_display_name: str,
    pack_name: str,
    scheduled_at,
    duration_minutes: int,
    dashboard_url: str,
    tutor_timezone: str | None = None,
    is_trial: bool = False,
) -> bool:
    when = _format_when(scheduled_at, tutor_timezone)
    kind = "free trial" if is_trial else "lesson"
    subject = f"New {kind} booked: {student_display_name}, {when.split(' at ')[0]}"
    body = (
        f"<p>Hi {_first_name(tutor_name)},</p>"
        f"<p><strong>{student_display_name}</strong> booked a {kind} with you "
        f"for <strong>{when}</strong> ({duration_minutes} minutes).</p>"
        f"<p><strong>Pack:</strong> {pack_name}</p>"
        f'<p style="margin:24px 0;"><a href="{dashboard_url}" '
        'style="display:inline-block;background:#2a6e3f;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">Open your dashboard</a></p>'
    )
    return send_email(to=to_email, subject=subject, html=_wrap(subject, body))


def send_booking_reminder_student(
    *,
    to_email: str,
    student_name: str,
    tutor_display_name: str,
    scheduled_at,
    duration_minutes: int,
    classroom_url: str,
    tutor_timezone: str | None = None,
    reply_to: str | None = None,
) -> bool:
    when = _format_when(scheduled_at, tutor_timezone)
    subject = f"Tomorrow: your lesson with {tutor_display_name}"
    body = (
        f"<p>Hi {_first_name(student_name)},</p>"
        f"<p>Quick reminder — you have a lesson with "
        f"<strong>{tutor_display_name}</strong> at <strong>{when}</strong> "
        f"({duration_minutes} minutes).</p>"
        f'<p style="margin:24px 0;"><a href="{classroom_url}" '
        'style="display:inline-block;background:#2a6e3f;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">Join the classroom</a></p>'
        "<p>The classroom opens 15 minutes before the lesson starts.</p>"
    )
    return send_email(
        to=to_email,
        subject=subject,
        html=_wrap(subject, body),
        reply_to=reply_to,
    )


def send_booking_reminder_tutor(
    *,
    to_email: str,
    tutor_name: str,
    student_display_name: str,
    scheduled_at,
    duration_minutes: int,
    dashboard_url: str,
    tutor_timezone: str | None = None,
) -> bool:
    when = _format_when(scheduled_at, tutor_timezone)
    subject = f"Tomorrow: lesson with {student_display_name}"
    body = (
        f"<p>Hi {_first_name(tutor_name)},</p>"
        f"<p>You have a lesson with <strong>{student_display_name}</strong> "
        f"at <strong>{when}</strong> ({duration_minutes} minutes).</p>"
        f'<p style="margin:24px 0;"><a href="{dashboard_url}" '
        'style="display:inline-block;background:#2a6e3f;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">Open your dashboard</a></p>'
    )
    return send_email(to=to_email, subject=subject, html=_wrap(subject, body))
