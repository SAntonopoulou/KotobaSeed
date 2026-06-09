"""Newsletter compose + broadcast + public unsubscribe endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from fastapi import Request
from ..config import settings
from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    Newsletter,
    NewsletterStatus,
    Tutor,
    TutorNewsletterSubscriber,
    User,
)
from ..services import email as email_service, email_templates
from ..services import newsletters as newsletters_service
from ..tenancy import CurrentTutor

router = APIRouter(tags=["newsletters"])


# --- Owner-side endpoints (tenant-scoped) ------------------------------


owner_router = APIRouter(prefix="/tutor/newsletters")


class NewsletterRead(BaseModel):
    id: int
    subject: str
    body_markdown: str
    status: NewsletterStatus
    sent_at: datetime | None
    recipient_count: int
    last_test_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NewsletterCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body_markdown: str = Field(default="", max_length=50_000)


class NewsletterUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    body_markdown: str | None = Field(default=None, max_length=50_000)


class AudienceCount(BaseModel):
    count: int


class TestSendRequest(BaseModel):
    recipient_email: EmailStr


class PreviewResponse(BaseModel):
    body_html: str


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _to_read(row: Newsletter) -> NewsletterRead:
    return NewsletterRead(
        id=row.id,
        subject=row.subject,
        body_markdown=row.body_markdown,
        status=row.status,
        sent_at=row.sent_at,
        recipient_count=row.recipient_count,
        last_test_sent_at=row.last_test_sent_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@owner_router.get("", response_model=list[NewsletterRead])
def list_newsletters(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[NewsletterRead]:
    _require_owner(tutor, current)
    rows = session.exec(
        select(Newsletter)
        .where(Newsletter.tutor_id == tutor.id, Newsletter.deleted_at.is_(None))
        .order_by(Newsletter.updated_at.desc())
    ).all()
    return [_to_read(r) for r in rows]


@owner_router.get("/audience-count", response_model=AudienceCount)
def get_audience_count(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> AudienceCount:
    """How many students would receive a broadcast right now."""
    _require_owner(tutor, current)
    return AudienceCount(count=newsletters_service.audience_count(tutor, session))


@owner_router.post(
    "", response_model=NewsletterRead, status_code=status.HTTP_201_CREATED
)
def create_draft(
    payload: NewsletterCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> NewsletterRead:
    _require_owner(tutor, current)
    row = Newsletter(
        tutor_id=tutor.id,
        subject=payload.subject,
        body_markdown=payload.body_markdown,
        status=NewsletterStatus.DRAFT,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@owner_router.patch("/{newsletter_id}", response_model=NewsletterRead)
def update_draft(
    newsletter_id: int,
    payload: NewsletterUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> NewsletterRead:
    _require_owner(tutor, current)
    row = session.get(Newsletter, newsletter_id)
    if row is None or row.tutor_id != tutor.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    if row.status == NewsletterStatus.SENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sent newsletters are immutable — duplicate it to start a new draft.",
        )
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(row, field, value)
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@owner_router.delete("/{newsletter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(
    newsletter_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Soft-delete a draft — sets deleted_at so the row can be restored."""
    _require_owner(tutor, current)
    row = session.get(Newsletter, newsletter_id)
    if row is None or row.tutor_id != tutor.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    if row.status == NewsletterStatus.SENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sent newsletters stay in history — they can't be deleted.",
        )
    row.deleted_at = datetime.now(UTC)
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()


