"""Classroom minute top-up packs.

A tutor who hits their monthly tier quota can buy a pack of additional
scheduled minutes to keep their calendar open. Packs never expire and are
consumed FIFO across multiple booked lessons.

Two SKUs (matching the Stripe products created in setup):
- 1,000 minutes for €19
- 5,000 minutes for €79

Minutes are non-refundable but never expire — disclosed at point of purchase
on both the in-app pack list and the Stripe Checkout custom_text.

Flow:
- Tutor POSTs to /tutor/minute-packs/checkout with the SKU they want
- We create a Stripe Checkout Session with payment_intent_data.metadata
  pointing back at our tutor_id + sku, return the checkout URL
- Student pays, Stripe fires checkout.session.completed → pledges.py
  webhook detects metadata.type=='minute_pack' and grants the MinutePack
- The new pack is immediately visible in the tutor's QuotaSummary
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import CurrentUser
from ..models import MinutePack, Tutor, User
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(prefix="/tutor/minute-packs", tags=["minute-packs"])


# --- catalog -----------------------------------------------------------


class PackSku(BaseModel):
    sku: str
    label: str
    minutes: int
    price_cents: int
    currency: str
    price_id: str | None


def _catalog() -> list[PackSku]:
    """Static catalog read from env. SKUs whose price IDs aren't set come
    back excluded — keeps misconfigured environments from showing broken
    purchase buttons."""
    out: list[PackSku] = []
    if settings.stripe_minute_pack_1k_price_id:
        out.append(
            PackSku(
                sku="pack_1k",
                label="1,000 classroom minutes",
                minutes=1000,
                price_cents=1900,
                currency="eur",
                price_id=settings.stripe_minute_pack_1k_price_id,
            )
        )
    if settings.stripe_minute_pack_5k_price_id:
        out.append(
            PackSku(
                sku="pack_5k",
                label="5,000 classroom minutes",
                minutes=5000,
                price_cents=7900,
                currency="eur",
                price_id=settings.stripe_minute_pack_5k_price_id,
            )
        )
    return out


def _sku(sku_str: str) -> PackSku | None:
    return next((p for p in _catalog() if p.sku == sku_str), None)


# --- schemas -----------------------------------------------------------


class CheckoutRequest(BaseModel):
    sku: Literal["pack_1k", "pack_5k"]
    success_path: str = "/dashboard?pack=success"
    cancel_path: str = "/dashboard?pack=cancelled"


class CheckoutResponse(BaseModel):
    checkout_url: str


class PackRow(BaseModel):
    id: int
    minutes_purchased: int
    minutes_remaining: int
    price_cents: int
    currency: str
    purchased_at: str
    last_used_at: str | None


class PackListResponse(BaseModel):
    catalog: list[PackSku]
    packs: list[PackRow]
    total_remaining: int


# --- helpers -----------------------------------------------------------


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _serialize_pack(row: MinutePack) -> PackRow:
    return PackRow(
        id=row.id,
        minutes_purchased=row.minutes_purchased,
        minutes_remaining=row.minutes_remaining,
        price_cents=row.price_cents,
        currency=row.currency,
        purchased_at=row.purchased_at.isoformat(),
        last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
    )


# --- endpoints ---------------------------------------------------------


@router.get("", response_model=PackListResponse)
def list_packs(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PackListResponse:
    """Owner — what's available to buy + what's already been bought."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(MinutePack)
        .where(MinutePack.tutor_id == tutor.id)
        .order_by(MinutePack.purchased_at.desc())
    ).all()
    total = sum(int(r.minutes_remaining or 0) for r in rows)
    return PackListResponse(
        catalog=_catalog(),
        packs=[_serialize_pack(r) for r in rows],
        total_remaining=total,
    )


@router.post("/checkout", response_model=CheckoutResponse)
def start_checkout(
    payload: CheckoutRequest,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CheckoutResponse:
    """Owner — create a Stripe Checkout Session for the chosen SKU.

    Payment posts to the platform account (not Connect) since this is a
    Kotobaseed product, not a tutor sale. The webhook handler grants the
    pack on checkout.session.completed.
    """
    _require_owner(tutor, current)
    sku = _sku(payload.sku)
    if sku is None or not sku.price_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That pack isn't available right now.",
        )

    apex = settings.frontend_url.rstrip("/")
    try:
        checkout = stripe.checkout.Session.create(
            api_key=settings.stripe_secret_key,
            mode="payment",
            payment_method_types=["card"],
            line_items=[{"price": sku.price_id, "quantity": 1}],
            success_url=f"{apex}{payload.success_path}",
            cancel_url=f"{apex}{payload.cancel_path}",
            custom_text={
                "submit": {
                    "message": (
                        "Classroom minutes are non-refundable and never expire. "
                        "They top up your monthly tier quota and are consumed "
                        "from oldest pack first."
                    ),
                },
            },
            metadata={
                "type": "minute_pack",
                "tutor_id": str(tutor.id),
                "sku": sku.sku,
                "minutes": str(sku.minutes),
            },
            payment_intent_data={
                "metadata": {
                    "type": "minute_pack",
                    "tutor_id": str(tutor.id),
                    "sku": sku.sku,
                    "minutes": str(sku.minutes),
                }
            },
        )
    except stripe.error.StripeError as e:
        log.error("Stripe error creating minute-pack checkout: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout. Try again in a moment.",
        ) from e
    return CheckoutResponse(checkout_url=checkout.url)


def grant_pack_from_session(session: Session, checkout_session: dict) -> bool:
    """Webhook entry — called from pledges.py when a checkout.session.completed
    event arrives with metadata.type == 'minute_pack'.

    Idempotent: if a MinutePack row already exists for this checkout_session_id
    we return without doubling up.
    """
    meta = (checkout_session.get("metadata") or {})
    try:
        tutor_id = int(meta.get("tutor_id", "0"))
        minutes = int(meta.get("minutes", "0"))
    except (TypeError, ValueError):
        log.warning("minute_pack webhook missing/invalid metadata: %s", meta)
        return False
    if tutor_id <= 0 or minutes <= 0:
        log.warning("minute_pack webhook bad meta values: %s", meta)
        return False

    checkout_id = checkout_session.get("id")
    if checkout_id:
        existing = session.exec(
            select(MinutePack).where(
                MinutePack.stripe_checkout_session_id == checkout_id
            )
        ).first()
        if existing is not None:
            return True  # already granted

    pack = MinutePack(
        tutor_id=tutor_id,
        minutes_purchased=minutes,
        minutes_remaining=minutes,
        price_cents=int(checkout_session.get("amount_total") or 0),
        currency=(checkout_session.get("currency") or "eur").lower(),
        stripe_checkout_session_id=checkout_id,
        stripe_payment_intent_id=checkout_session.get("payment_intent"),
    )
    session.add(pack)
    session.commit()
    log.info(
        "Granted MinutePack #%s (%s min) to tutor %s",
        pack.id,
        minutes,
        tutor_id,
    )
    return True
