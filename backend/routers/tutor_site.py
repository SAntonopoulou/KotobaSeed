"""Per-tenant tutor-site endpoints.

GET /tutor/me is anonymous — public read of the tutor whose subdomain (or
custom domain) the request hit. PATCH /tutor/me requires the caller to be
the User who owns this Tutor.

Identity (bio, photo, languages) lives on User as a single source of truth
shared with the marketplace profile. Tutor-only fields (display_name,
public_reply_email, plan, etc.) live on Tutor. The TutorRead response
folds both together so the frontend sees one coherent shape.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

import httpx
import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    Booking,
    BookingStatus,
    LessonPack,
    Notification,
    SubscriptionTier,
    Tutor,
    TutorAccountStatus,
    TutorAvailability,
    TutorPlan,
    User,
)
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)

router = APIRouter(prefix="/tutor", tags=["tutor-site"])


class TutorRead(BaseModel):
    id: int
    user_id: int  # frontend uses this to decide whether the viewer owns this Tutor
    tutor_slug: str
    display_name: str
    # Identity fields — populated from tutor.user (single source).
    bio: str | None
    photo_url: str | None
    languages_taught: str | None
    # Tutor-only fields.
    public_reply_email: EmailStr | None
    plan: TutorPlan
    account_status: TutorAccountStatus
    custom_domain: str | None
    stripe_connect_account_id: str | None
    created_at: datetime


def _serialize_tutor(tutor: Tutor) -> TutorRead:
    """Fold User identity fields into the TutorRead response."""
    user = tutor.user  # eager-loaded via the Tutor.user relationship
    return TutorRead(
        id=tutor.id,
        user_id=tutor.user_id,
        tutor_slug=tutor.tutor_slug,
        display_name=tutor.display_name,
        bio=user.bio if user else None,
        photo_url=user.avatar_url if user else None,
        languages_taught=user.languages if user else None,
        public_reply_email=tutor.public_reply_email,
        plan=tutor.plan,
        account_status=tutor.account_status,
        custom_domain=tutor.custom_domain,
        stripe_connect_account_id=tutor.stripe_connect_account_id,
        created_at=tutor.created_at,
    )


class TutorUpdate(BaseModel):
    """Partial update — every field is optional.

    Identity fields (bio, photo_url, languages_taught) write through to the
    underlying User row so the marketplace profile stays in sync. Tutor-only
    fields (display_name, public_reply_email) write to the Tutor row.
    """

    # Tutor-side
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    public_reply_email: EmailStr | None = None
    # User-side (single identity source)
    bio: str | None = Field(default=None, max_length=4000)
    photo_url: str | None = Field(default=None, max_length=2048)
    languages_taught: str | None = Field(default=None, max_length=255)


def _maybe_sync_kyc_status(tutor: Tutor, session: Session) -> Tutor:
    """Self-heal the tutor's KYC state from live Stripe data.

    Called on every public + auth'd Tutor read. No-op once the tutor is past
    PAUSED_KYC (no Stripe round trip), and swallows Stripe errors so a
    transient API blip can't break the public site. This is the mechanism
    that makes the "onboarding loop" impossible: whether the webhook reached
    us or not, the next page load resolves the truth.
    """
    if tutor.account_status != TutorAccountStatus.PAUSED_KYC:
        return tutor
    if not tutor.stripe_connect_account_id:
        return tutor
    try:
        # Local import to dodge the circular onboarding.py → tutor_site.py path.
        from ..services.stripe_connect import fetch_account

        account = fetch_account(account_id=tutor.stripe_connect_account_id)
    except Exception:
        log.exception(
            "Could not refresh Stripe state for tutor %s (acct %s)",
            tutor.tutor_slug,
            tutor.stripe_connect_account_id,
        )
        return tutor

    if account.get("charges_enabled") and account.get("payouts_enabled"):
        tutor.account_status = TutorAccountStatus.ACTIVE
        tutor.updated_at = datetime.now(UTC)
        session.add(tutor)
        session.commit()
        session.refresh(tutor)
    return tutor


@router.get("/me", response_model=TutorRead)
def read_current_tutor(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TutorRead:
    """Public — anything a student or visitor sees on the tutor's site.

    Self-heals KYC status from Stripe on every read when the tutor is still
    PAUSED_KYC. Once active, no Stripe call is made (free).
    """
    tutor = _maybe_sync_kyc_status(tutor, session)
    return _serialize_tutor(tutor)


@router.patch("/me", response_model=TutorRead)
def update_current_tutor(
    payload: TutorUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TutorRead:
    """Tutor edits their own profile. Requires both a valid JWT and that
    the user be the owner of the resolved Tutor for this host.

    Identity fields update User; tutor-only fields update Tutor. Both rows
    update in a single commit so the response always reflects the final
    state.
    """
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return _serialize_tutor(tutor)

    now = datetime.now(UTC)
    tutor_dirty = False
    user_dirty = False

    # Tutor-side fields
    if "display_name" in changes:
        tutor.display_name = changes["display_name"]
        tutor_dirty = True
    if "public_reply_email" in changes:
        tutor.public_reply_email = changes["public_reply_email"]
        tutor_dirty = True

    # User-side identity fields (single source — shared with marketplace profile)
    if "bio" in changes:
        current.bio = changes["bio"]
        user_dirty = True
    if "photo_url" in changes:
        current.avatar_url = changes["photo_url"]
        user_dirty = True
    if "languages_taught" in changes:
        current.languages = changes["languages_taught"]
        user_dirty = True

    if tutor_dirty:
        tutor.updated_at = now
        session.add(tutor)
    if user_dirty:
        current.updated_at = now
        session.add(current)
    if tutor_dirty or user_dirty:
        session.commit()
        session.refresh(tutor)
        session.refresh(current)
    return _serialize_tutor(tutor)


# --- Lesson packs --------------------------------------------------------


class LessonPackRead(BaseModel):
    id: int
    tutor_id: int
    name: str
    description: str | None
    num_lessons: int
    duration_minutes: int
    price_cents: int
    currency: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LessonPackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    num_lessons: int = Field(ge=1, le=200)
    duration_minutes: int = Field(ge=15, le=240)
    price_cents: int = Field(ge=0, le=10_000_00)  # max €10 000
    currency: str = Field(default="eur", min_length=3, max_length=3)


class LessonPackUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    num_lessons: int | None = Field(default=None, ge=1, le=200)
    duration_minutes: int | None = Field(default=None, ge=15, le=240)
    price_cents: int | None = Field(default=None, ge=0, le=10_000_00)
    is_active: bool | None = None


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


@router.get("/lesson-packs", response_model=list[LessonPackRead])
def list_lesson_packs(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[LessonPackRead]:
    """Public list of active paid packs for the resolved tenant.

    Excludes the auto-managed trial pack (is_trial=True) — that one is
    surfaced through GET /tutor/trial separately so the tutor's site can
    show a distinct "Try a free X-min lesson" CTA.
    """
    rows = session.exec(
        select(LessonPack)
        .where(
            LessonPack.tutor_id == tutor.id,
            LessonPack.is_active == True,  # noqa: E712
            LessonPack.is_trial == False,  # noqa: E712
        )
        .order_by(LessonPack.num_lessons.asc(), LessonPack.price_cents.asc())
    ).all()
    return [LessonPackRead.model_validate(r) for r in rows]


@router.get("/lesson-packs/all", response_model=list[LessonPackRead])
def list_all_lesson_packs(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[LessonPackRead]:
    """Owner-only — includes inactive paid packs so the dashboard can show
    + restore. Hides the auto-managed trial pack; the trial is configured
    through GET/PUT /tutor/trial."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(LessonPack)
        .where(
            LessonPack.tutor_id == tutor.id,
            LessonPack.is_trial == False,  # noqa: E712
        )
        .order_by(LessonPack.is_active.desc(), LessonPack.num_lessons.asc(), LessonPack.price_cents.asc())
    ).all()
    return [LessonPackRead.model_validate(r) for r in rows]


