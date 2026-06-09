"""Tutor onboarding tutorial — progress tracking only.

The wizard UX, module catalogue, and copy all live on the frontend. The
backend's only job is to remember:
- Which module keys the tutor has marked complete
- Which module they last opened (for "Continue where you left off")
- A timestamp so a future "haven't touched it in N days" nudge can fire

Restart simply wipes both lists and stamps a new started_at — the row
itself is preserved so the count of how often a tutor revisited remains
auditable.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import Tutor, TutorOnboardingProgress, User
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(prefix="/tutor/onboarding", tags=["tutor-onboarding"])


class OnboardingProgressRead(BaseModel):
    completed_module_keys: list[str]
    last_viewed_module_key: str | None
    started_at: datetime
    last_viewed_at: datetime
    completed_at: datetime | None


class OnboardingAction(BaseModel):
    """Single-action API — the frontend posts one of these per click.

    - `complete` adds the module key to the completed list (idempotent)
    - `view` records that the tutor opened a module (drives resume)
    - `restart` wipes the completed list + last_viewed so the wizard
      starts at the first module again
    """

    action: Literal["complete", "view", "restart"]
    module_key: str | None = Field(default=None, max_length=64)


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _load_or_create(tutor_id: int, session: Session) -> TutorOnboardingProgress:
    row = session.exec(
        select(TutorOnboardingProgress).where(
            TutorOnboardingProgress.tutor_id == tutor_id
        )
    ).first()
    if row is not None:
        return row
    row = TutorOnboardingProgress(tutor_id=tutor_id)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _decode_keys(raw: str) -> list[str]:
    try:
        parsed = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return [str(k) for k in parsed if isinstance(k, str)]


def _serialize(row: TutorOnboardingProgress) -> OnboardingProgressRead:
    return OnboardingProgressRead(
        completed_module_keys=_decode_keys(row.completed_module_keys_json),
        last_viewed_module_key=row.last_viewed_module_key,
        started_at=row.started_at,
        last_viewed_at=row.last_viewed_at,
        completed_at=row.completed_at,
    )


@router.get("/progress", response_model=OnboardingProgressRead)
def read_progress(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> OnboardingProgressRead:
    """Owner — current onboarding state. Auto-creates the row on first
    read so the wizard always has something to display."""
    _require_owner(tutor, current)
    row = _load_or_create(tutor.id, session)
    return _serialize(row)


@router.post("/progress", response_model=OnboardingProgressRead)
def update_progress(
    payload: OnboardingAction,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    total_modules: int = 1,
) -> OnboardingProgressRead:
    """Owner — apply a single action to the tutor's onboarding state.

    `total_modules` is supplied by the frontend so we can detect when the
    tutor has finished every module and stamp `completed_at`. We never
    auto-clear `completed_at` even if the catalogue grows — restart is
    the explicit lever for that.
    """
    _require_owner(tutor, current)
    row = _load_or_create(tutor.id, session)
    now = datetime.now(UTC)

    if payload.action == "restart":
        row.completed_module_keys_json = "[]"
        row.last_viewed_module_key = None
        row.started_at = now
        row.last_viewed_at = now
        row.completed_at = None
    else:
        if not payload.module_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="module_key is required for view + complete.",
            )
        completed = _decode_keys(row.completed_module_keys_json)
        if payload.action == "complete" and payload.module_key not in completed:
            completed.append(payload.module_key)
            row.completed_module_keys_json = json.dumps(completed)
        row.last_viewed_module_key = payload.module_key
        row.last_viewed_at = now
        # Stamp completion only when the count meets the catalogue size —
        # protects us if a module is added later (row stays "complete"
        # until the tutor restarts).
        if (
            row.completed_at is None
            and total_modules > 0
            and len(completed) >= total_modules
        ):
            row.completed_at = now

    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize(row)
