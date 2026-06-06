"""Referral + affiliate user-facing + admin endpoints."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser, get_current_admin
from ..models import (
    AffiliateApplication,
    AffiliateApplicationStatus,
    LessonCredit,
    ReferralAttribution,
    ReferralCode,
    ReferralCodeKind,
    ReferralReward,
    User,
)
from ..services import referrals as referrals_service

log = logging.getLogger(__name__)
router = APIRouter(tags=["referrals"])


# --- Schemas --------------------------------------------------------------


class ReferralCodeRead(BaseModel):
    code: str
    kind: str
    share_url: str | None = None


class AttributionRead(BaseModel):
    id: int
    referred_user_email: str | None
    kind: str
    first_qualified_at: datetime | None
    created_at: datetime


class RewardRead(BaseModel):
    id: int
    kind: str
    milestone_key: str | None
    amount_cents: int
    currency: str
    status: str
    earned_at: datetime
    paid_at: datetime | None


class ReferralSummary(BaseModel):
    codes: list[ReferralCodeRead]
    attributions: list[AttributionRead]
    rewards: list[RewardRead]
    total_pending_cents: int
    total_paid_cents: int


class AffiliateApplyIn(BaseModel):
    website_url: HttpUrl
    audience_description: str = Field(min_length=20, max_length=4000)


class AffiliateAppRead(BaseModel):
    id: int
    user_id: int
    user_email: str | None
    website_url: str
    audience_description: str
    status: str
    reviewed_by_user_id: int | None
    reviewed_at: datetime | None
    admin_notes: str | None
    created_at: datetime


class AffiliateAppReview(BaseModel):
    admin_notes: str | None = None


# --- Helpers --------------------------------------------------------------


def _share_url_for(code: ReferralCode) -> str:
    from ..config import settings

    base = settings.frontend_url.rstrip("/")
    return f"{base}/register?ref={code.code}"


# --- User endpoints -------------------------------------------------------


@router.get("/referrals/me", response_model=ReferralSummary)
def my_referrals(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> ReferralSummary:
    """Single dashboard payload — codes, attributions, rewards, totals."""
    referrals_service.ensure_codes_for_user(session, current)

    codes = list(
        session.exec(
            select(ReferralCode).where(ReferralCode.user_id == current.id)
        ).all()
    )
    attrs = list(
        session.exec(
            select(ReferralAttribution).where(
                ReferralAttribution.referrer_user_id == current.id
            )
        ).all()
    )
    referred_users = {
        u.id: u
        for u in session.exec(
            select(User).where(User.id.in_([a.referred_user_id for a in attrs]))
        ).all()
    } if attrs else {}
    rewards = list(
        session.exec(
            select(ReferralReward)
            .where(ReferralReward.referrer_user_id == current.id)
            .order_by(ReferralReward.earned_at.desc())
        ).all()
    )

    return ReferralSummary(
        codes=[
            ReferralCodeRead(
                code=c.code,
                kind=c.kind.value,
                share_url=_share_url_for(c),
            )
            for c in codes
        ],
        attributions=[
            AttributionRead(
                id=a.id,
                referred_user_email=(
                    referred_users.get(a.referred_user_id).email
                    if referred_users.get(a.referred_user_id)
                    else None
                ),
                kind=a.kind.value,
                first_qualified_at=a.first_qualified_at,
                created_at=a.created_at,
            )
            for a in attrs
        ],
        rewards=[
            RewardRead(
                id=r.id,
                kind=r.kind.value,
                milestone_key=r.milestone_key,
                amount_cents=r.amount_cents,
                currency=r.currency,
                status=r.status.value,
                earned_at=r.earned_at,
                paid_at=r.paid_at,
            )
            for r in rewards
        ],
        total_pending_cents=sum(
            r.amount_cents for r in rewards if r.status.value == "pending"
        ),
        total_paid_cents=sum(
            r.amount_cents for r in rewards if r.status.value == "paid"
        ),
    )


@router.post("/affiliates/apply", response_model=AffiliateAppRead)
def apply_affiliate(
    payload: AffiliateApplyIn,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> AffiliateAppRead:
    """Apply for the affiliate program. Pending until admin reviews."""
    existing = session.exec(
        select(AffiliateApplication).where(
            AffiliateApplication.user_id == current.id,
            AffiliateApplication.status == AffiliateApplicationStatus.PENDING,
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="You already have a pending application — we'll get back to you.",
        )
    app = AffiliateApplication(
        user_id=current.id,
        website_url=str(payload.website_url),
        audience_description=payload.audience_description.strip(),
    )
    session.add(app)
    session.commit()
    session.refresh(app)
    return AffiliateAppRead(
        id=app.id,
        user_id=app.user_id,
        user_email=current.email,
        website_url=app.website_url,
        audience_description=app.audience_description,
        status=app.status.value,
        reviewed_by_user_id=app.reviewed_by_user_id,
        reviewed_at=app.reviewed_at,
        admin_notes=app.admin_notes,
        created_at=app.created_at,
    )


# --- Admin endpoints ------------------------------------------------------


@router.get(
    "/admin/affiliates/applications", response_model=list[AffiliateAppRead]
)
def list_affiliate_applications(
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> list[AffiliateAppRead]:
    apps = list(
        session.exec(
            select(AffiliateApplication).order_by(
                AffiliateApplication.created_at.desc()
            )
        ).all()
    )
    users = {
        u.id: u
        for u in session.exec(
            select(User).where(User.id.in_([a.user_id for a in apps]))
        ).all()
    } if apps else {}
    return [
        AffiliateAppRead(
            id=a.id,
            user_id=a.user_id,
            user_email=users.get(a.user_id).email if users.get(a.user_id) else None,
            website_url=a.website_url,
            audience_description=a.audience_description,
            status=a.status.value,
            reviewed_by_user_id=a.reviewed_by_user_id,
            reviewed_at=a.reviewed_at,
            admin_notes=a.admin_notes,
            created_at=a.created_at,
        )
        for a in apps
    ]


@router.post(
    "/admin/affiliates/applications/{app_id}/approve",
    response_model=AffiliateAppRead,
)
def approve_affiliate(
    app_id: int,
    payload: AffiliateAppReview,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> AffiliateAppRead:
    app = session.get(AffiliateApplication, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found.")
    if app.status != AffiliateApplicationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Application already reviewed.")
    # Issue an AFFILIATE referral code to the applicant.
    existing_code = session.exec(
        select(ReferralCode).where(
            ReferralCode.user_id == app.user_id,
            ReferralCode.kind == ReferralCodeKind.AFFILIATE,
        )
    ).first()
    if existing_code is None:
        code = ReferralCode(
            user_id=app.user_id,
            code=referrals_service._new_code(session),
            kind=ReferralCodeKind.AFFILIATE,
        )
        session.add(code)
    app.status = AffiliateApplicationStatus.APPROVED
    app.reviewed_by_user_id = current_user.id
    app.reviewed_at = datetime.now(UTC)
    app.admin_notes = payload.admin_notes
    session.add(app)
    session.commit()
    session.refresh(app)
    user = session.get(User, app.user_id)
    return AffiliateAppRead(
        id=app.id,
        user_id=app.user_id,
        user_email=user.email if user else None,
        website_url=app.website_url,
        audience_description=app.audience_description,
        status=app.status.value,
        reviewed_by_user_id=app.reviewed_by_user_id,
        reviewed_at=app.reviewed_at,
        admin_notes=app.admin_notes,
        created_at=app.created_at,
    )


@router.post(
    "/admin/affiliates/applications/{app_id}/reject",
    response_model=AffiliateAppRead,
)
def reject_affiliate(
    app_id: int,
    payload: AffiliateAppReview,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> AffiliateAppRead:
    app = session.get(AffiliateApplication, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found.")
    if app.status != AffiliateApplicationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Application already reviewed.")
    app.status = AffiliateApplicationStatus.REJECTED
    app.reviewed_by_user_id = current_user.id
    app.reviewed_at = datetime.now(UTC)
    app.admin_notes = payload.admin_notes
    session.add(app)
    session.commit()
    session.refresh(app)
    user = session.get(User, app.user_id)
    return AffiliateAppRead(
        id=app.id,
        user_id=app.user_id,
        user_email=user.email if user else None,
        website_url=app.website_url,
        audience_description=app.audience_description,
        status=app.status.value,
        reviewed_by_user_id=app.reviewed_by_user_id,
        reviewed_at=app.reviewed_at,
        admin_notes=app.admin_notes,
        created_at=app.created_at,
    )
