"""Newsletter audience computation, unsubscribe tokens, broadcast sending.

Audience definition: distinct students who have at least one non-cancelled
booking with this tutor. Excludes refunded bookings only if that's the
student's only booking with this tutor (a single refund doesn't kill the
relationship; a student with a refund AND a separate confirmed booking
still gets the newsletter). Simpler: keep refund check off — students
who refunded probably don't want more email anyway, so we exclude
REFUNDED and CANCELLED states from the filter.

Unsubscribe links are HMAC-signed `{tutor_id}.{student_id}.{sig}` tokens
verified server-side at /newsletters/unsubscribe. No login required — a
student clicking the link in their inbox always works. The signature
prevents anyone from unsubscribing a different student.
"""

from __future__ import annotations

import contextlib
import hashlib
import hmac
import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from urllib.parse import urlencode

from sqlmodel import Session, select

from ..config import settings
from ..models import (
    Booking,
    BookingStatus,
    Newsletter,
    NewsletterStatus,
    NewsletterUnsubscribe,
    Tutor,
    User,
)
from . import email as email_service, email_templates

log = logging.getLogger(__name__)


# --- Audience -----------------------------------------------------------


def audience_student_ids(tutor: Tutor, session: Session) -> list[int]:
    """Distinct student_user_ids who'll receive a newsletter from `tutor`.

    Engaged-booker rule: at least one booking in PENDING_PAYMENT, CONFIRMED,
    or COMPLETED. Excludes CANCELLED and REFUNDED (they showed disinterest;
    no point pushing more mail).
    """
    eligible_states = (
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.CONFIRMED,
        BookingStatus.COMPLETED,
    )
    booker_ids: set[int] = set(
        session.exec(
            select(Booking.student_user_id)
            .where(Booking.tutor_id == tutor.id)
            .where(Booking.status.in_(eligible_states))
            .distinct()
        ).all()
    )
    if not booker_ids:
        return []
    unsubbed: set[int] = set(
        session.exec(
            select(NewsletterUnsubscribe.student_user_id).where(
                NewsletterUnsubscribe.tutor_id == tutor.id,
                NewsletterUnsubscribe.student_user_id.in_(booker_ids),
            )
        ).all()
    )
    return sorted(booker_ids - unsubbed)


def audience_users(tutor: Tutor, session: Session) -> list[User]:
    """Fully-hydrated User rows for the audience — filters out users who
    are inactive (deleted/banned) or unverified (abandoned signups)."""
    ids = audience_student_ids(tutor, session)
    if not ids:
        return []
    rows = list(
        session.exec(
            select(User).where(
                User.id.in_(ids),
                User.is_active == True,  # noqa: E712
                User.email_verified_at != None,  # noqa: E711
            )
        ).all()
    )
    return rows


# --- Unsubscribe tokens ------------------------------------------------


def _unsub_secret() -> bytes:
    # Reuse the JWT secret — newsletter tokens are low-stakes and we don't
    # want yet another env var. If we ever rotate JWT secret, existing
    # unsubscribe links stop working; that's fine — clicking again
    # generates a fresh email with a fresh link.
    return settings.secret_key.encode("utf-8")


def make_unsubscribe_token(tutor_id: int, student_id: int) -> str:
    payload = f"{tutor_id}.{student_id}".encode()
    sig = hmac.new(_unsub_secret(), payload, hashlib.sha256).hexdigest()[:32]
    return f"{tutor_id}.{student_id}.{sig}"


def verify_unsubscribe_token(token: str) -> tuple[int, int] | None:
    """Return (tutor_id, student_id) on success, None on tamper/format error."""
    try:
        tutor_id_s, student_id_s, sig = token.split(".", 2)
        tutor_id = int(tutor_id_s)
        student_id = int(student_id_s)
    except (ValueError, AttributeError):
        return None
    expected = make_unsubscribe_token(tutor_id, student_id)
    if not hmac.compare_digest(token, expected):
        return None
    return (tutor_id, student_id)


def unsubscribe_url(tutor: Tutor, student_id: int) -> str:
    """Return the URL the student clicks. Lives on the apex so it works
    whether the tutor has a custom domain or not."""
    token = make_unsubscribe_token(tutor.id, student_id)
    frontend = settings.frontend_url.rstrip("/")
    query = urlencode({"token": token})
    return f"{frontend}/newsletters/unsubscribe?{query}"


