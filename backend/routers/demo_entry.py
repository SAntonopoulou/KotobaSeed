"""Demo-is-the-signup entry, conversion, exit.

Public surface mounted at apex (no tenant scope):

  POST /demo/enter   — mint or resume a passwordless demo account
  POST /demo/convert — set password + GDPR consent → real account
  POST /demo/exit    — clear session cookie; user row stays as a lead
  GET  /demo/me      — current demo status + seed manifest

Sessions reuse the existing JWT cookie flow (security.set_auth_cookie).
Demo accounts have no hashed_password — the security layer treats that
as "log in via /demo/enter only", same way `/auth/token` rejects them.
"""

from __future__ import annotations

import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import get_current_user
from ..models import Tutor, User, UserRole
from ..security import (
    create_access_token,
    get_password_hash,
    set_auth_cookie,
    clear_auth_cookie,
)
from ..services.demo_lifecycle import seed_workspace, wipe_workspace

log = logging.getLogger(__name__)
router = APIRouter(prefix="/demo", tags=["demo"])


# Best-effort rate limiter per IP. Sliding window kept in process memory
# — fine on a single-worker FastAPI; would need Redis if we scaled
# horizontally. Outside production the budget is generous so local + E2E
# never trip.
_RATE_LIMIT_WINDOW = timedelta(minutes=10)
_RATE_LIMIT_MAX = 5 if settings.environment == "production" else 50
_rate_state: dict[str, list[datetime]] = {}


def _check_rate_limit(ip: str) -> None:
    now = datetime.now(UTC)
    window_start = now - _RATE_LIMIT_WINDOW
    times = [t for t in _rate_state.get(ip, []) if t >= window_start]
    if len(times) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many demo entries from this IP. Try again in a few minutes.",
        )
    times.append(now)
    _rate_state[ip] = times


# --- Schemas ----------------------------------------------------------


DemoRole = Literal["tutor", "creator", "student"]


class DemoEnterPayload(BaseModel):
    email: EmailStr
    role: DemoRole


class DemoEnterResponse(BaseModel):
    user_id: int
    demo_role: DemoRole
    is_demo_account: bool
    redirect_path: str


class DemoConvertPayload(BaseModel):
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    gdpr_consent: bool


class DemoMeResponse(BaseModel):
    is_demo: bool
    demo_role: DemoRole | None = None
    has_password: bool = False
    seeded_at: datetime | None = None


_VALID_NAME = re.compile(r"^[\w\s\-'.]{1,200}$", re.UNICODE)


def _tenant_url(tutor_slug: str, path: str) -> str:
    """Build a full URL for a tenant subdomain. Mirrors
    routers.cohorts._tenant_url so cross-origin redirects from /demo/enter
    behave the same way as Stripe success URLs."""
    frontend = settings.frontend_url.rstrip("/")
    if "localhost" in frontend:
        return f"http://{tutor_slug}.localhost:5173{path}"
    if "://" in frontend:
        scheme, rest = frontend.split("://", 1)
        return f"{scheme}://{tutor_slug}.{rest}{path}"
    return f"https://{tutor_slug}.{frontend}{path}"


def _redirect_for(session: Session, user: User) -> str:
    """Resolve the landing URL for a freshly entered/resumed demo user.

    Tutor: tenant subdomain `/dashboard` (the apex doesn't have that
    route — it's tenant-scoped). Returns a full absolute URL so the
    frontend can cross the subdomain boundary with location.assign.

    Creator + student: apex paths, returned as paths (same-origin nav).
    """
    role = user.demo_role
    if role == "tutor":
        tutor = session.exec(select(Tutor).where(Tutor.user_id == user.id)).first()
        if tutor is None:
            # Seed didn't run (or failed silently). Drop them on the apex
            # discover page rather than a 404 tenant URL.
            log.warning("demo tutor user_id=%s has no Tutor row; landing on apex", user.id)
            return "/discover"
        return _tenant_url(tutor.tutor_slug, "/dashboard")
    if role == "creator":
        return "/teacher/dashboard"
    return "/discover"


# --- Endpoints --------------------------------------------------------