@owner_router.post("/{newsletter_id}/restore", response_model=NewsletterRead)
def restore_draft(
    newsletter_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> NewsletterRead:
    """Restore a soft-deleted draft — backs the undo toast."""
    _require_owner(tutor, current)
    row = session.get(Newsletter, newsletter_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    if row.deleted_at is None:
        return _to_read(row)
    row.deleted_at = None
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@owner_router.post("/{newsletter_id}/preview", response_model=PreviewResponse)
def preview(
    newsletter_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PreviewResponse:
    """Render the body to HTML — what the recipient will see (minus the
    per-recipient unsubscribe link, which is added at send time)."""
    _require_owner(tutor, current)
    row = session.get(Newsletter, newsletter_id)
    if row is None or row.tutor_id != tutor.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    return PreviewResponse(
        body_html=email_templates._markdown_to_html(row.body_markdown),
    )


@owner_router.post("/{newsletter_id}/test", response_model=NewsletterRead)
def send_test(
    newsletter_id: int,
    payload: TestSendRequest,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> NewsletterRead:
    """Send to a single test address. Doesn't change status."""
    _require_owner(tutor, current)
    row = session.get(Newsletter, newsletter_id)
    if row is None or row.tutor_id != tutor.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    newsletters_service.send_test(
        row,
        tutor=tutor,
        recipient_email=str(payload.recipient_email),
        session=session,
    )
    session.refresh(row)
    return _to_read(row)


@owner_router.post("/{newsletter_id}/send", response_model=NewsletterRead)
def send_broadcast(
    newsletter_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> NewsletterRead:
    """Broadcast to the full audience. Idempotent only by virtue of the
    SENT-is-immutable rule — calling this on a SENT row returns 409."""
    _require_owner(tutor, current)
    row = session.get(Newsletter, newsletter_id)
    if row is None or row.tutor_id != tutor.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    if row.status == NewsletterStatus.SENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This newsletter has already been sent.",
        )
    newsletters_service.broadcast(row, tutor=tutor, session=session)
    session.refresh(row)
    return _to_read(row)


# --- Public unsubscribe endpoint (apex) --------------------------------


@router.get("/newsletters/unsubscribe")
def unsubscribe(
    token: Annotated[str, Query(min_length=1, max_length=200)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """Public, no auth — student clicks the link in their inbox. The
    token is HMAC-signed so nobody can unsubscribe another student.
    Idempotent: clicking twice returns the same friendly message."""
    parsed = newsletters_service.verify_unsubscribe_token(token)
    if parsed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That unsubscribe link is invalid or has expired.",
        )
    tutor_id, student_id = parsed
    # Defensive: the row must still exist; we don't reveal whether it does.
    newsletters_service.record_unsubscribe(tutor_id, student_id, session)
    return {
        "status": "unsubscribed",
        "message": "You won't receive any more newsletters from this tutor.",
    }


# --- Tutor-side CTA preferences -------------------------------------


class NewsletterPrefsRead(BaseModel):
    newsletter_enabled: bool
    newsletter_show_in_footer: bool
    newsletter_show_homepage_section: bool
    newsletter_cta_title: str | None
    newsletter_cta_description: str | None


class NewsletterPrefsUpdate(BaseModel):
    newsletter_enabled: bool | None = None
    newsletter_show_in_footer: bool | None = None
    newsletter_show_homepage_section: bool | None = None
    newsletter_cta_title: str | None = Field(default=None, max_length=120)
    newsletter_cta_description: str | None = Field(default=None, max_length=400)


def _prefs_to_read(tutor: Tutor) -> NewsletterPrefsRead:
    return NewsletterPrefsRead(
        newsletter_enabled=tutor.newsletter_enabled,
        newsletter_show_in_footer=tutor.newsletter_show_in_footer,
        newsletter_show_homepage_section=tutor.newsletter_show_homepage_section,
        newsletter_cta_title=tutor.newsletter_cta_title,
        newsletter_cta_description=tutor.newsletter_cta_description,
    )


@owner_router.get("/prefs", response_model=NewsletterPrefsRead)
def get_my_newsletter_prefs(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> NewsletterPrefsRead:
    _require_owner(tutor, current)
    return _prefs_to_read(tutor)


@owner_router.patch("/prefs", response_model=NewsletterPrefsRead)
def update_my_newsletter_prefs(
    payload: NewsletterPrefsUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> NewsletterPrefsRead:
    _require_owner(tutor, current)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tutor, key, value)
    session.add(tutor)
    session.commit()
    session.refresh(tutor)
    return _prefs_to_read(tutor)


# --- Public CTA endpoints -------------------------------------------


class PublicNewsletterPrefs(BaseModel):
    enabled: bool
    show_in_footer: bool
    show_homepage_section: bool
    cta_title: str
    cta_description: str
    tutor_display_name: str


@router.get(
    "/public/tutors/{tutor_slug}/newsletter-prefs",
    response_model=PublicNewsletterPrefs,
)
def get_public_newsletter_prefs(
    tutor_slug: str,
    session: Annotated[Session, Depends(get_session)],
) -> PublicNewsletterPrefs:
    """Themed pages call this to know whether/how to render the CTA."""
    tutor = session.exec(
        select(Tutor).where(Tutor.tutor_slug == tutor_slug)
    ).first()
    if tutor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tutor not found."
        )
    first_name = (tutor.display_name or "").split()[0] or tutor.display_name
    default_title = f"Stay in touch with {first_name}"
    default_description = (
        "Occasional notes, tips, and new lesson series. "
        "No spam, unsubscribe any time."
    )
    return PublicNewsletterPrefs(
        enabled=tutor.newsletter_enabled,
        show_in_footer=tutor.newsletter_show_in_footer,
        show_homepage_section=tutor.newsletter_show_homepage_section,
        cta_title=tutor.newsletter_cta_title or default_title,
        cta_description=tutor.newsletter_cta_description or default_description,
        tutor_display_name=tutor.display_name,
    )


class PublicSubscribePayload(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, max_length=120)
    # Explicit consent flag — required True. GDPR Article 6(1)(a).
    gdpr_consent: bool


class PublicSubscribeAck(BaseModel):
    status: str
    message: str


def _send_confirmation_email(
    tutor: Tutor, subscriber: TutorNewsletterSubscriber, token: str
) -> bool:
    confirm_url = newsletters_service.confirmation_url(
        tutor, subscriber.id, token
    )
    subject = f"Confirm your subscription to {tutor.display_name}"
    body_html = (
        f"<p>Hi{f' {subscriber.name}' if subscriber.name else ''},</p>"
        f"<p>Thanks for signing up for <strong>{tutor.display_name}</strong>'s newsletter. "
        f"Please confirm your email so we can add you to the list:</p>"
        f'<p style="margin:24px 0;"><a href="{confirm_url}" '
        f'style="background:#7c6f68;color:#fff;padding:12px 24px;'
        f'border-radius:6px;text-decoration:none;display:inline-block;">'
        f"Confirm subscription</a></p>"
        f"<p>If you didn't sign up, ignore this email and you won't hear from us.</p>"
    )
    return email_service.send_email(
        to=subscriber.email,
        subject=subject,
        html=email_service._wrap(subject, body_html),
        reply_to=tutor.public_reply_email,
    )


@router.post(
    "/public/tutors/{tutor_slug}/newsletter-subscribe",
    response_model=PublicSubscribeAck,
)
def public_newsletter_subscribe(
    tutor_slug: str,
    payload: PublicSubscribePayload,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> PublicSubscribeAck:
    """Public CTA endpoint. Creates a pending TutorNewsletterSubscriber
    and emails a confirmation link. Idempotent — re-subscribing a still-
    pending email refreshes the token + extends the TTL; re-subscribing
    a confirmed email is a no-op success."""
    if not payload.gdpr_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please confirm consent before subscribing.",
        )
    tutor = session.exec(
        select(Tutor).where(Tutor.tutor_slug == tutor_slug)
    ).first()
    if tutor is None or not tutor.newsletter_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This tutor isn't accepting newsletter signups.",
        )

    email_lower = payload.email.strip().lower()
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:400]
    now = datetime.now(UTC)

    existing = session.exec(
        select(TutorNewsletterSubscriber).where(
            TutorNewsletterSubscriber.tutor_id == tutor.id,
            TutorNewsletterSubscriber.email == email_lower,
        )
    ).first()
    if existing is not None and existing.confirmed_at is not None and existing.unsubscribed_at is None:
        return PublicSubscribeAck(
            status="already_subscribed",
            message="You're already on the list. Thanks!",
        )

    if existing is None:
        row = TutorNewsletterSubscriber(
            tutor_id=tutor.id,
            email=email_lower,
            name=(payload.name or None),
            ip=client_ip,
            user_agent=user_agent,
            created_at=now,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
    else:
        row = existing
        # Re-subscribe a previously-unsub'd email: clear unsub stamp so
        # the confirm-then-broadcast loop picks them back up.
        row.unsubscribed_at = None
        row.name = payload.name or row.name
        row.ip = client_ip
        row.user_agent = user_agent
        session.add(row)
        session.commit()

    raw_token = newsletters_service.make_confirmation_token(tutor.id, row.id)
    row.confirmation_token_hash = newsletters_service.hash_confirmation_token(raw_token)
    # 48-hour confirmation window. Anyone clicking after that gets a
    # friendly "request a new link" page rather than a stamped confirm.
    from datetime import timedelta
    row.confirmation_expires_at = now + timedelta(hours=48)
    session.add(row)
    session.commit()

    _send_confirmation_email(tutor, row, raw_token)
    return PublicSubscribeAck(
        status="confirmation_sent",
        message=(
            "Check your inbox for a confirmation link. "
            "It expires in 48 hours."
        ),
    )


@router.get("/newsletters/confirm")
def confirm_subscription(
    token: Annotated[str, Query(min_length=1, max_length=400)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """Click target of the confirmation link. Validates the HMAC token,
    cross-checks against the stored hash + TTL, stamps confirmed_at."""
    try:
        parts = token.split(".")
        if len(parts) != 4 or parts[0] != "confirm":
            raise ValueError("bad token shape")
        tutor_id = int(parts[1])
        subscriber_id = int(parts[2])
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That confirmation link is invalid.",
        )
    expected = newsletters_service.make_confirmation_token(tutor_id, subscriber_id)
    import hmac as _hmac
    if not _hmac.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That confirmation link is invalid.",
        )
    row = session.get(TutorNewsletterSubscriber, subscriber_id)
    if row is None or row.tutor_id != tutor_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found.",
        )
    now = datetime.now(UTC)
    if row.confirmation_expires_at and row.confirmation_expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That confirmation link has expired. Please subscribe again.",
        )
    expected_hash = newsletters_service.hash_confirmation_token(token)
    if row.confirmation_token_hash and row.confirmation_token_hash != expected_hash:
        # Token doesn't match the most recently issued one (likely
        # re-subscribed and trying an old link).
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That confirmation link has been superseded by a newer one.",
        )
    if row.confirmed_at is None:
        row.confirmed_at = now
    # Always clear the one-shot token + expiry so the link can't be reused.
    row.confirmation_token_hash = None
    row.confirmation_expires_at = None
    row.unsubscribed_at = None
    session.add(row)
    session.commit()
    return {
        "status": "confirmed",
        "message": "Your subscription is confirmed. Welcome!",
    }


@router.get("/newsletters/subscriber-unsubscribe")
def subscriber_unsubscribe(
    token: Annotated[str, Query(min_length=1, max_length=400)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    """Per-subscriber unsubscribe link from the broadcast footer."""
    parsed = newsletters_service.verify_subscriber_unsub_token(token)
    if parsed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That unsubscribe link is invalid or has expired.",
        )
    tutor_id, subscriber_id = parsed
    row = session.get(TutorNewsletterSubscriber, subscriber_id)
    if row is None or row.tutor_id != tutor_id:
        # Same friendly response either way to avoid leaking row existence.
        return {
            "status": "unsubscribed",
            "message": "You won't receive any more emails from this tutor.",
        }
    if row.unsubscribed_at is None:
        row.unsubscribed_at = datetime.now(UTC)
        session.add(row)
        session.commit()
    return {
        "status": "unsubscribed",
        "message": "You won't receive any more emails from this tutor.",
    }


# --- Inline image upload --------------------------------------------


NEWSLETTER_IMAGE_MAX_BYTES = 4 * 1024 * 1024  # 4 MB — same as avatars roughly
NEWSLETTER_IMAGE_ACCEPTED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


class NewsletterImageResponse(BaseModel):
    url: str


@owner_router.post("/upload-image", response_model=NewsletterImageResponse)
async def upload_newsletter_image(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    file: UploadFile = File(...),
) -> NewsletterImageResponse:
    """Upload an inline image for newsletter bodies.

    Stored on R2 under `newsletter-images/{tutor_id}/{rand}.{ext}` so a
    bucket policy can age them out independently of articles + avatars.
    """
    _require_owner(tutor, current)

    from ..services import storage

    if not storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image uploads aren't available on this deployment yet.",
        )
    if file.content_type not in NEWSLETTER_IMAGE_ACCEPTED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Please upload a JPEG, PNG, WebP, or GIF.",
        )
    raw = await file.read(NEWSLETTER_IMAGE_MAX_BYTES + 1)
    if len(raw) > NEWSLETTER_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image is too large — keep it under {NEWSLETTER_IMAGE_MAX_BYTES // (1024 * 1024)} MB.",
        )

    import secrets
    ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }[file.content_type]
    key = f"newsletter-images/{tutor.id}/{secrets.token_urlsafe(12)}.{ext}"
    url = storage.put_object(
        key=key, body=raw, content_type=file.content_type
    )
    return NewsletterImageResponse(url=url)


router.include_router(owner_router)
