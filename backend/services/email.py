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