# --- Free trial ----------------------------------------------------------


class TrialSettingsRead(BaseModel):
    offers_free_trial: bool
    free_trial_minutes: int
    free_trial_limit_per_student: int


class TrialSettingsUpdate(BaseModel):
    offers_free_trial: bool
    free_trial_minutes: int | None = Field(default=None, ge=15, le=120)
    # free_trial_limit_per_student is intentionally NOT writable — every
    # student is capped at one trial per tutor, lifetime. The DB column
    # stays for now (deprecated; defaults to 1 and isn't used by the
    # trial-book check anymore).


def _ensure_trial_pack(tutor: Tutor, session: Session) -> LessonPack:
    """Idempotent: ensure exactly one is_trial=True pack exists for the tutor
    matching the current trial-minutes setting. Reactivates if previously
    deactivated.
    """
    existing = session.exec(
        select(LessonPack).where(
            LessonPack.tutor_id == tutor.id,
            LessonPack.is_trial == True,  # noqa: E712
        )
    ).first()
    now = datetime.now(UTC)
    if existing:
        existing.duration_minutes = tutor.free_trial_minutes
        existing.is_active = True
        existing.name = f"Free {tutor.free_trial_minutes}-minute trial"
        existing.price_cents = 0
        existing.updated_at = now
        session.add(existing)
        return existing
    pack = LessonPack(
        tutor_id=tutor.id,
        name=f"Free {tutor.free_trial_minutes}-minute trial",
        description="A short intro lesson, on us — no card needed.",
        num_lessons=1,
        duration_minutes=tutor.free_trial_minutes,
        price_cents=0,
        currency="eur",
        is_active=True,
        is_trial=True,
    )
    session.add(pack)
    return pack


