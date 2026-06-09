"""Cohort marketplace endpoints.

Two router groups in this file, both mounted at the apex (cohorts are
a cross-tutor surface):

- /tutor/cohorts/*    — owner CRUD (auth, tenant-scoped to current tutor)
- /cohorts/*          — public read + student checkout

The Stripe Connect flow mirrors lesson modules: destination charge on
the tutor's connected account with a tier-scaled platform fee (the same
content_platform_fee helper modules uses). The webhook handler that
inserts the CohortSeat row is in routers/pledges.py.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import CurrentUser, get_current_user_optional
from ..models import (
    Cohort,
    CohortSeat,
    CohortStatus,
    LanguageGroup,
    Tutor,
    User,
)
from ..services.platform_fees import content_platform_fee
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)


# --- Schemas ----------------------------------------------------------


class CohortSummary(BaseModel):
    id: int
    title: str
    description: str | None
    lesson_schedule_note: str | None
    num_lessons: int
    duration_minutes: int
    price_per_seat_cents: int
    currency: str
    max_seats: int
    min_seats: int
    seats_filled: int
    first_session_at: datetime
    enrollment_deadline: datetime
    status: CohortStatus
    tutor_id: int
    tutor_slug: str | None
    tutor_display_name: str | None
    group_slug: str | None
    group_language: str | None


class CohortRead(CohortSummary):
    has_seat: bool = False


class CohortCreate(BaseModel):
    group_id: int
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    lesson_schedule_note: str | None = Field(default=None, max_length=500)
    num_lessons: int = Field(ge=1, le=52)
    duration_minutes: int = Field(ge=15, le=240)
    price_per_seat_cents: int = Field(default=0, ge=0, le=10_000_00)
    currency: str = Field(default="eur", min_length=3, max_length=3)
    max_seats: int = Field(ge=2, le=50)
    min_seats: int = Field(default=1, ge=1)
    first_session_at: datetime
    enrollment_deadline: datetime


class CohortUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    lesson_schedule_note: str | None = Field(default=None, max_length=500)
    num_lessons: int | None = Field(default=None, ge=1, le=52)
    duration_minutes: int | None = Field(default=None, ge=15, le=240)
    price_per_seat_cents: int | None = Field(default=None, ge=0, le=10_000_00)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    max_seats: int | None = Field(default=None, ge=2, le=50)
    min_seats: int | None = Field(default=None, ge=1)
    first_session_at: datetime | None = None
    enrollment_deadline: datetime | None = None


class CohortCheckoutResponse(BaseModel):
    checkout_url: str


# --- Helpers ----------------------------------------------------------


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _seats_filled(session: Session, cohort_id: int) -> int:
    return int(
        session.exec(
            select(func.count(CohortSeat.id)).where(
                CohortSeat.cohort_id == cohort_id,
                CohortSeat.refunded_at.is_(None),
            )
        ).one()
        or 0
    )


def _to_summary(
    session: Session, c: Cohort, *, tutor: Tutor | None = None
) -> CohortSummary:
    t = tutor or session.get(Tutor, c.tutor_id)
    g = session.get(LanguageGroup, c.group_id)
    return CohortSummary(
        id=c.id,
        title=c.title,
        description=c.description,
        lesson_schedule_note=c.lesson_schedule_note,
        num_lessons=c.num_lessons,
        duration_minutes=c.duration_minutes,
        price_per_seat_cents=c.price_per_seat_cents,
        currency=c.currency,
        max_seats=c.max_seats,
        min_seats=c.min_seats,
        seats_filled=_seats_filled(session, c.id),
        first_session_at=c.first_session_at,
        enrollment_deadline=c.enrollment_deadline,
        status=c.status,
        tutor_id=c.tutor_id,
        tutor_slug=t.tutor_slug if t else None,
        tutor_display_name=t.display_name if t else None,
        group_slug=g.slug if g else None,
        group_language=g.language_name if g else None,
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


# --- Tutor (owner) CRUD ----------------------------------------------


owner_router = APIRouter(prefix="/tutor/cohorts", tags=["cohorts", "tutor"])


@owner_router.get("", response_model=list[CohortSummary])
def list_owner_cohorts(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[CohortSummary]:
    _require_owner(tutor, current)
    rows = session.exec(
        select(Cohort)
        .where(Cohort.tutor_id == tutor.id)
        .order_by(Cohort.first_session_at.desc())
    ).all()
    return [_to_summary(session, c, tutor=tutor) for c in rows]


@owner_router.post(
    "", response_model=CohortRead, status_code=status.HTTP_201_CREATED
)
def create_cohort(
    payload: CohortCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CohortRead:
    _require_owner(tutor, current)
    g = session.get(LanguageGroup, payload.group_id)
    if g is None or not g.is_active:
        raise HTTPException(status_code=400, detail="Language group not found.")
    if payload.enrollment_deadline >= payload.first_session_at:
        raise HTTPException(
            status_code=400,
            detail="Enrollment deadline must be before the first session.",
        )
    if payload.min_seats > payload.max_seats:
        raise HTTPException(
            status_code=400, detail="min_seats can't exceed max_seats."
        )
    row = Cohort(
        tutor_id=tutor.id,
        group_id=payload.group_id,
        title=payload.title,
        description=payload.description,
        lesson_schedule_note=payload.lesson_schedule_note,
        num_lessons=payload.num_lessons,
        duration_minutes=payload.duration_minutes,
        price_per_seat_cents=payload.price_per_seat_cents,
        currency=payload.currency,
        max_seats=payload.max_seats,
        min_seats=payload.min_seats,
        first_session_at=payload.first_session_at,
        enrollment_deadline=payload.enrollment_deadline,
        status=CohortStatus.DRAFT,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return CohortRead(**_to_summary(session, row, tutor=tutor).model_dump(), has_seat=False)


@owner_router.patch("/{cohort_id}", response_model=CohortRead)
def update_cohort(
    cohort_id: int,
    payload: CohortUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CohortRead:
    _require_owner(tutor, current)
    row = session.get(Cohort, cohort_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=404, detail="Cohort not found.")
    if row.status in (CohortStatus.CONFIRMED, CohortStatus.CANCELLED):
        raise HTTPException(
            status_code=409,
            detail=f"Cohort is {row.status.value}; can't edit anymore.",
        )
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(row, k, v)
    if row.enrollment_deadline >= row.first_session_at:
        raise HTTPException(
            status_code=400,
            detail="Enrollment deadline must be before the first session.",
        )
    session.add(row)
    session.commit()
    session.refresh(row)
    return CohortRead(**_to_summary(session, row, tutor=tutor).model_dump(), has_seat=False)


@owner_router.post("/{cohort_id}/publish", response_model=CohortRead)
def publish_cohort(
    cohort_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CohortRead:
    _require_owner(tutor, current)
    row = session.get(Cohort, cohort_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=404, detail="Cohort not found.")
    if row.status != CohortStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Cohort isn't a draft.")
    if not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=409,
            detail="Finish Stripe setup before opening a paid cohort.",
        )
    row.status = CohortStatus.OPEN
    session.add(row)
    session.commit()
    session.refresh(row)
    return CohortRead(**_to_summary(session, row, tutor=tutor).model_dump(), has_seat=False)


@owner_router.post("/{cohort_id}/confirm", response_model=CohortRead)
def confirm_cohort(
    cohort_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CohortRead:
    """Manual confirm. Auto-confirm-on-fill happens in the webhook
    handler when seats hit max_seats."""
    _require_owner(tutor, current)
    row = session.get(Cohort, cohort_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=404, detail="Cohort not found.")
    if row.status != CohortStatus.OPEN:
        raise HTTPException(status_code=409, detail="Cohort isn't open.")
    filled = _seats_filled(session, row.id)
    if filled < row.min_seats:
        raise HTTPException(
            status_code=409,
            detail=f"Need at least {row.min_seats} seats; only {filled} paid.",
        )
    row.status = CohortStatus.CONFIRMED
    row.confirmed_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return CohortRead(**_to_summary(session, row, tutor=tutor).model_dump(), has_seat=False)


@owner_router.delete("/{cohort_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_cohort(
    cohort_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Cancel a cohort. Refunds are processed asynchronously by the
    cohort-sweep service when status flips to CANCELLED."""
    _require_owner(tutor, current)
    row = session.get(Cohort, cohort_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=404, detail="Cohort not found.")
    if row.status == CohortStatus.CANCELLED:
        return
    row.status = CohortStatus.CANCELLED
    row.cancelled_at = datetime.now(UTC)
    session.add(row)
    session.commit()


