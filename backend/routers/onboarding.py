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
from ..deps import CurrentUser, get_current_user_optional
from ..models import Tutor, TutorAccountStatus, TutorPlan, User, UserRole
from ..routers.auth import EMAIL_CODE_TTL_MINUTES, _issue_email_code
from ..security import client_ip, create_access_token, hash_password
from ..services.email import send_verification_code
from ..services.stripe_connect import (
    create_express_account,
    create_onboarding_link,
    fetch_account,
)

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
    """Signup payload.

    `email`, `password`, `full_name`, and `gdpr_consent` are only used when
    the caller is NOT authenticated (a brand-new visitor signing up directly
    as a tutor). When the caller IS authenticated (e.g. a creator clicking
    "Get my tutor site" from their dashboard) those fields are ignored —
    we use the existing User row.
    """

    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    tutor_slug: str = Field(min_length=3, max_length=60)
    display_name: str = Field(min_length=1, max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    languages_taught: str | None = None
    gdpr_consent: bool | None = None
    country: str | None = Field(default=None, max_length=2)
    ref_code: str | None = Field(default=None, max_length=32)


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
    existing_user: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> TutorSignupResponse:
    """Atomic tutor signup with three branches:

    1. Authenticated caller (e.g. a Creator clicking "Get my tutor site")
       — use the existing User row, just add a Tutor + Connect account.
    2. Unauthenticated caller with email/password — create User + Tutor +
       Connect (this is the original flow).
    3. Invalid (missing email when unauthenticated) — 400.

    Slug uniqueness, GDPR consent (only on new-user branch), and Stripe-
    first ordering apply identically to both.
    """
    slug = _validate_slug(payload.tutor_slug)

    # Slug uniqueness check applies in both branches.
    if session.exec(select(Tutor).where(Tutor.tutor_slug == slug)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"`{slug}` is taken.",
        )

    if existing_user is not None:
        # --- Branch 1: logged-in creator upgrading to a tutor site ----------
        if session.exec(select(Tutor).where(Tutor.user_id == existing_user.id)).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You already have a tutor site.",
            )
        email = existing_user.email
    else:
        # --- Branch 2: brand-new account ------------------------------------
        if not payload.gdpr_consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GDPR consent is required to create an account.",
            )
        if not (payload.email and payload.password and payload.full_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email, password, and full name are required.",
            )
        email = payload.email.lower().strip()
        # Dedup before Stripe so a re-submit doesn't leak Connect accounts.
        if session.exec(select(User).where(User.email == email)).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

    now = datetime.now(UTC)

    # Try Stripe first — if anything fails we haven't written to our DB yet
    # so the user can retry with the same email without "already taken" errors.
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

    try:
        onboarding_url = create_onboarding_link(account_id=connect_account_id)
    except stripe.error.StripeError:
        log.exception("AccountLink creation failed for %s (acct %s)", email, connect_account_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start Stripe onboarding. Try again in a moment.",
        ) from None

    # Stripe succeeded — now create the Tutor row (and the User row too if
    # we're on the brand-new-account branch). Identity fields (languages)
    # land on User per the Step 9a consolidation; Tutor only carries
    # tenant-specific fields.
    if existing_user is not None:
        user = existing_user
        # Promote a non-creator role to CREATOR — tutors are creators with a site.
        if user.role == UserRole.STUDENT:
            user.role = UserRole.CREATOR
        if payload.languages_taught:
            user.languages = payload.languages_taught
        user.updated_at = now
        session.add(user)
        # The existing-user branch doesn't need email verification re-sent;
        # the user already verified (or is in the middle of doing so).
        code = None
    else:
        user = User(
            email=email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name.strip(),
            role=UserRole.CREATOR,
            is_active=True,
            timezone=payload.timezone or "UTC",
            languages=payload.languages_taught,
            gdpr_consent_at=now,
            gdpr_consent_ip=client_ip(request),
        )
        code = _issue_email_code(user)
        session.add(user)
        session.flush()  # populate user.id without committing

    tutor = Tutor(
        user_id=user.id,
        tutor_slug=slug,
        display_name=payload.display_name.strip(),
        plan=TutorPlan.STARTER,
        account_status=TutorAccountStatus.PAUSED_KYC,
        classroom_minutes_quota=300,
        stripe_connect_account_id=connect_account_id,
    )
    session.add(tutor)
    session.commit()
    session.refresh(user)
    session.refresh(tutor)

    # Referral attribution + auto-issue codes for the new tutor.
    try:
        from ..services import referrals as _referrals

        if payload.ref_code:
            _referrals.attribute_signup(
                session, referred_user=user, code_str=payload.ref_code
            )
        _referrals.ensure_codes_for_user(session, user)
    except Exception:
        log.exception("Referral attribution failed in tutor onboarding for %s", user.email)

    # Verification email only on the new-user branch.
    if code is not None:
        try:
            send_verification_code(
                to_email=user.email,
                full_name=user.full_name,
                code=code,
                expires_minutes=EMAIL_CODE_TTL_MINUTES,
            )
        except Exception:
            log.exception(
                "Could not send verification code at tutor signup for %s", user.email
            )

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