@router.post("/enter", response_model=DemoEnterResponse)
def enter_demo(
    payload: DemoEnterPayload,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> DemoEnterResponse:
    """Mint or resume a passwordless demo account.

    Same email + role twice → resumes the original row, refreshes the
    session, seed runs only if the workspace was empty.
    Same email with a DIFFERENT role → also resumes the original
    (one demo account per email). The tour script for the original role
    is what they get; we don't let one email run three tours.

    Seeding runs synchronously so the tenant slug exists before we
    return — the tutor redirect needs it for the cross-subdomain URL.
    """
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    email = payload.email.strip().lower()
    role = payload.role

    # Block squatting on real accounts.
    existing_real = session.exec(
        select(User).where(User.email == email, User.is_demo_account == False)  # noqa: E712
    ).first()
    if existing_real is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email is registered. Sign in instead.",
        )

    # Resume if there's already a demo row.
    existing = session.exec(
        select(User).where(User.email == email, User.is_demo_account == True)  # noqa: E712
    ).first()
    if existing is not None:
        token = create_access_token(
            subject=str(existing.id),
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )
        set_auth_cookie(response, token)
        # Self-heal: if seeding never completed, re-fire it inline.
        # `seed_workspace` is idempotent on `demo_workspace_seeded_at`.
        if existing.demo_workspace_seeded_at is None:
            seed_workspace(session, existing)
            session.refresh(existing)
        return DemoEnterResponse(
            user_id=existing.id,
            demo_role=existing.demo_role or role,
            is_demo_account=True,
            redirect_path=_redirect_for(session, existing),
        )

    # Mint fresh.
    # Both "tutor" and "creator" demo flows map onto the same User.role
    # (TUTOR). They differ only in onboarding shape — the "creator" demo
    # skips the tenant-subdomain seeding and lands the user on the apex
    # /teacher/dashboard, useful for marketplace-only content sellers.
    role_enum = {
        "tutor": UserRole.TUTOR,
        "creator": UserRole.TUTOR,
        "student": UserRole.STUDENT,
    }[role]

    now = datetime.now(UTC)
    user = User(
        email=email,
        hashed_password="",  # blank string — security layer never matches it on login
        full_name="Demo user",
        role=role_enum,
        is_active=True,
        email_verified_at=now,    # demo accounts skip verification gate
        gdpr_consent_at=None,     # captured at conversion
        timezone="UTC",
        is_demo_account=True,
        demo_role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    set_auth_cookie(response, token)

    # Seed synchronously so the tutor row + slug exist before we
    # return the redirect URL. Tutor seed is ~5 inserts (<50ms).
    seed_workspace(session, user)
    session.refresh(user)

    return DemoEnterResponse(
        user_id=user.id,
        demo_role=role,
        is_demo_account=True,
        redirect_path=_redirect_for(session, user),
    )


@router.post("/convert", response_model=DemoMeResponse)
def convert_demo(
    payload: DemoConvertPayload,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DemoMeResponse:
    """Demo → real account. Sets password + GDPR consent, wipes the
    seeded showcase content, keeps the user's own creations."""
    if not current.is_demo_account:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account is already converted.",
        )
    if not payload.gdpr_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GDPR consent is required to keep your account.",
        )
    name = payload.full_name.strip()
    if not _VALID_NAME.match(name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name uses unsupported characters.",
        )

    # Wipe seeded content first so a partial state doesn't survive if
    # the conversion update fails. Best-effort: errors here are logged.
    try:
        wipe_workspace(session, current)
    except Exception:
        log.exception("demo wipe failed for user_id=%s", current.id)

    current.hashed_password = get_password_hash(payload.password)
    current.full_name = name
    current.gdpr_consent_at = datetime.now(UTC)
    current.is_demo_account = False
    current.demo_role = None
    current.demo_workspace_seeded_at = None
    session.add(current)
    session.commit()

    return DemoMeResponse(
        is_demo=False,
        demo_role=None,
        has_password=True,
        seeded_at=None,
    )


@router.post("/exit", status_code=status.HTTP_204_NO_CONTENT)
def exit_demo(
    response: Response,
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    """Drop the session. The user row + seeded content stays
    server-side as a lead; the janitor cron prunes it later if the
    user never returns."""
    if not current.is_demo_account:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Not a demo session.",
        )
    clear_auth_cookie(response)


@router.get("/me", response_model=DemoMeResponse)
def demo_me(
    current: Annotated[User, Depends(get_current_user)],
) -> DemoMeResponse:
    return DemoMeResponse(
        is_demo=current.is_demo_account,
        demo_role=current.demo_role,
        has_password=bool(current.hashed_password),
        seeded_at=current.demo_workspace_seeded_at,
    )
