"""Newsletter compose + broadcast + public unsubscribe endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import Newsletter, NewsletterStatus, Tutor, User
from ..services import email_templates, newsletters as newsletters_service
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
        .where(Newsletter.tutor_id == tutor.id)
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
    if row is None or row.tutor_id != tutor.id:
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
    _require_owner(tutor, current)
    row = session.get(Newsletter, newsletter_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    if row.status == NewsletterStatus.SENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sent newsletters stay in history — they can't be deleted.",
        )
    session.delete(row)
    session.commit()


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
    if row is None or row.tutor_id != tutor.id:
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
    if row is None or row.tutor_id != tutor.id:
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
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newsletter not found.")
    if row.status == NewsletterStatus.SENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This newsletter has already been sent.",
        )
    newsletters_service.broadcast(row, tutor=tutor, session=session)
    session.refresh(row)
    return _to_read(row)


router.include_router(owner_router)


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
