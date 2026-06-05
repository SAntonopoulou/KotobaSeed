"""Per-tenant tutor-site endpoints.

GET /tutor/me is anonymous — public read of the tutor whose subdomain (or
custom domain) the request hit. PATCH /tutor/me requires the caller to be
the User who owns this Tutor.

Identity (bio, photo, languages) lives on User as a single source of truth
shared with the marketplace profile. Tutor-only fields (display_name,
public_reply_email, plan, etc.) live on Tutor. The TutorRead response
folds both together so the frontend sees one coherent shape.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session

from ..database import get_session
from ..deps import CurrentUser
from ..models import Tutor, TutorAccountStatus, TutorPlan
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/tutor", tags=["tutor-site"])


class TutorRead(BaseModel):
    id: int
    tutor_slug: str
    display_name: str
    # Identity fields — populated from tutor.user (single source).
    bio: str | None
    photo_url: str | None
    languages_taught: str | None
    # Tutor-only fields.
    public_reply_email: EmailStr | None
    plan: TutorPlan
    account_status: TutorAccountStatus
    custom_domain: str | None
    stripe_connect_account_id: str | None
    created_at: datetime


def _serialize_tutor(tutor: Tutor) -> TutorRead:
    """Fold User identity fields into the TutorRead response."""
    user = tutor.user  # eager-loaded via the Tutor.user relationship
    return TutorRead(
        id=tutor.id,
        tutor_slug=tutor.tutor_slug,
        display_name=tutor.display_name,
        bio=user.bio if user else None,
        photo_url=user.avatar_url if user else None,
        languages_taught=user.languages if user else None,
        public_reply_email=tutor.public_reply_email,
        plan=tutor.plan,
        account_status=tutor.account_status,
        custom_domain=tutor.custom_domain,
        stripe_connect_account_id=tutor.stripe_connect_account_id,
        created_at=tutor.created_at,
    )


class TutorUpdate(BaseModel):
    """Partial update — every field is optional.

    Identity fields (bio, photo_url, languages_taught) write through to the
    underlying User row so the marketplace profile stays in sync. Tutor-only
    fields (display_name, public_reply_email) write to the Tutor row.
    """

    # Tutor-side
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    public_reply_email: EmailStr | None = None
    # User-side (single identity source)
    bio: str | None = Field(default=None, max_length=4000)
    photo_url: str | None = Field(default=None, max_length=2048)
    languages_taught: str | None = Field(default=None, max_length=255)


@router.get("/me", response_model=TutorRead)
def read_current_tutor(tutor: CurrentTutor) -> TutorRead:
    """Public — anything a student or visitor sees on the tutor's site."""
    return _serialize_tutor(tutor)


@router.patch("/me", response_model=TutorRead)
def update_current_tutor(
    payload: TutorUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TutorRead:
    """Tutor edits their own profile. Requires both a valid JWT and that
    the user be the owner of the resolved Tutor for this host.

    Identity fields update User; tutor-only fields update Tutor. Both rows
    update in a single commit so the response always reflects the final
    state.
    """
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return _serialize_tutor(tutor)

    now = datetime.now(UTC)
    tutor_dirty = False
    user_dirty = False

    # Tutor-side fields
    if "display_name" in changes:
        tutor.display_name = changes["display_name"]
        tutor_dirty = True
    if "public_reply_email" in changes:
        tutor.public_reply_email = changes["public_reply_email"]
        tutor_dirty = True

    # User-side identity fields (single source — shared with marketplace profile)
    if "bio" in changes:
        current.bio = changes["bio"]
        user_dirty = True
    if "photo_url" in changes:
        current.avatar_url = changes["photo_url"]
        user_dirty = True
    if "languages_taught" in changes:
        current.languages = changes["languages_taught"]
        user_dirty = True

    if tutor_dirty:
        tutor.updated_at = now
        session.add(tutor)
    if user_dirty:
        current.updated_at = now
        session.add(current)
    if tutor_dirty or user_dirty:
        session.commit()
        session.refresh(tutor)
        session.refresh(current)
    return _serialize_tutor(tutor)