def _deactivate_trial_pack(tutor: Tutor, session: Session) -> None:
    pack = session.exec(
        select(LessonPack).where(
            LessonPack.tutor_id == tutor.id,
            LessonPack.is_trial == True,  # noqa: E712
        )
    ).first()
    if pack:
        pack.is_active = False
        pack.updated_at = datetime.now(UTC)
        session.add(pack)


@router.get("/trial", response_model=TrialSettingsRead)
def read_trial_settings(tutor: CurrentTutor) -> TrialSettingsRead:
    """Public — the tutor's trial offer config. Used by the student-facing
    site to decide whether to show the "Try a free lesson" CTA."""
    return TrialSettingsRead(
        offers_free_trial=tutor.offers_free_trial,
        free_trial_minutes=tutor.free_trial_minutes,
        free_trial_limit_per_student=tutor.free_trial_limit_per_student,
    )


@router.put("/trial", response_model=TrialSettingsRead)
def update_trial_settings(
    payload: TrialSettingsUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TrialSettingsRead:
    """Owner-only — toggle trial on/off + set duration + per-student cap.

    Side effect: when offers_free_trial flips to True we auto-create (or
    reactivate) the trial LessonPack; when it flips to False we deactivate
    that pack so the public site stops advertising it.
    """
    _require_owner(tutor, current)
    tutor.offers_free_trial = payload.offers_free_trial
    if payload.free_trial_minutes is not None:
        tutor.free_trial_minutes = payload.free_trial_minutes
    # `free_trial_limit_per_student` is no longer configurable — always 1.
    tutor.free_trial_limit_per_student = 1
    tutor.updated_at = datetime.now(UTC)
    session.add(tutor)

    if tutor.offers_free_trial:
        _ensure_trial_pack(tutor, session)
    else:
        _deactivate_trial_pack(tutor, session)
    session.commit()
    session.refresh(tutor)
    return TrialSettingsRead(
        offers_free_trial=tutor.offers_free_trial,
        free_trial_minutes=tutor.free_trial_minutes,
        free_trial_limit_per_student=tutor.free_trial_limit_per_student,
    )


class TrialBookRequest(BaseModel):
    scheduled_at: datetime


class TrialBookResponse(BaseModel):
    booking_id: int
    scheduled_at: datetime
    duration_minutes: int


@router.post(
    "/trial/book",
    response_model=TrialBookResponse,
    status_code=status.HTTP_201_CREATED,
)
def book_trial(
    payload: TrialBookRequest,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TrialBookResponse:
    """Student-initiated free trial booking.

    Same validation as paid bookings (active tutor, future slot, slot fits
    an availability window) but no Stripe call — we create a CONFIRMED
    booking directly. Enforces `Tutor.free_trial_limit_per_student` across
    every prior trial booking the student has with this tutor (any status
    except CANCELLED).
    """
    if not tutor.offers_free_trial:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This tutor isn't offering free trials.",
        )
    if tutor.account_status != TutorAccountStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tutor isn't accepting bookings right now.",
        )
    if payload.scheduled_at <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pick a time in the future.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't book a trial with yourself.",
        )

    trial_pack = session.exec(
        select(LessonPack).where(
            LessonPack.tutor_id == tutor.id,
            LessonPack.is_trial == True,  # noqa: E712
            LessonPack.is_active == True,  # noqa: E712
        )
    ).first()
    if not trial_pack:
        # Defensive: tutor toggled trials on but we don't have a pack row.
        trial_pack = _ensure_trial_pack(tutor, session)
        session.commit()
        session.refresh(trial_pack)

    # Hard cap: ONE free trial per student per tutor, lifetime. Not
    # configurable — Sophia's call, prevents abuse and keeps the "trial"
    # concept meaningful as a conversion hook. Anything except an
    # explicit CANCELLED counts (a refunded trial is still "consumed").
    prior = session.exec(
        select(Booking).where(
            Booking.tutor_id == tutor.id,
            Booking.student_user_id == current.id,
            Booking.lesson_pack_id == trial_pack.id,
            Booking.status != BookingStatus.CANCELLED,
        )
    ).first()
    if prior is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You've already booked your free trial with this tutor — "
                "next steps are a paid lesson."
            ),
        )

    booking = Booking(
        tutor_id=tutor.id,
        student_user_id=current.id,
        lesson_pack_id=trial_pack.id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=trial_pack.duration_minutes,
        price_cents=0,
        currency=trial_pack.currency,
        platform_fee_cents=0,
        status=BookingStatus.CONFIRMED,
        paid_at=datetime.now(UTC),
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)

    # Mirror the paid-booking notification.
    session.add(
        Notification(
            user_id=tutor.user_id,
            message=(
                f"New free trial booked for "
                f"{booking.scheduled_at.strftime('%a %d %b · %H:%M UTC')}."
            ),
            link="/dashboard",
        )
    )
    session.commit()

    return TrialBookResponse(
        booking_id=booking.id,
        scheduled_at=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
    )


