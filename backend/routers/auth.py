"""Authentication endpoints.

Flow:
- POST /auth/register  → creates the user, issues a 6-digit verification code
                         (emailed), returns a JWT immediately so the client
                         can call /auth/verify-email without logging in again.
- POST /auth/verify-email     → consume the code, set email_verified_at.
- POST /auth/resend-verification → issue a fresh code (overwrites stored hash).
- POST /auth/login    → JSON {email, password} login. Returns JWT.
- POST /auth/token    → OAuth2-form login (legacy/Swagger UI compat).
- GET  /auth/me       → current user (no email-verification gate so the
                         frontend can render a "verify your email" screen).
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import CurrentUser
from ..models import User, UserRole
from ..security import (
    client_ip,
    create_access_token,
    hash_password,
    verify_password,
)
from ..services.email import send_verification_code

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_CODE_TTL_MINUTES = 15


def _generate_email_code() -> str:
    """Zero-padded 6-digit code via secrets.randbelow for uniform distribution."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _issue_email_code(user: User) -> str:
    """Generate a code, stash its hash + expiry on the user, return plaintext."""
    code = _generate_email_code()
    user.email_verification_code_hash = hash_password(code)
    user.email_verification_expires_at = datetime.now(UTC) + timedelta(
        minutes=EMAIL_CODE_TTL_MINUTES
    )
    return code


# --- Request / response models -----------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    newsletter_opt_in: bool = False
    gdpr_consent: bool
    role: UserRole = UserRole.STUDENT
    # Optional ?ref= code captured at signup. Stamps an attribution row
    # so any future rewards land with the right referrer.
    ref_code: str | None = Field(default=None, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    timezone: str
    newsletter_opt_in: bool
    created_at: datetime
    email_verified_at: datetime | None = None

    model_config = {"from_attributes": True}


class VerifyEmailRequest(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class VerifyEmailResponse(BaseModel):
    verified: bool


# --- Endpoints ----------------------------------------------------------


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    if not payload.gdpr_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GDPR consent is required to create an account.",
        )

    email = payload.email.lower().strip()
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    now = datetime.now(UTC)
    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
        is_active=True,
        timezone=payload.timezone or "UTC",
        newsletter_opt_in=payload.newsletter_opt_in,
        gdpr_consent_at=now,
        gdpr_consent_ip=client_ip(request),
    )
    code = _issue_email_code(user)

    session.add(user)
    session.commit()
    session.refresh(user)

    # Stamp a referral attribution + auto-issue this user's own codes
    # (everyone gets STUDENT_PEER; creators also get TUTOR_PEER). Both
    # are best-effort — registration shouldn't fail if referrals does.
    try:
        from ..services import referrals as _referrals

        if payload.ref_code:
            _referrals.attribute_signup(
                session, referred_user=user, code_str=payload.ref_code
            )
        _referrals.ensure_codes_for_user(session, user)
    except Exception:
        log.exception("Referral attribution failed for new user %s", user.email)

    try:
        send_verification_code(
            to_email=user.email,
            full_name=user.full_name,
            code=code,
            expires_minutes=EMAIL_CODE_TTL_MINUTES,
        )
    except Exception:
        log.exception("Could not send verification code at signup for %s", user.email)

    token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.access_token_expire_minutes,
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(
    payload: VerifyEmailRequest,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> VerifyEmailResponse:
    if current.email_verified_at is not None:
        return VerifyEmailResponse(verified=True)
    if (
        not current.email_verification_code_hash
        or not current.email_verification_expires_at
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No verification code on file. Request a new one.",
        )
    # Stored as naive datetime in SQLite — treat both sides as UTC-aware.
    expires_at = current.email_verification_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if datetime.now(UTC) > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code has expired. Request a new one.",
        )
    if not verify_password(
        payload.code.strip(), current.email_verification_code_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code doesn't match. Double-check the email we sent.",
        )

    now = datetime.now(UTC)
    current.email_verified_at = now
    current.email_verification_code_hash = None
    current.email_verification_expires_at = None
    current.updated_at = now
    session.add(current)
    session.commit()
    return VerifyEmailResponse(verified=True)


