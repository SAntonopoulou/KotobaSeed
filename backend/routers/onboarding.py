"""Tutor onboarding — the kotobaseed.net signup → Stripe Connect KYC flow.

Endpoints:
- POST /onboarding/tutor               sign up + create Connect account
- POST /onboarding/tutor/refresh-link  re-issue Stripe-hosted KYC link
- GET  /onboarding/tutor/status        current Tutor.account_status + flags

The signup endpoint runs three steps in this order:
1. Create + commit the User row (gives us a stable id for the Tutor FK).
2. Create the Stripe Connect Express account (network call — can fail).
3. Create + commit the Tutor row referencing both.

If step 2 fails, the User row stays — they can retry signup via a
"finish onboarding" endpoint (not built in this step; a stranded User
can also just re-register since email-based dedupe will catch them).
If step 3 fails the Connect account would leak — log it and surface to
admin. Acceptable for v1; revisit when we add background jobs.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import CurrentUser
from ..models import Tutor, TutorAccountStatus, TutorPlan, User, UserRole
from ..routers.auth import EMAIL_CODE_TTL_MINUTES, _issue_email_code
from ..security import client_ip, create_access_token, hash_password
from ..services.email import send_verification_code
from ..services.stripe_connect import create_express_account, create_onboarding_link

log = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

# DNS-safe slug: 3–60 chars, lowercase alphanumerics + interior hyphens.
_SLUG_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])?$")


def _validate_slug(slug: str) -> str:
    """Normalize + validate. Raises 400 on bad input."""
    candidate = slug.strip().lower()
    if not _SLUG_RE.fullmatch(candidate):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug must be 3–60 chars, lowercase letters/numbers/hyphens, no leading or trailing hyphen.",
        )
    if candidate in settings.reserved_subdomain_set:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"`{candidate}` is reserved.",
        )
    return candidate


# --- Schemas ----------------------------------------------------------------


class TutorSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    tutor_slug: str = Field(min_length=3, max_length=60)
    display_name: str = Field(min_length=1, max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    languages_taught: str | None = None
    gdpr_consent: bool
    country: str | None = Field(default=None, max_length=2)


class TutorSignupResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    tutor_id: int
    tutor_slug: str
    onboarding_url: str


class OnboardingStatus(BaseModel):
    tutor_id: int
    tutor_slug: str
    account_status: TutorAccountStatus
    stripe_connect_account_id: str
    onboarding_complete: bool

    model_config = {"from_attributes": True}


class RefreshLinkResponse(BaseModel):
    onboarding_url: str


# --- Endpoints --------------------------------------------------------------


@router.post(
    "/tutor",
    response_model=TutorSignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup_tutor(
    payload: TutorSignupRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> TutorSignupResponse:
    if not payload.gdpr_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GDPR consent is required to create an account.",
        )

    slug = _validate_slug(payload.tutor_slug)
    email = payload.email.lower().strip()

    # Dedup checks before any Stripe call to avoid orphaned Connect accounts.
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    if session.exec(select(Tutor).where(Tutor.tutor_slug == slug)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"`{slug}` is taken.",
        )

    now = datetime.now(UTC)

    # Step 1: User
    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=UserRole.TEACHER,
        is_active=True,
        timezone=payload.timezone or "UTC",
        gdpr_consent_at=now,
        gdpr_consent_ip=client_ip(request),
    )
    code = _issue_email_code(user)
    session.add(user)
    session.commit()
    session.refresh(user)

    # Step 2: Stripe Connect account
    try:
        connect_account_id = create_express_account(
            email=email,
            country=payload.country or settings.default_connect_country,
        )
    except stripe.error.StripeError:
        log.exception("Stripe Connect account creation failed for %s", email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not provision Stripe account. Try again in a moment.",
        ) from None

    # Step 3: Tutor row + onboarding link. New tutors start on Starter; Pro
    # upgrade happens later through subscription checkout.
    tutor = Tutor(
        user_id=user.id,
        tutor_slug=slug,
        display_name=payload.display_name.strip(),
        languages_taught=payload.languages_taught,
        plan=TutorPlan.STARTER,
        account_status=TutorAccountStatus.PAUSED_KYC,
        classroom_minutes_quota=300,
        stripe_connect_account_id=connect_account_id,
    )
    session.add(tutor)
    session.commit()
    session.refresh(tutor)

    try:
        onboarding_url = create_onboarding_link(account_id=connect_account_id)
    except stripe.error.StripeError:
        log.exception("AccountLink creation failed for %s (acct %s)", email, connect_account_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Account created, but onboarding link failed. Use refresh-link to retry.",
        ) from None

    # Verification email — non-blocking; log only on failure.
    try:
        send_verification_code(
            to_email=user.email,
            full_name=user.full_name,
            code=code,
            expires_minutes=EMAIL_CODE_TTL_MINUTES,
        )
    except Exception:
        log.exception("Could not send verification code at tutor signup for %s", user.email)

    token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TutorSignupResponse(
        access_token=token,
        expires_in_minutes=settings.access_token_expire_minutes,
        tutor_id=tutor.id,
        tutor_slug=tutor.tutor_slug,
        onboarding_url=onboarding_url,
    )


def _tutor_for_user(current: User, session: Session) -> Tutor:
    tutor = session.exec(select(Tutor).where(Tutor.user_id == current.id)).first()
    if tutor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You don't have a tutor profile.",
        )
    return tutor


@router.post("/tutor/refresh-link", response_model=RefreshLinkResponse)
def refresh_onboarding_link(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> RefreshLinkResponse:
    tutor = _tutor_for_user(current, session)
    if not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No Stripe account attached to this tutor.",
        )
    try:
        url = create_onboarding_link(account_id=tutor.stripe_connect_account_id)
    except stripe.error.StripeError:
        log.exception(
            "AccountLink refresh failed for tutor %s (acct %s)",
            tutor.tutor_slug,
            tutor.stripe_connect_account_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not refresh onboarding link. Try again in a moment.",
        ) from None
    return RefreshLinkResponse(onboarding_url=url)


@router.get("/tutor/status", response_model=OnboardingStatus)
def onboarding_status(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> OnboardingStatus:
    tutor = _tutor_for_user(current, session)
    return OnboardingStatus(
        tutor_id=tutor.id,
        tutor_slug=tutor.tutor_slug,
        account_status=tutor.account_status,
        stripe_connect_account_id=tutor.stripe_connect_account_id or "",
        onboarding_complete=tutor.account_status != TutorAccountStatus.PAUSED_KYC,
    )
