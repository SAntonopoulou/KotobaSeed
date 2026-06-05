"""Tutor content subscriptions — recurring per-tutor access to premium
modules + premium homework.

Stripe Subscriptions on Connect using destination charges:
- Customer + Subscription on the platform account
- `subscription_data.application_fee_percent` siphons our tiered fee
- `subscription_data.transfer_data.destination` sends the rest to the
  tutor's Connect account

The tutor doesn't manage Stripe Price objects — we pass `price_data`
inline on every checkout. Existing subscribers keep their original price
when the tutor changes the plan (Stripe locks in price-at-signup).
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    StudentTutorSubscription,
    SubscriptionTier,
    Tutor,
    TutorSubscriptionPlan,
    TutorSubscriptionStatus,
    User,
)
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(tags=["tutor-subscriptions"])


# Same content-fee table as one-time purchases — but expressed as a
# float percentage because Stripe wants `application_fee_percent`
# (0..100) rather than a flat amount.
_CONTENT_FEE_PERCENT: dict[SubscriptionTier, float] = {
    SubscriptionTier.FREE: 10.0,
    SubscriptionTier.PLUS: 7.0,
    SubscriptionTier.PRO: 5.0,
    SubscriptionTier.BUSINESS: 0.0,
}


def _fee_percent_for(tutor_user: User) -> float:
    return _CONTENT_FEE_PERCENT.get(tutor_user.subscription_tier, 10.0)


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _tenant_url(tutor: Tutor, path: str) -> str:
    from ..config import settings

    frontend = settings.frontend_url.rstrip("/")
    if "localhost" in frontend:
        return f"http://{tutor.tutor_slug}.localhost:5173{path}"
    if "://" in frontend:
        scheme, rest = frontend.split("://", 1)
        return f"{scheme}://{tutor.tutor_slug}.{rest}{path}"
    return f"https://{tutor.tutor_slug}.{frontend}{path}"


# --- Owner: plan upsert -------------------------------------------------


class PlanRead(BaseModel):
    is_active: bool
    price_cents: int
    currency: str
    fee_percent: float | None  # what the platform takes; null when no plan yet


class PlanUpsert(BaseModel):
    price_cents: int = Field(ge=1_00, le=100_000_00)
    currency: str = Field(default="eur", min_length=3, max_length=3)
    is_active: bool = True


def _load_plan(tutor: Tutor, session: Session) -> TutorSubscriptionPlan | None:
    return session.exec(
        select(TutorSubscriptionPlan).where(TutorSubscriptionPlan.tutor_id == tutor.id)
    ).first()


def _plan_to_read(plan: TutorSubscriptionPlan | None, tutor_user: User) -> PlanRead:
    if plan is None:
        return PlanRead(
            is_active=False, price_cents=0, currency="eur", fee_percent=None
        )
    return PlanRead(
        is_active=plan.is_active,
        price_cents=plan.price_cents,
        currency=plan.currency,
        fee_percent=_fee_percent_for(tutor_user),
    )


@router.get("/tutor/subscription-plan", response_model=PlanRead)
def get_my_plan(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PlanRead:
    """Owner — returns the tutor's plan + the platform fee that applies."""
    _require_owner(tutor, current)
    return _plan_to_read(_load_plan(tutor, session), tutor.user)