@router.post(
    "/lesson-packs",
    response_model=LessonPackRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lesson_pack(
    payload: LessonPackCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> LessonPackRead:
    _require_owner(tutor, current)
    pack = LessonPack(
        tutor_id=tutor.id,
        name=payload.name.strip(),
        description=payload.description,
        num_lessons=payload.num_lessons,
        duration_minutes=payload.duration_minutes,
        price_cents=payload.price_cents,
        currency=payload.currency.lower(),
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    return LessonPackRead.model_validate(pack)


@router.patch("/lesson-packs/{pack_id}", response_model=LessonPackRead)
def update_lesson_pack(
    pack_id: int,
    payload: LessonPackUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> LessonPackRead:
    _require_owner(tutor, current)
    pack = session.get(LessonPack, pack_id)
    if not pack or pack.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pack not found.")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return LessonPackRead.model_validate(pack)
    for key, value in changes.items():
        setattr(pack, key, value)
    pack.updated_at = datetime.now(UTC)
    session.add(pack)
    session.commit()
    session.refresh(pack)
    return LessonPackRead.model_validate(pack)


# --- Bookings ------------------------------------------------------------


def _tenant_url(tutor_slug: str, path: str) -> str:
    """Build a URL on the tutor's subdomain matching the configured frontend_url
    apex. Works in both dev (`http://localhost:5173` → `http://vasso.localhost:5173`)
    and prod (`https://kotobaseed.net` → `https://vasso.kotobaseed.net`).
    """
    from urllib.parse import urlparse

    apex = urlparse(settings.frontend_url)
    return f"{apex.scheme}://{tutor_slug}.{apex.netloc}{path}"


def _platform_fee_for(tutor_user: User, amount_cents: int) -> int:
    """Application Fee in cents based on the tutor-User's subscription tier.

    Free + Plus → 5% of the lesson price.
    Pro + Business → 0% (one of the headline Pro perks).
    """
    if tutor_user.subscription_tier in (SubscriptionTier.PRO, SubscriptionTier.BUSINESS):
        return 0
    return round(amount_cents * 0.05)


class BookingCheckoutRequest(BaseModel):
    scheduled_at: datetime = Field(description="When the student wants the first lesson")


class BookingCheckoutResponse(BaseModel):
    checkout_url: str
    booking_id: int


@router.post(
    "/lesson-packs/{pack_id}/book",
    response_model=BookingCheckoutResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_booking_checkout(
    pack_id: int,
    payload: BookingCheckoutRequest,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> BookingCheckoutResponse:
    """Student-initiated. Creates a PENDING_PAYMENT Booking and a Stripe
    Checkout session that routes the funds to the tutor's Connect account
    with the platform fee applied.
    """
    pack = session.get(LessonPack, pack_id)
    if not pack or pack.tutor_id != tutor.id or not pack.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pack not found.")
    if tutor.account_status != TutorAccountStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tutor isn't accepting bookings right now.",
        )
    if not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tutor's payment account isn't connected yet.",
        )
    if payload.scheduled_at <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pick a time in the future.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't book a lesson with yourself.",
        )

    fee = _platform_fee_for(tutor.user, pack.price_cents)

    booking = Booking(
        tutor_id=tutor.id,
        student_user_id=current.id,
        lesson_pack_id=pack.id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        platform_fee_cents=fee,
        status=BookingStatus.PENDING_PAYMENT,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)

    try:
        checkout = stripe.checkout.Session.create(
            api_key=settings.stripe_secret_key,
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": pack.currency,
                        "unit_amount": pack.price_cents,
                        "product_data": {
                            "name": f"{pack.name} — with {tutor.display_name}",
                            "description": pack.description or None,
                        },
                    },
                }
            ],
            payment_intent_data={
                "application_fee_amount": fee,
                "transfer_data": {"destination": tutor.stripe_connect_account_id},
                "metadata": {
                    "type": "booking",
                    "booking_id": str(booking.id),
                    "tutor_slug": tutor.tutor_slug,
                },
            },
            metadata={
                "type": "booking",
                "booking_id": str(booking.id),
                "tutor_slug": tutor.tutor_slug,
            },
            success_url=_tenant_url(tutor.tutor_slug, f"/booking/success?booking={booking.id}"),
            cancel_url=_tenant_url(tutor.tutor_slug, f"/booking/cancelled?booking={booking.id}"),
            client_reference_id=str(current.id),
        )
    except stripe.error.StripeError:
        log.exception(
            "Stripe Checkout creation failed for booking #%s (tutor %s)",
            booking.id,
            tutor.tutor_slug,
        )
        # Drop the orphaned booking — student can retry without "duplicate" noise.
        session.delete(booking)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout. Try again in a moment.",
        ) from None

    booking.stripe_checkout_session_id = checkout["id"]
    session.add(booking)
    session.commit()
    return BookingCheckoutResponse(checkout_url=checkout["url"], booking_id=booking.id)


