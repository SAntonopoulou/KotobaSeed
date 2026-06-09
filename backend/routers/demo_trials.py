"""Admin-issued classroom trial accounts.

A trial account is a regular ``User`` row with three sentinel fields
set:

- ``is_demo_trial = True``
- ``demo_trial_minutes_remaining`` — hard cap that the classroom token
  mint path enforces (see ``tutor_site._mint_classroom_token``).
- ``demo_trial_expires_at`` — 7 days from creation. The auto-cleanup
  cron sweeps trials past this stamp.

The flow:

1. Admin POSTs to ``/admin/demo-trials`` with ``minutes`` and an
   optional ``label`` (e.g. "Maria from X language school").
2. We mint a random email + random 16-char password, create the User
   row with role STUDENT, hash the password, and return the plaintext
   credentials to the admin — they share them with the prospect.
3. The prospect signs in, sees their dashboard, and can join a
   pre-booked classroom session with whichever demo tutor we pair
   them with. The classroom token TTL is capped at
   ``demo_trial_minutes_remaining``, so a 10-min trial can't run for
   25 minutes.

The trial accounts don't appear in the marketplace (excluded by an
``is_demo_trial`` filter on user lookups), can't make paid bookings,
and can't post marketplace requests — all gated by the same flag.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_admin
from ..models import User, UserRole
from ..security import hash_password

router = APIRouter(prefix="/admin/demo-trials", tags=["admin", "demo-trials"])

PERIOD_TOTAL = "total"
PERIOD_MONTHLY = "monthly"


class DemoTrialCreate(BaseModel):
    minutes: int = Field(ge=1, le=60)
    label: str | None = Field(default=None, max_length=120)
    period: Literal["total", "monthly"] = "total"
    # Only consulted when period == "monthly": how many months until the
    # trial expires entirely. Ignored for total trials (fixed at 7 days).
    months: int = Field(default=1, ge=1, le=12)


class DemoTrialRead(BaseModel):
    id: int
    email: str
    label: str | None
    minutes_remaining: int
    minutes_allocated: int
    period: str
    period_anchor: datetime | None
    expires_at: datetime
    created_at: datetime
    created_by_admin_id: int | None


class DemoTrialCreated(DemoTrialRead):
    """Returned only at creation time — includes the plaintext password."""

    password: str


def _serialize(user: User) -> DemoTrialRead:
    return DemoTrialRead(
        id=user.id,
        email=user.email,
        label=user.demo_trial_label,
        minutes_remaining=user.demo_trial_minutes_remaining or 0,
        minutes_allocated=user.demo_trial_minutes_allocated
        or user.demo_trial_minutes_remaining
        or 0,
        period=user.demo_trial_period or PERIOD_TOTAL,
        period_anchor=user.demo_trial_period_anchor,
        expires_at=user.demo_trial_expires_at,
        created_at=user.created_at,
        created_by_admin_id=user.demo_trial_created_by_admin_id,
    )


@router.get("", response_model=list[DemoTrialRead])
def list_trials(
    current_user: Annotated[User, Depends(get_current_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> list[DemoTrialRead]:
    """All active demo trials. Expired ones are filtered out — the
    cleanup cron removes them on its next pass."""
    now = datetime.now(UTC)
    rows = session.exec(
        select(User)
        .where(
            User.is_demo_trial == True,  # noqa: E712
            User.deleted_at == None,  # noqa: E711
        )
        .order_by(User.created_at.desc())
    ).all()
    out: list[DemoTrialRead] = []
    for u in rows:
        expires = u.demo_trial_expires_at
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires is None or expires < now:
            continue
        out.append(_serialize(u))
    return out


@router.post("", response_model=DemoTrialCreated, status_code=status.HTTP_201_CREATED)
def create_trial(
    payload: DemoTrialCreate,
    current_user: Annotated[User, Depends(get_current_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> DemoTrialCreated:
    """Mint a fresh trial account.

    Email is randomised under ``@demo.kotobaseed.net`` so the prospect's
    real email is never exposed (and the admin doesn't have to type
    anything). Password is 16 random chars — surfaced once at creation.
    """
    now = datetime.now(UTC)
    handle = secrets.token_hex(6)
    plain_pw = secrets.token_urlsafe(12)
    email = f"trial-{handle}@demo.kotobaseed.net"
    if payload.period == PERIOD_MONTHLY:
        expires_at = now + timedelta(days=30 * payload.months)
    else:
        expires_at = now + timedelta(days=7)
    user = User(
        email=email,
        hashed_password=hash_password(plain_pw),
        full_name=payload.label or "Classroom trial",
        role=UserRole.STUDENT,
        is_active=True,
        # Trial users are pre-verified — they shouldn't have to verify
        # an email they don't own.
        email_verified_at=now,
        gdpr_consent_at=now,
        timezone="UTC",
        is_demo_trial=True,
        demo_trial_minutes_remaining=payload.minutes,
        demo_trial_minutes_allocated=payload.minutes,
        demo_trial_period=payload.period,
        demo_trial_period_anchor=now,
        demo_trial_expires_at=expires_at,
        demo_trial_label=payload.label,
        demo_trial_created_by_admin_id=current_user.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return DemoTrialCreated(
        **_serialize(user).model_dump(),
        password=plain_pw,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trial(
    user_id: int,
    current_user: Annotated[User, Depends(get_current_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Soft-delete a trial account. The cleanup cron will hard-delete
    it later; meanwhile the user can't log in (``is_active`` flips off)
    and the JWT on their device is invalidated."""
    user = session.get(User, user_id)
    if user is None or not user.is_demo_trial:
        raise HTTPException(status_code=404, detail="Demo trial not found.")
    user.is_active = False
    user.deleted_at = datetime.now(UTC)
    user.token_invalidation_at = datetime.now(UTC)
    session.add(user)
    session.commit()


def sweep_expired_trials(session: Session) -> int:
    """Cron-friendly cleanup. Hard-deletes trials past expiry.

    Idempotent: called once a day from the scheduler. Doesn't touch
    soft-deleted trials that were manually deleted by an admin
    earlier (they'll be hard-deleted on the next pass too).
    """
    now = datetime.now(UTC)
    rows = session.exec(
        select(User).where(
            User.is_demo_trial == True,  # noqa: E712
            User.demo_trial_expires_at < now,
        )
    ).all()
    n = 0
    for u in rows:
        session.delete(u)
        n += 1
    if n:
        session.commit()
    return n