def _sync_tutor_from_stripe(tutor: Tutor, session: Session) -> Tutor:
    """Pull live Stripe state and reconcile `tutor.account_status`.

    Self-healing path for when account.updated webhooks didn't reach us
    (e.g. `stripe listen` wasn't running, or the user returned from
    Stripe before the event was delivered). Mirrors the same transitions
    `handle_account_updated` makes from the webhook side.
    """
    if not tutor.stripe_connect_account_id:
        return tutor
    try:
        account = fetch_account(account_id=tutor.stripe_connect_account_id)
    except stripe.error.StripeError:
        log.exception(
            "Could not fetch Stripe account for tutor %s (acct %s)",
            tutor.tutor_slug,
            tutor.stripe_connect_account_id,
        )
        return tutor

    charges_enabled = bool(account.get("charges_enabled"))
    payouts_enabled = bool(account.get("payouts_enabled"))
    desired: TutorAccountStatus | None = None
    if charges_enabled and payouts_enabled:
        if tutor.account_status == TutorAccountStatus.PAUSED_KYC:
            desired = TutorAccountStatus.ACTIVE
    elif tutor.account_status == TutorAccountStatus.ACTIVE:
        desired = TutorAccountStatus.PAUSED_KYC

    if desired and desired != tutor.account_status:
        tutor.account_status = desired
        tutor.updated_at = datetime.now(UTC)
        session.add(tutor)
        session.commit()
        session.refresh(tutor)
    return tutor


@router.post("/tutor/sync-stripe", response_model=OnboardingStatus)
def sync_tutor_from_stripe(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> OnboardingStatus:
    """Owner-pulled refresh of the Tutor's Stripe Connect state.

    Same as `GET /onboarding/tutor/status` underneath, but exposed as a POST
    so the dashboard can wire it to a button without abusing GET semantics.
    Use when the account.updated webhook didn't reach us (e.g. dev without
    `stripe listen`, or a brief webhook delivery outage in prod).
    """
    tutor = _tutor_for_user(current, session)
    tutor = _sync_tutor_from_stripe(tutor, session)
    return OnboardingStatus(
        tutor_id=tutor.id,
        tutor_slug=tutor.tutor_slug,
        account_status=tutor.account_status,
        stripe_connect_account_id=tutor.stripe_connect_account_id or "",
        onboarding_complete=tutor.account_status != TutorAccountStatus.PAUSED_KYC,
    )


@router.get("/tutor/status", response_model=OnboardingStatus)
def onboarding_status(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> OnboardingStatus:
    tutor = _tutor_for_user(current, session)
    tutor = _sync_tutor_from_stripe(tutor, session)
    return OnboardingStatus(
        tutor_id=tutor.id,
        tutor_slug=tutor.tutor_slug,
        account_status=tutor.account_status,
        stripe_connect_account_id=tutor.stripe_connect_account_id or "",
        onboarding_complete=tutor.account_status != TutorAccountStatus.PAUSED_KYC,
    )
