"""Per-tutor email template editing endpoints.

GET /tutor/email-templates → list of all templates with current values
(override if set, else platform default) + the placeholder catalog the
dashboard editor needs.

PUT /tutor/email-templates/{key} → upsert subject + body override.

DELETE /tutor/email-templates/{key} → revert to platform default.

POST /tutor/email-templates/{key}/preview → render with sample data so
the tutor can see what their email actually looks like before saving.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import Tutor, TutorEmailTemplate, User
from ..services import email_templates as email_templates_service
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/tutor/email-templates", tags=["email-templates"])


class EmailTemplateRead(BaseModel):
    key: str
    label: str
    description: str
    placeholders: list[str]
    subject: str  # current effective subject (override or default)
    body_markdown: str
    is_overridden: bool  # whether there's a tutor row backing this
    default_subject: str
    default_body_markdown: str


class EmailTemplateUpdate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body_markdown: str = Field(default="", max_length=20_000)


class EmailTemplatePreviewRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body_markdown: str = Field(default="", max_length=20_000)


class EmailTemplatePreviewResponse(BaseModel):
    subject: str
    body_html: str


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _overrides_by_key(
    tutor: Tutor, session: Session
) -> dict[str, TutorEmailTemplate]:
    rows = session.exec(
        select(TutorEmailTemplate).where(TutorEmailTemplate.tutor_id == tutor.id)
    ).all()
    return {r.template_key: r for r in rows}


@router.get("", response_model=list[EmailTemplateRead])
def list_templates(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[EmailTemplateRead]:
    _require_owner(tutor, current)
    overrides = _overrides_by_key(tutor, session)
    out: list[EmailTemplateRead] = []
    for defn in email_templates_service.DEFAULTS.values():
        override = overrides.get(defn.key)
        if override is not None:
            subject = override.subject
            body = override.body_markdown
            is_overridden = True
        else:
            subject = defn.default_subject
            body = defn.default_body_markdown
            is_overridden = False
        out.append(
            EmailTemplateRead(
                key=defn.key,
                label=defn.label,
                description=defn.description,
                placeholders=list(defn.placeholders),
                subject=subject,
                body_markdown=body,
                is_overridden=is_overridden,
                default_subject=defn.default_subject,
                default_body_markdown=defn.default_body_markdown,
            )
        )
    return out


@router.put("/{template_key}", response_model=EmailTemplateRead)
def upsert_template(
    template_key: str,
    payload: EmailTemplateUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> EmailTemplateRead:
    _require_owner(tutor, current)
    defn = email_templates_service.DEFAULTS.get(template_key)
    if defn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown email template.",
        )
    existing = session.exec(
        select(TutorEmailTemplate).where(
            TutorEmailTemplate.tutor_id == tutor.id,
            TutorEmailTemplate.template_key == template_key,
        )
    ).first()
    now = datetime.now(UTC)
    if existing is None:
        existing = TutorEmailTemplate(
            tutor_id=tutor.id,
            template_key=template_key,
            subject=payload.subject,
            body_markdown=payload.body_markdown,
        )
    else:
        existing.subject = payload.subject
        existing.body_markdown = payload.body_markdown
        existing.updated_at = now
    session.add(existing)
    session.commit()
    session.refresh(existing)
    return EmailTemplateRead(
        key=defn.key,
        label=defn.label,
        description=defn.description,
        placeholders=list(defn.placeholders),
        subject=existing.subject,
        body_markdown=existing.body_markdown,
        is_overridden=True,
        default_subject=defn.default_subject,
        default_body_markdown=defn.default_body_markdown,
    )


@router.delete("/{template_key}", status_code=status.HTTP_204_NO_CONTENT)
def revert_to_default(
    template_key: str,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    _require_owner(tutor, current)
    if template_key not in email_templates_service.DEFAULTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown email template.",
        )
    existing = session.exec(
        select(TutorEmailTemplate).where(
            TutorEmailTemplate.tutor_id == tutor.id,
            TutorEmailTemplate.template_key == template_key,
        )
    ).first()
    if existing is None:
        return
    session.delete(existing)
    session.commit()


def _sample_context_for(template_key: str, tutor: Tutor) -> dict[str, object]:
    """Build a fake context for preview rendering. Uses the tutor's actual
    display name + a generic student + a plausible date so the preview
    feels real."""
    sample_when = "Friday 14 February at 18:00 (UTC)"
    return {
        "student_name": "Sara",
        "tutor_name": tutor.display_name,
        "when": sample_when,
        "duration_minutes": 60,
        "pack_name": "Single lesson",
        "classroom_url": "https://example.kotobaseed.net/classroom/123",
    }


@router.post(
    "/{template_key}/preview", response_model=EmailTemplatePreviewResponse
)
def preview_template(
    template_key: str,
    payload: EmailTemplatePreviewRequest,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> EmailTemplatePreviewResponse:
    """Render the (unsaved) subject + body with sample data. Tutor uses
    this to preview their edits before clicking Save."""
    _require_owner(tutor, current)
    if template_key not in email_templates_service.DEFAULTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown email template.",
        )
    ctx = _sample_context_for(template_key, tutor)
    safe = email_templates_service.SafePlaceholderDict(ctx)
    subject = payload.subject.format_map(safe)
    filled = payload.body_markdown.format_map(safe)
    body_html = email_templates_service._markdown_to_html(filled)
    return EmailTemplatePreviewResponse(subject=subject, body_html=body_html)