@router.post("/resend-verification", response_model=VerifyEmailResponse)
def resend_verification(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> VerifyEmailResponse:
    if current.email_verified_at is not None:
        return VerifyEmailResponse(verified=True)

    code = _issue_email_code(current)
    current.updated_at = datetime.now(UTC)
    session.add(current)
    session.commit()
    try:
        send_verification_code(
            to_email=current.email,
            full_name=current.full_name,
            code=code,
            expires_minutes=EMAIL_CODE_TTL_MINUTES,
        )
    except Exception:
        log.exception("Could not resend verification code for %s", current.email)
    return VerifyEmailResponse(verified=False)


def _login(email: str, password: str, session: Session) -> TokenResponse:
    email_norm = email.lower().strip()
    user = session.exec(select(User).where(User.email == email_norm)).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )
    token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.access_token_expire_minutes,
    )


# --- Password reset -----------------------------------------------------

PASSWORD_RESET_TTL_MINUTES = 60


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str = Field(min_length=10, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class GenericOkResponse(BaseModel):
    ok: bool = True


@router.post("/forgot-password", response_model=GenericOkResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    session: Annotated[Session, Depends(get_session)],
) -> GenericOkResponse:
    """Issue a password-reset token. Always returns ok=True regardless of
    whether the email matches a user — so the endpoint can't be used to
    enumerate registered emails. Email is sent best-effort; failures are
    logged but never raised."""
    email_norm = payload.email.lower().strip()
    user = session.exec(select(User).where(User.email == email_norm)).first()
    if user is None or user.deleted_at is not None or not user.is_active:
        return GenericOkResponse()

    # Opaque URL-safe token. The DB stores the Argon2 hash; the plaintext
    # only ever lives in the email we send.
    token = secrets.token_urlsafe(32)
    user.password_reset_token_hash = hash_password(token)
    user.password_reset_expires_at = datetime.now(UTC) + timedelta(
        minutes=PASSWORD_RESET_TTL_MINUTES
    )
    user.updated_at = datetime.now(UTC)
    session.add(user)
    session.commit()

    try:
        from ..services.email import send_password_reset

        send_password_reset(
            to_email=user.email,
            full_name=user.full_name,
            token=token,
            expires_minutes=PASSWORD_RESET_TTL_MINUTES,
        )
    except Exception:
        log.exception("Could not send password reset email to %s", user.email)
    return GenericOkResponse()


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(
    payload: ResetPasswordRequest,
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    """Consume a reset token + set a new password. On success, returns a
    fresh JWT so the user is logged in immediately."""
    email_norm = payload.email.lower().strip()
    user = session.exec(select(User).where(User.email == email_norm)).first()
    bad = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired reset link. Request a new one.",
    )
    if (
        user is None
        or user.deleted_at is not None
        or not user.password_reset_token_hash
        or not user.password_reset_expires_at
    ):
        raise bad

    expires = user.password_reset_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise bad

    if not verify_password(payload.token, user.password_reset_token_hash):
        raise bad

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    user.updated_at = datetime.now(UTC)
    session.add(user)
    session.commit()

    # Confirmation email — security best practice.
    try:
        from ..services import email as _email
        from ..services import email_templates as _templates
        from ..services import platform_settings as _platform

        support_email = (
            _platform.get_setting(session, _platform.SETTING_SUPPORT_EMAIL)
            or "support@kotobaseed.net"
        )
        subject, html = _templates.render(
            "password_changed",
            {
                "user_name": user.full_name or "there",
                "support_email": support_email,
            },
            session=session,
            tutor=None,
        )
        _email.send_email(
            to=user.email, subject=subject, html=_email._wrap(subject, html)
        )
    except Exception:
        log.exception("Could not send password-changed email to %s", user.email)

    access_token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(
        access_token=access_token,
        expires_in_minutes=settings.access_token_expire_minutes,
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    return _login(payload.email, payload.password, session)


@router.post("/token", response_model=TokenResponse)
def login_form(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    """OAuth2 password-grant form login. Kept for Swagger UI + legacy frontend."""
    return _login(form.username, form.password, session)


@router.get("/me", response_model=UserPublic)
def me(current: CurrentUser) -> UserPublic:
    return UserPublic.model_validate(current)