@router.delete("/lesson-packs/{pack_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_lesson_pack(
    pack_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Soft-delete — flips `is_active=False` rather than removing the row, so
    historical bookings that reference this pack stay readable.
    """
    _require_owner(tutor, current)
    pack = session.get(LessonPack, pack_id)
    if not pack or pack.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pack not found.")
    pack.is_active = False
    pack.updated_at = datetime.now(UTC)
    session.add(pack)
    session.commit()


# --- Availability + slot computation -------------------------------------


class AvailabilityWindow(BaseModel):
    """One contiguous availability block on a weekly recurrence."""

    weekday: int = Field(ge=0, le=6, description="0=Monday, 6=Sunday")
    start_minute: int = Field(ge=0, le=1440, description="Minutes from midnight in tutor TZ")
    end_minute: int = Field(ge=0, le=1440)


class AvailabilityReplace(BaseModel):
    windows: list[AvailabilityWindow]


class AvailableSlot(BaseModel):
    """A bookable timeslot, projected from the tutor's recurring weekly
    availability and pruned against existing bookings."""

    scheduled_at: datetime  # UTC, ISO 8601
    duration_minutes: int


@router.get("/availability", response_model=list[AvailabilityWindow])
def list_availability(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[AvailabilityWindow]:
    """Public — the tutor's weekly recurring availability blocks."""
    rows = session.exec(
        select(TutorAvailability)
        .where(TutorAvailability.tutor_id == tutor.id)
        .order_by(TutorAvailability.weekday.asc(), TutorAvailability.start_minute.asc())
    ).all()
    return [
        AvailabilityWindow(
            weekday=r.weekday,
            start_minute=r.start_minute,
            end_minute=r.end_minute,
        )
        for r in rows
    ]


@router.put("/availability", response_model=list[AvailabilityWindow])
def replace_availability(
    payload: AvailabilityReplace,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[AvailabilityWindow]:
    """Owner-only — bulk replace the tutor's weekly availability.

    Idempotent: send the full list you want; we delete-and-recreate. This
    matches how the click-grid editor works (compute new set in the
    browser, send the result).
    """
    _require_owner(tutor, current)
    # Validate first — every window must have end_minute > start_minute and
    # span at least 15 minutes, so the slot computation can't produce empty
    # ranges later.
    for w in payload.windows:
        if w.end_minute <= w.start_minute:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each window must end after it starts.",
            )
        if w.end_minute - w.start_minute < 15:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each window must be at least 15 minutes long.",
            )

    # Delete existing, add new — all in one commit.
    for r in session.exec(
        select(TutorAvailability).where(TutorAvailability.tutor_id == tutor.id)
    ).all():
        session.delete(r)
    for w in payload.windows:
        session.add(
            TutorAvailability(
                tutor_id=tutor.id,
                weekday=w.weekday,
                start_minute=w.start_minute,
                end_minute=w.end_minute,
            )
        )
    session.commit()
    return list_availability(tutor=tutor, session=session)