# --- Public read + group integration ---------------------------------


public_router = APIRouter(prefix="/cohorts", tags=["cohorts"])


@public_router.get("/{cohort_id}", response_model=CohortRead)
def read_cohort(
    cohort_id: int,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> CohortRead:
    row = session.get(Cohort, cohort_id)
    if row is None or row.status == CohortStatus.DRAFT:
        raise HTTPException(status_code=404, detail="Cohort not found.")
    has_seat = False
    if current is not None:
        has_seat = (
            session.exec(
                select(CohortSeat).where(
                    CohortSeat.cohort_id == row.id,
                    CohortSeat.student_user_id == current.id,
                    CohortSeat.refunded_at.is_(None),
                )
            ).first()
            is not None
        )
    return CohortRead(**_to_summary(session, row).model_dump(), has_seat=has_seat)


@public_router.post("/{cohort_id}/checkout", response_model=CohortCheckoutResponse)
def start_seat_checkout(
    cohort_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> CohortCheckoutResponse:
    """Student starts Stripe Connect checkout for a single seat."""
    row = session.get(Cohort, cohort_id)
    if row is None or row.status != CohortStatus.OPEN:
        raise HTTPException(status_code=404, detail="Cohort not open.")
    if datetime.now(UTC) >= (
        row.enrollment_deadline
        if row.enrollment_deadline.tzinfo
        else row.enrollment_deadline.replace(tzinfo=UTC)
    ):
        raise HTTPException(status_code=409, detail="Enrollment is closed.")
    if row.price_per_seat_cents <= 0:
        raise HTTPException(
            status_code=400, detail="Cohort is free — no checkout needed."
        )
    existing = session.exec(
        select(CohortSeat).where(
            CohortSeat.cohort_id == row.id,
            CohortSeat.student_user_id == current.id,
            CohortSeat.refunded_at.is_(None),
        )
    ).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="You already have a seat.")
    if _seats_filled(session, row.id) >= row.max_seats:
        raise HTTPException(status_code=409, detail="Cohort is full.")

    tutor = session.get(Tutor, row.tutor_id)
    if tutor is None or not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=409,
            detail="This tutor hasn't finished Stripe setup yet.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=400, detail="You can't book a seat in your own cohort."
        )

    fee = content_platform_fee(tutor.user, row.price_per_seat_cents)
    try:
        sess = stripe.checkout.Session.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": row.currency,
                        "product_data": {"name": f"Seat — {row.title}"},
                        "unit_amount": row.price_per_seat_cents,
                    },
                    "quantity": 1,
                }
            ],
            payment_intent_data={
                "application_fee_amount": fee,
                "transfer_data": {"destination": tutor.stripe_connect_account_id},
            },
            success_url=_tenant_url(tutor, f"/?cohort_paid={row.id}"),
            cancel_url=_tenant_url(tutor, f"/?cohort_cancelled={row.id}"),
            customer_email=current.email,
            metadata={
                "type": "cohort_seat",
                "cohort_id": str(row.id),
                "tutor_id": str(row.tutor_id),
                "student_user_id": str(current.id),
                "platform_fee_cents": str(fee),
            },
        )
    except stripe.error.StripeError as exc:
        log.exception("Stripe error creating cohort seat checkout")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {exc.user_message or 'try again later.'}",
        ) from exc
    if not sess.url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe didn't return a checkout URL.",
        )
    return CohortCheckoutResponse(checkout_url=sess.url)


# --- Combined router exported to main.py -----------------------------


router = APIRouter()
router.include_router(owner_router)
router.include_router(public_router)


# --- Group-page integration ------------------------------------------
# Adds /groups/{slug}/cohorts to the language_groups router by importing
# below — but to avoid circular imports we just expose a helper here.


def list_open_cohorts_for_group(
    session: Session, group_id: int
) -> list[CohortSummary]:
    rows = session.exec(
        select(Cohort)
        .where(
            Cohort.group_id == group_id,
            Cohort.status.in_([CohortStatus.OPEN, CohortStatus.CONFIRMED]),
        )
        .order_by(Cohort.first_session_at.asc())
    ).all()
    return [_to_summary(session, c) for c in rows]