@router.put("/tutor/subscription-plan", response_model=PlanRead)
def upsert_my_plan(
    payload: PlanUpsert,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PlanRead:
    _require_owner(tutor, current)
    plan = _load_plan(tutor, session)
    now = datetime.now(UTC)
    if plan is None:
        plan = TutorSubscriptionPlan(
            tutor_id=tutor.id,
            price_cents=payload.price_cents,
            currency=payload.currency,
            is_active=payload.is_active,
        )
    else:
        plan.price_cents = payload.price_cents
        plan.currency = payload.currency
        plan.is_active = payload.is_active
        plan.updated_at = now
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _plan_to_read(plan, tutor.user)


@router.delete(
    "/tutor/subscription-plan", status_code=status.HTTP_204_NO_CONTENT
)
def deactivate_my_plan(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Tutor pauses new sign-ups. Existing subscribers keep their access
    until their period ends; their next renewal will fail naturally if the
    tutor cancels via Stripe too."""
    _require_owner(tutor, current)
    plan = _load_plan(tutor, session)
    if plan is None or not plan.is_active:
        return
    plan.is_active = False
    plan.updated_at = datetime.now(UTC)
    session.add(plan)
    session.commit()


# --- Public: plan read (anon) ------------------------------------------


class PlanPublicRead(BaseModel):
    is_available: bool
    price_cents: int
    currency: str


@router.get("/tutor/subscription-plan/public", response_model=PlanPublicRead)
def get_public_plan(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PlanPublicRead:
    """Public — student-facing price + availability."""
    plan = _load_plan(tutor, session)
    if plan is None or not plan.is_active or plan.price_cents <= 0:
        return PlanPublicRead(is_available=False, price_cents=0, currency="eur")
    return PlanPublicRead(
        is_available=True,
        price_cents=plan.price_cents,
        currency=plan.currency,
    )


# --- Checkout ----------------------------------------------------------


class SubscribeResponse(BaseModel):
    checkout_url: str


@router.post(
    "/tutor/subscription-plan/subscribe", response_model=SubscribeResponse
)
def start_subscription_checkout(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> SubscribeResponse:
    plan = _load_plan(tutor, session)
    if plan is None or not plan.is_active or plan.price_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This tutor isn't taking subscribers right now.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't subscribe to your own content.",
        )
    if not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tutor hasn't finished Stripe setup yet.",
        )
    existing = session.exec(
        select(StudentTutorSubscription).where(
            StudentTutorSubscription.tutor_id == tutor.id,
            StudentTutorSubscription.student_user_id == current.id,
        )
    ).first()
    if existing is not None and existing.status in (
        TutorSubscriptionStatus.ACTIVE,
        TutorSubscriptionStatus.PAST_DUE,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You're already subscribed.",
        )

    fee_percent = _fee_percent_for(tutor.user)
    try:
        sess = stripe.checkout.Session.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            mode="subscription",
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": plan.currency,
                        "product_data": {
                            "name": f"{tutor.display_name} — content subscription"
                        },
                        "unit_amount": plan.price_cents,
                        "recurring": {"interval": "month"},
                    },
                }
            ],
            subscription_data={
                "application_fee_percent": fee_percent,
                "transfer_data": {"destination": tutor.stripe_connect_account_id},
                "metadata": {
                    "type": "tutor_subscription",
                    "tutor_id": str(tutor.id),
                    "student_user_id": str(current.id),
                },
            },
            success_url=_tenant_url(tutor, "/modules?subscribed=1"),
            cancel_url=_tenant_url(tutor, "/modules"),
            customer_email=current.email,
            metadata={
                "type": "tutor_subscription",
                "tutor_id": str(tutor.id),
                "student_user_id": str(current.id),
            },
        )
    except stripe.error.StripeError as exc:
        log.exception("Stripe error creating subscription checkout")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {exc.user_message or 'try again later.'}",
        ) from exc
    if not sess.url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe didn't return a checkout URL.",
        )
    return SubscribeResponse(checkout_url=sess.url)


# --- Student: my subscriptions ----------------------------------------


class StudentSubscriptionRead(BaseModel):
    id: int
    tutor_id: int
    tutor_slug: str | None
    tutor_display_name: str | None
    status: TutorSubscriptionStatus
    price_cents: int
    currency: str
    current_period_end: datetime | None
    cancel_at_period_end: bool
    started_at: datetime


@router.get(
    "/users/me/subscriptions/tutors",
    response_model=list[StudentSubscriptionRead],
)
def list_my_subscriptions(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[StudentSubscriptionRead]:
    rows = list(
        session.exec(
            select(StudentTutorSubscription)
            .where(StudentTutorSubscription.student_user_id == current.id)
            .order_by(StudentTutorSubscription.started_at.desc())
        ).all()
    )
    if not rows:
        return []
    tutor_ids = {r.tutor_id for r in rows}
    tutors = {
        t.id: t
        for t in session.exec(select(Tutor).where(Tutor.id.in_(tutor_ids))).all()
    }
    out: list[StudentSubscriptionRead] = []
    for r in rows:
        t = tutors.get(r.tutor_id)
        out.append(
            StudentSubscriptionRead(
                id=r.id,
                tutor_id=r.tutor_id,
                tutor_slug=t.tutor_slug if t else None,
                tutor_display_name=t.display_name if t else None,
                status=r.status,
                price_cents=r.stripe_price_cents_snapshot,
                currency=r.currency,
                current_period_end=r.current_period_end,
                cancel_at_period_end=r.cancel_at_period_end,
                started_at=r.started_at,
            )
        )
    return out


@router.post(
    "/users/me/subscriptions/tutors/{sub_id}/cancel",
    response_model=StudentSubscriptionRead,
)
def cancel_my_subscription(
    sub_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> StudentSubscriptionRead:
    """Schedule cancellation at period end — the student keeps access for
    what they've already paid for. Stripe sends a customer.subscription
    .updated webhook later confirming the change."""
    row = session.get(StudentTutorSubscription, sub_id)
    if row is None or row.student_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found."
        )
    if row.status == TutorSubscriptionStatus.CANCELLED or row.cancel_at_period_end:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already cancelled.",
        )
    if not row.stripe_subscription_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This subscription has no Stripe reference — contact support.",
        )
    try:
        stripe.Subscription.modify(
            row.stripe_subscription_id,
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            cancel_at_period_end=True,
        )
    except stripe.error.StripeError as exc:
        log.exception("Stripe error cancelling subscription")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {exc.user_message or 'try again later.'}",
        ) from exc
    row.cancel_at_period_end = True
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    tutor = session.get(Tutor, row.tutor_id)
    return StudentSubscriptionRead(
        id=row.id,
        tutor_id=row.tutor_id,
        tutor_slug=tutor.tutor_slug if tutor else None,
        tutor_display_name=tutor.display_name if tutor else None,
        status=row.status,
        price_cents=row.stripe_price_cents_snapshot,
        currency=row.currency,
        current_period_end=row.current_period_end,
        cancel_at_period_end=row.cancel_at_period_end,
        started_at=row.started_at,
    )
