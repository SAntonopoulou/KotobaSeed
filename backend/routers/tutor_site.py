"""Per-tenant tutor-site endpoints.

Every route here uses `CurrentTutor` — they 404 when the request resolves
to no tenant (the apex, reserved subdomains, or an unknown host).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

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
    plan: TutorPlan
    account_status: TutorAccountStatus
    custom_domain: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/me", response_model=TutorRead)
def read_current_tutor(tutor: CurrentTutor) -> TutorRead:
    """Return the Tutor whose subdomain or custom domain this request hit."""
    return TutorRead.model_validate(tutor)
