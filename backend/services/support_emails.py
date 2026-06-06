"""Support ticket email notifications.

Three transactional emails:
- New ticket → staff inbox (one of: platform.support_staff_inbox setting,
  platform.support_email setting, ADMIN_EMAIL env, none)
- Staff reply → ticket submitter
- Status change (resolved / closed) → ticket submitter

All send paths swallow exceptions — email is a side-channel and must never
prevent the underlying action from committing.
"""

from __future__ import annotations

import contextlib
import logging

from sqlmodel import Session

from ..config import settings
from ..models import SupportTicket, SupportTicketStatus
from . import email as email_service
from . import platform_settings

log = logging.getLogger(__name__)

# Setting key for the staff inbox address. Distinct from `platform.support_email`
# (which is the public address users see in the footer) — staff escalations
# can route to a different mailbox / group.
SETTING_STAFF_INBOX = "platform.support_staff_inbox"


def _staff_inbox(session: Session) -> str | None:
    """Resolve the staff notification address — checked in priority order
    so a per-deploy override always wins."""
    value = platform_settings.get_setting(session, SETTING_STAFF_INBOX)
    if isinstance(value, str) and value.strip():
        return value.strip()
    value = platform_settings.get_setting(
        session, platform_settings.SETTING_SUPPORT_EMAIL
    )
    if isinstance(value, str) and value.strip():
        return value.strip()
    return settings.admin_email or None


def _ticket_link(ticket_id: int, *, staff: bool) -> str:
    """Build a URL to the ticket detail page. Staff variant points at the
    staff queue; user variant points at /support/{id}."""
    frontend = settings.frontend_url.rstrip("/")
    if staff:
        return f"{frontend}/staff/support/{ticket_id}"
    return f"{frontend}/support/{ticket_id}"


def send_new_ticket_to_staff(session: Session, ticket: SupportTicket) -> None:
    """Notify staff of a freshly opened ticket. No-op if no inbox is set."""
    to = _staff_inbox(session)
    if not to:
        log.info("No staff inbox configured; skipping new-ticket notification.")
        return
    subject = f"[Kotobaseed support] #{ticket.id} · {ticket.subject}"
    link = _ticket_link(ticket.id, staff=True)
    body = (
        f"<p>A new support ticket was opened by <strong>"
        f"{ticket.submitted_by_name or ticket.submitted_by_email}</strong> "
        f"({ticket.submitted_by_email}).</p>"
        f"<p><strong>Category:</strong> {ticket.category.value}<br>"
        f"<strong>Priority:</strong> {ticket.priority.value}</p>"
        f"<p><strong>Subject:</strong> {ticket.subject}</p>"
        f"<p style='white-space:pre-wrap;'>{_escape(ticket.body)}</p>"
        f'<p style="margin:24px 0;"><a href="{link}" '
        'style="display:inline-block;background:#16561D;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">Open the ticket</a></p>'
    )
    with contextlib.suppress(Exception):
        email_service.send_email(
            to=to,
            subject=subject,
            html=email_service._wrap(subject, body),
        )


def send_reply_to_user(session: Session, ticket: SupportTicket, body_text: str) -> None:
    """Tell the user staff replied. Uses the submitter's email snapshot so
    the email still resolves even if the user later deletes their account."""
    if not ticket.submitted_by_email:
        return
    subject = f"Reply on your Kotobaseed ticket #{ticket.id}"
    link = _ticket_link(ticket.id, staff=False)
    body = (
        f"<p>Hi {ticket.submitted_by_name or 'there'},</p>"
        f"<p>The Kotobaseed support team replied to your ticket "
        f"<strong>{ticket.subject}</strong>:</p>"
        f"<blockquote style='border-left:3px solid #D6A42F;padding-left:16px;"
        f"margin:16px 0;white-space:pre-wrap;'>{_escape(body_text)}</blockquote>"
        f'<p style="margin:24px 0;"><a href="{link}" '
        'style="display:inline-block;background:#16561D;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">View ticket</a></p>'
        "<p>You can reply directly on the ticket page to continue the conversation.</p>"
    )
    with contextlib.suppress(Exception):
        email_service.send_email(
            to=ticket.submitted_by_email,
            subject=subject,
            html=email_service._wrap(subject, body),
        )


def send_status_change_to_user(
    session: Session,
    ticket: SupportTicket,
    new_status: SupportTicketStatus,
) -> None:
    """Notify the user when their ticket is resolved or closed."""
    if not ticket.submitted_by_email:
        return
    # Only the two terminal-ish states get an email; in_progress / escalated
    # are internal workflow noise from the user's perspective.
    if new_status not in (SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED):
        return
    pretty = "resolved" if new_status == SupportTicketStatus.RESOLVED else "closed"
    subject = f"Your Kotobaseed ticket #{ticket.id} was {pretty}"
    link = _ticket_link(ticket.id, staff=False)
    follow_up = (
        "If something's still not right, just reply on the ticket and we'll reopen it."
        if new_status == SupportTicketStatus.RESOLVED
        else "If you need more help, please open a new ticket — this one is closed."
    )
    body = (
        f"<p>Hi {ticket.submitted_by_name or 'there'},</p>"
        f"<p>Your support ticket <strong>{ticket.subject}</strong> was marked "
        f"<strong>{pretty}</strong>.</p>"
        f"<p>{follow_up}</p>"
        f'<p style="margin:24px 0;"><a href="{link}" '
        'style="display:inline-block;background:#16561D;color:#ffffff;'
        'padding:12px 24px;border-radius:6px;text-decoration:none;'
        'font-weight:600;">View ticket</a></p>'
    )
    with contextlib.suppress(Exception):
        email_service.send_email(
            to=ticket.submitted_by_email,
            subject=subject,
            html=email_service._wrap(subject, body),
        )


def _escape(text: str) -> str:
    """Minimal HTML escape. Resend renders raw HTML, so untrusted input
    needs neutralising before it hits the body."""
    import html as _html

    return _html.escape(text or "")