def _utc_minute(d: datetime) -> int:
    """Local-tz minute-from-midnight for a UTC-aware datetime."""
    return d.hour * 60 + d.minute


def _slot_conflicts(
    slot_start: datetime, duration_minutes: int, bookings: list[Booking]
) -> bool:
    """True if the slot overlaps with any non-cancelled, non-refunded booking."""
    slot_end_ts = slot_start.timestamp() + duration_minutes * 60
    slot_start_ts = slot_start.timestamp()
    for b in bookings:
        if b.status in (BookingStatus.CANCELLED, BookingStatus.REFUNDED):
            continue
        b_start = b.scheduled_at
        if b_start.tzinfo is None:
            b_start = b_start.replace(tzinfo=UTC)
        b_start_ts = b_start.timestamp()
        b_end_ts = b_start_ts + b.duration_minutes * 60
        if slot_start_ts < b_end_ts and b_start_ts < slot_end_ts:
            return True
    return False


@router.get("/availability/slots", response_model=list[AvailableSlot])
def list_available_slots(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    pack_id: int,
    days: int = 14,
    slot_step_minutes: int = 30,
) -> list[AvailableSlot]:
    """Public — bookable slots for the next `days` days for a specific pack.

    Computed by:
      1. Pulling the tutor's recurring weekly availability windows.
      2. For each day in [today, today+days), projecting each window into
         absolute datetimes using the tutor's timezone (User.timezone).
      3. Walking each window in `slot_step_minutes` increments, generating
         candidate slot starts of length `pack.duration_minutes`. Skipping
         any slot that:
          - starts in the past
          - extends past the end of its window
          - overlaps an existing non-cancelled booking
      4. Returning the surviving slots in UTC, soonest first.

    Defaults to 14 days ahead and 30-minute granularity — same as the
    click-grid editor on the dashboard.
    """
    pack = session.get(LessonPack, pack_id)
    if not pack or pack.tutor_id != tutor.id or not pack.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pack not found.")
    if days < 1 or days > 60:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`days` must be between 1 and 60.",
        )
    if slot_step_minutes < 15 or slot_step_minutes > 120:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`slot_step_minutes` must be between 15 and 120.",
        )

    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    tz_name = (tutor.user.timezone if tutor.user else "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")

    # Pre-load availability + bookings into memory; both are small per tutor.
    windows = list(
        session.exec(
            select(TutorAvailability).where(TutorAvailability.tutor_id == tutor.id)
        ).all()
    )
    if not windows:
        return []

    now_utc = datetime.now(UTC)
    horizon_utc = now_utc + timedelta(days=days)
    bookings = list(
        session.exec(
            select(Booking)
            .where(Booking.tutor_id == tutor.id)
            .where(Booking.scheduled_at >= now_utc - timedelta(hours=1))
            .where(Booking.scheduled_at <= horizon_utc + timedelta(hours=1))
        ).all()
    )

    windows_by_weekday: dict[int, list[TutorAvailability]] = {}
    for w in windows:
        windows_by_weekday.setdefault(w.weekday, []).append(w)

    # Iterate day by day in the tutor's local timezone — that way DST rolls
    # over naturally without us reasoning about UTC offsets.
    today_local = now_utc.astimezone(tz).date()
    slots: list[AvailableSlot] = []

    for day_offset in range(days):
        local_date = today_local + timedelta(days=day_offset)
        weekday = local_date.weekday()  # Monday = 0
        for window in windows_by_weekday.get(weekday, []):
            candidate_minute = window.start_minute
            while candidate_minute + pack.duration_minutes <= window.end_minute:
                local_start = datetime(
                    local_date.year,
                    local_date.month,
                    local_date.day,
                    hour=candidate_minute // 60,
                    minute=candidate_minute % 60,
                    tzinfo=tz,
                )
                slot_utc = local_start.astimezone(UTC)
                # Skip past slots; also avoid the very-imminent ones —
                # students need a minute to actually book.
                if slot_utc < now_utc + timedelta(minutes=15):
                    candidate_minute += slot_step_minutes
                    continue
                if slot_utc > horizon_utc:
                    break
                if not _slot_conflicts(slot_utc, pack.duration_minutes, bookings):
                    slots.append(
                        AvailableSlot(
                            scheduled_at=slot_utc,
                            duration_minutes=pack.duration_minutes,
                        )
                    )
                candidate_minute += slot_step_minutes

    slots.sort(key=lambda s: s.scheduled_at)
    return slots