# --- Send orchestration ------------------------------------------------


def _render_body(newsletter: Newsletter, *, tutor: Tutor, recipient: User) -> str:
    """Build the HTML body for one recipient — the markdown body + an
    unsubscribe footer with the per-recipient signed link."""
    body_html = email_templates._markdown_to_html(newsletter.body_markdown)
    unsub = unsubscribe_url(tutor, recipient.id)
    footer = (
        '<p style="margin-top:32px;padding-top:16px;border-top:1px solid #ece5dc;'
        'color:#7c6f68;font-size:12px;">'
        f"You're receiving this because you've booked with {tutor.display_name}. "
        f'<a href="{unsub}" style="color:#7c6f68;">Unsubscribe</a>.'
        "</p>"
    )
    return body_html + footer


def send_test(
    newsletter: Newsletter,
    *,
    tutor: Tutor,
    recipient_email: str,
    session: Session,
) -> bool:
    """Send to a single test address. Doesn't update the newsletter
    `status` — only `last_test_sent_at`. Returns whether the send succeeded."""
    body_html = email_templates._markdown_to_html(newsletter.body_markdown)
    footer = (
        '<p style="margin-top:32px;padding-top:16px;border-top:1px solid #ece5dc;'
        'color:#7c6f68;font-size:12px;">'
        f"This is a test send of a newsletter from {tutor.display_name}. "
        "Real recipients see a working unsubscribe link in this spot."
        "</p>"
    )
    ok = email_service.send_email(
        to=recipient_email,
        subject=f"[Test] {newsletter.subject}",
        html=email_service._wrap(newsletter.subject, body_html + footer),
        reply_to=tutor.public_reply_email,
    )
    newsletter.last_test_sent_at = datetime.now(UTC)
    session.add(newsletter)
    session.commit()
    return ok


def broadcast(
    newsletter: Newsletter,
    *,
    tutor: Tutor,
    session: Session,
) -> int:
    """Send the newsletter to every audience member. Marks status SENT and
    snapshots recipient_count. Failures per-recipient are swallowed so
    one bad address doesn't tank the whole batch."""
    recipients = audience_users(tutor, session)
    sent = 0
    for user in recipients:
        with contextlib.suppress(Exception):
            html = _render_body(newsletter, tutor=tutor, recipient=user)
            ok = email_service.send_email(
                to=user.email,
                subject=newsletter.subject,
                html=email_service._wrap(newsletter.subject, html),
                reply_to=tutor.public_reply_email,
            )
            if ok:
                sent += 1
    now = datetime.now(UTC)
    newsletter.status = NewsletterStatus.SENT
    newsletter.sent_at = now
    newsletter.recipient_count = len(recipients)
    newsletter.updated_at = now
    session.add(newsletter)
    session.commit()
    return sent


def record_unsubscribe(
    tutor_id: int, student_id: int, session: Session
) -> NewsletterUnsubscribe:
    """Idempotent — clicking the unsubscribe link twice doesn't error."""
    existing = session.exec(
        select(NewsletterUnsubscribe).where(
            NewsletterUnsubscribe.tutor_id == tutor_id,
            NewsletterUnsubscribe.student_user_id == student_id,
        )
    ).first()
    if existing is not None:
        return existing
    row = NewsletterUnsubscribe(tutor_id=tutor_id, student_user_id=student_id)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def already_unsubscribed(
    tutor_id: int, student_id: int, session: Session
) -> bool:
    return (
        session.exec(
            select(NewsletterUnsubscribe).where(
                NewsletterUnsubscribe.tutor_id == tutor_id,
                NewsletterUnsubscribe.student_user_id == student_id,
            )
        ).first()
        is not None
    )


# Used to type-check audience response without importing the User model.
def audience_count(tutor: Tutor, session: Session) -> int:
    return len(audience_users(tutor, session))


# Re-export iterables for convenience in tests.
def audience_emails(tutor: Tutor, session: Session) -> Iterable[str]:
    return [u.email for u in audience_users(tutor, session)]
