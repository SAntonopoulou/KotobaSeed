"""Per-tenant tutor-site endpoints.

GET /tutor/me is anonymous — public read of the tutor whose subdomain (or
custom domain) the request hit. PATCH /tutor/me requires the caller to be
the User who owns this Tutor.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session

from ..database import get_session
from ..deps import CurrentUser
from ..models import TutorAccountStatus, TutorPlan
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/tutor", tags=["tutor-site"])


class TutorRead(BaseModel):
    id: int
    tutor_slug: str
    display_name: str
    bio: str | None
    photo_url: str | None
    languages_taught: str | None
    languages_spoken: str | None
    public_reply_email: EmailStr | None
    plan: TutorPlan
    account_status: TutorAccountStatus
    custom_domain: str | None
    stripe_connect_account_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TutorUpdate(BaseModel):
    """Partial update — every field is optional. Only fields the tutor
    can edit themselves; account_status, plan, stripe_* etc. are managed
    via separate flows."""

    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=4000)
    photo_url: str | None = Field(default=None, max_length=2048)
    languages_taught: str | None = Field(default=None, max_length=255)
    languages_spoken: str | None = Field(default=None, max_length=255)
    public_reply_email: EmailStr | None = None


@router.get("/me", response_model=TutorRead)
def read_current_tutor(tutor: CurrentTutor) -> TutorRead:
    """Public — anything a student or visitor sees on the tutor's site."""
    return TutorRead.model_validate(tutor)


@router.patch("/me", response_model=TutorRead)
def update_current_tutor(
    payload: TutorUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TutorRead:
    """Tutor edits their own profile. Requires both:
    - a valid JWT (CurrentUser)
    - that user to be the owner of the resolved Tutor for this host
    """
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return TutorRead.model_validate(tutor)

    for key, value in changes.items():
        setattr(tutor, key, value)
    tutor.updated_at = datetime.now(UTC)
    session.add(tutor)
    session.commit()
    session.refresh(tutor)
    return TutorRead.model_validate(tutor)