# --- Booking management (tutor side) -------------------------------------


class BookingRead(BaseModel):
    id: int
    tutor_id: int
    student_user_id: int
    student_name: str | None
    lesson_pack_id: int
    pack_name: str | None
    scheduled_at: datetime
    duration_minutes: int
    price_cents: int
    currency: str
    platform_fee_cents: int
    status: BookingStatus
    paid_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None
    created_at: datetime


def _serialize_booking(booking: Booking, *, student: User | None, pack: LessonPack | None) -> BookingRead:
    return BookingRead(
        id=booking.id,
        tutor_id=booking.tutor_id,
        student_user_id=booking.student_user_id,
        student_name=student.full_name if student else None,
        lesson_pack_id=booking.lesson_pack_id,
        pack_name=pack.name if pack else None,
        scheduled_at=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        price_cents=booking.price_cents,
        currency=booking.currency,
        platform_fee_cents=booking.platform_fee_cents,
        status=booking.status,
        paid_at=booking.paid_at,
        completed_at=booking.completed_at,
        cancelled_at=booking.cancelled_at,
        refunded_at=booking.refunded_at,
        created_at=booking.created_at,
    )


@router.get("/bookings", response_model=list[BookingRead])
def list_tutor_bookings(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[BookingRead]:
    """Owner-only — bookings for the current tutor, soonest first for the
    upcoming ones, then completed/cancelled in recent-first order."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(Booking)
        .where(Booking.tutor_id == tutor.id)
        .order_by(Booking.scheduled_at.desc())
    ).all()
    # Bulk-load students and packs to avoid N+1.
    student_ids = {b.student_user_id for b in rows}
    pack_ids = {b.lesson_pack_id for b in rows}
    students = {
        u.id: u
        for u in session.exec(select(User).where(User.id.in_(student_ids))).all()
    } if student_ids else {}
    packs = {
        p.id: p
        for p in session.exec(select(LessonPack).where(LessonPack.id.in_(pack_ids))).all()
    } if pack_ids else {}
    return [
        _serialize_booking(b, student=students.get(b.student_user_id), pack=packs.get(b.lesson_pack_id))
        for b in rows
    ]


class ClassroomTokenResponse(BaseModel):
    room_url: str
    token: str
    role: str  # "tutor" or "student"


def _generate_room_name(booking: Booking) -> str:
    """Stable per-booking room slug."""
    return f"kb-{booking.id}-{int(booking.scheduled_at.timestamp())}"


def _classroom_window_ok(booking: Booking) -> tuple[bool, str | None]:
    """Return (allowed, reason_if_not). Doors open `classroom_join_lead_minutes`
    before scheduled_at and close `classroom_join_grace_minutes` after the
    end."""
    now = datetime.now(UTC)
    scheduled = booking.scheduled_at
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=UTC)
    open_at = scheduled - timedelta(minutes=settings.classroom_join_lead_minutes)
    close_at = (
        scheduled
        + timedelta(minutes=booking.duration_minutes + settings.classroom_join_grace_minutes)
    )
    if now < open_at:
        return False, f"The classroom opens at {open_at.isoformat()} (15 min before the lesson)."
    if now > close_at:
        return False, "This lesson is over — the classroom is closed."
    return True, None


def _ensure_room(booking: Booking, session: Session) -> tuple[str, str]:
    """Lazy-create the Daily room and memoize on the Booking row.

    Returns (room_name, room_url). Raises DailyNotConfiguredError if the
    platform isn't wired for Daily, or any httpx error if the API call
    fails.
    """
    from ..services.daily import create_room, default_room_expiry

    if booking.daily_room_name and booking.daily_room_url:
        return booking.daily_room_name, booking.daily_room_url

    name = _generate_room_name(booking)
    room = create_room(
        name=name,
        expires_at=default_room_expiry(booking.scheduled_at, booking.duration_minutes),
    )
    booking.daily_room_name = room["name"]
    booking.daily_room_url = room["url"]
    booking.updated_at = datetime.now(UTC)
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking.daily_room_name, booking.daily_room_url


def _mint_classroom_token(
    *,
    booking: Booking,
    user: User,
    is_owner: bool,
    session: Session,
) -> ClassroomTokenResponse:
    """Shared inside-the-classroom-token logic for tutor + student endpoints."""
    from ..services.daily import (
        DailyNotConfiguredError,
        create_meeting_token,
        default_token_expiry,
    )

    if booking.status not in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Booking is {booking.status.value}; classroom only opens for confirmed lessons.",
        )
    ok, reason = _classroom_window_ok(booking)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    try:
        room_name, room_url = _ensure_room(booking, session)
        token = create_meeting_token(
            room_name=room_name,
            user_name=user.full_name or user.email,
            is_owner=is_owner,
            expires_at=default_token_expiry(booking.scheduled_at, booking.duration_minutes),
        )
    except DailyNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from None
    except httpx.HTTPError:
        log.exception("Daily.co API error for booking #%s", booking.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Classroom video service is having a moment. Try again.",
        ) from None

    return ClassroomTokenResponse(
        room_url=room_url, token=token, role="tutor" if is_owner else "student"
    )


@router.post("/bookings/{booking_id}/classroom-token", response_model=ClassroomTokenResponse)
def tutor_classroom_token(
    booking_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ClassroomTokenResponse:
    """Tutor-side classroom join. Owner-only. Tutor joins as Daily room owner."""
    _require_owner(tutor, current)
    booking = session.get(Booking, booking_id)
    if not booking or booking.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    return _mint_classroom_token(booking=booking, user=current, is_owner=True, session=session)


@router.post("/bookings/{booking_id}/complete", response_model=BookingRead)
def mark_booking_complete(
    booking_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> BookingRead:
    """Tutor marks a confirmed booking as completed.

    Side effects: bumps `Tutor.classroom_minutes_used_this_cycle`, sets
    `Tutor.last_completed_lesson_at` (which feeds the dormant-pause cron),
    and stamps `Booking.completed_at`. Pending or already-completed
    bookings can't be re-completed; cancelled ones can't either.
    """
    _require_owner(tutor, current)
    booking = session.get(Booking, booking_id)
    if not booking or booking.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Booking is {booking.status.value}; can only complete a confirmed booking.",
        )

    now = datetime.now(UTC)
    booking.status = BookingStatus.COMPLETED
    booking.completed_at = now
    booking.updated_at = now

    tutor.classroom_minutes_used_this_cycle = (
        tutor.classroom_minutes_used_this_cycle or 0
    ) + booking.duration_minutes
    tutor.last_completed_lesson_at = now
    tutor.updated_at = now

    session.add(booking)
    session.add(tutor)
    session.commit()
    session.refresh(booking)

    student = session.get(User, booking.student_user_id)
    pack = session.get(LessonPack, booking.lesson_pack_id)
    return _serialize_booking(booking, student=student, pack=pack)
