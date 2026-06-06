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
    list_in_marketplace: bool
    cancellation_cutoff_hours: int
    theme: str
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
        list_in_marketplace=tutor.list_in_marketplace,
        cancellation_cutoff_hours=tutor.cancellation_cutoff_hours,
        theme=tutor.theme or "sage",
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
    list_in_marketplace: bool | None = None
    cancellation_cutoff_hours: int | None = Field(default=None, ge=48, le=720)
    theme: str | None = Field(default=None, max_length=32)
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


class ThemeOption(BaseModel):
    key: str
    label: str
    description: str


@router.get("/themes", response_model=list[ThemeOption])
def list_themes() -> list[ThemeOption]:
    """Public — the curated theme list for the page builder picker."""
    from ..services.themes import THEMES

    return [ThemeOption(**theme) for theme in THEMES]


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
    if "list_in_marketplace" in changes:
        tutor.list_in_marketplace = bool(changes["list_in_marketplace"])
        tutor_dirty = True
    if "cancellation_cutoff_hours" in changes:
        tutor.cancellation_cutoff_hours = int(changes["cancellation_cutoff_hours"])
        tutor_dirty = True
    if "theme" in changes and changes["theme"] is not None:
        from ..services.themes import THEME_KEYS

        # Themes are a Pro feature — match the page builder + custom domain
        # plan gates. Free/Plus stay on the default `sage` theme.
        if not current.is_pro_subscriber:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Themes are a Pro feature. Upgrade your plan to switch.",
            )
        if changes["theme"] not in THEME_KEYS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown theme. Pick one of: {', '.join(sorted(THEME_KEYS))}.",
            )
        tutor.theme = changes["theme"]
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
    is_default_single: bool
    is_group: bool = False
    max_students: int | None = None
    min_students: int | None = None
    group_min_threshold_hours: int = 24
    created_at: datetime

    model_config = {"from_attributes": True}


class LessonPackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    num_lessons: int = Field(ge=1, le=200)
    duration_minutes: int = Field(ge=15, le=240)
    price_cents: int = Field(ge=0, le=10_000_00)  # max €10 000
    currency: str = Field(default="eur", min_length=3, max_length=3)
    # Group lesson fields (all optional — 1:1 packs leave them null/false).
    is_group: bool = False
    max_students: int | None = Field(default=None, ge=2, le=200)
    min_students: int | None = Field(default=None, ge=2, le=200)
    group_min_threshold_hours: int | None = Field(default=None, ge=1, le=168)


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
    + restore. Hides the auto-managed trial pack AND the headline single-
    lesson pack; both are configured through dedicated endpoints
    (/tutor/trial, /tutor/single-lesson) so the LessonPackManager stays
    focused on multi-lesson packs and any extra single-lesson variants the
    tutor wants to add."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(LessonPack)
        .where(
            LessonPack.tutor_id == tutor.id,
            LessonPack.is_trial == False,  # noqa: E712
            LessonPack.is_default_single == False,  # noqa: E712
        )
        .order_by(LessonPack.is_active.desc(), LessonPack.num_lessons.asc(), LessonPack.price_cents.asc())
    ).all()
    return [LessonPackRead.model_validate(r) for r in rows]


# --- Headline single lesson ---------------------------------------------


class SingleLessonRead(BaseModel):
    """Owner-side read of the headline single-lesson pack. Returns nulls when
    the tutor hasn't set one up yet so the dashboard widget can show empty
    fields without erroring."""

    price_cents: int | None
    duration_minutes: int | None
    currency: str | None
    is_active: bool


class SingleLessonUpdate(BaseModel):
    """Tutor types in their headline single-lesson rate. Both fields required
    on creation; either can be patched in isolation later."""

    price_cents: int = Field(ge=0, le=10_000_00)
    duration_minutes: int = Field(ge=15, le=240)
    currency: str = Field(default="eur", min_length=3, max_length=3)


def _get_default_single_pack(tutor: Tutor, session: Session) -> LessonPack | None:
    """Return the tutor's headline single-lesson pack, if any. There should
    only ever be one is_default_single=True pack per tutor — we use first()
    to be lenient in case of historical data."""
    return session.exec(
        select(LessonPack).where(
            LessonPack.tutor_id == tutor.id,
            LessonPack.is_default_single == True,  # noqa: E712
        )
    ).first()


@router.get("/single-lesson", response_model=SingleLessonRead)
def read_single_lesson(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> SingleLessonRead:
    """Public — returns the tutor's headline single-lesson config (or nulls).
    Exposes only the price/duration/active state. The tutor's site uses
    the regular /lesson-packs feed to render bookable cards."""
    pack = _get_default_single_pack(tutor, session)
    if pack is None:
        return SingleLessonRead(
            price_cents=None,
            duration_minutes=None,
            currency=None,
            is_active=False,
        )
    return SingleLessonRead(
        price_cents=pack.price_cents,
        duration_minutes=pack.duration_minutes,
        currency=pack.currency,
        is_active=pack.is_active,
    )


@router.put("/single-lesson", response_model=SingleLessonRead)
def upsert_single_lesson(
    payload: SingleLessonUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> SingleLessonRead:
    """Owner-only — set or update the headline single-lesson price and
    duration. Creates the underlying LessonPack with is_default_single=True
    the first time the tutor saves; subsequent saves just update price +
    duration."""
    _require_owner(tutor, current)
    pack = _get_default_single_pack(tutor, session)
    now = datetime.now(UTC)
    if pack is None:
        pack = LessonPack(
            tutor_id=tutor.id,
            name="Single lesson",
            num_lessons=1,
            duration_minutes=payload.duration_minutes,
            price_cents=payload.price_cents,
            currency=payload.currency,
            is_active=True,
            is_default_single=True,
        )
        session.add(pack)
    else:
        pack.price_cents = payload.price_cents
        pack.duration_minutes = payload.duration_minutes
        pack.currency = payload.currency
        pack.is_active = True
        pack.updated_at = now
        session.add(pack)
    session.commit()
    session.refresh(pack)
    return SingleLessonRead(
        price_cents=pack.price_cents,
        duration_minutes=pack.duration_minutes,
        currency=pack.currency,
        is_active=pack.is_active,
    )


@router.delete("/single-lesson", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_single_lesson(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Owner-only — deactivate the headline single-lesson pack. Soft-delete
    so any existing bookings continue to read the pack name + duration."""
    _require_owner(tutor, current)
    pack = _get_default_single_pack(tutor, session)
    if pack is None or not pack.is_active:
        return
    pack.is_active = False
    pack.updated_at = datetime.now(UTC)
    session.add(pack)
    session.commit()


# --- Analytics (owner only) ---------------------------------------------


class AnalyticsCurrentMonth(BaseModel):
    month_label: str  # e.g. "June 2026"
    revenue_cents: int
    currency: str  # snapshot from latest booking; "eur" default
    lessons_completed: int
    hours_taught: float
    new_students: int


class AnalyticsLifetime(BaseModel):
    total_students: int  # distinct paying students, ever
    repeat_students: int  # those with 2+ paid bookings
    trial_to_paid_conversion_rate: float | None  # null when no trials yet


class AnalyticsUpcoming(BaseModel):
    confirmed_count: int  # all confirmed future bookings
    next_7_days: int  # subset within the next week


class AnalyticsTrendPoint(BaseModel):
    month: str  # ISO `YYYY-MM`
    revenue_cents: int
    lessons: int


class TutorAnalytics(BaseModel):
    current_month: AnalyticsCurrentMonth
    lifetime: AnalyticsLifetime
    upcoming: AnalyticsUpcoming
    monthly_trend: list[AnalyticsTrendPoint]  # last 6 months chronological


def _month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _month_label(dt: datetime) -> str:
    return dt.strftime("%B %Y")


@router.get("/analytics", response_model=TutorAnalytics)
def read_analytics(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TutorAnalytics:
    """Owner-only — business summary metrics for the dashboard.

    Revenue counts COMPLETED bookings only (REFUNDED and CANCELLED never
    earn the tutor anything; CONFIRMED-but-not-yet-completed is pipeline,
    not revenue). The tutor's take is `price_cents - platform_fee_cents`
    so the displayed number reflects what actually lands in their Stripe
    Connect account, not the gross.
    """
    _require_owner(tutor, current)
    now = datetime.now(UTC)
    month_start = _month_start(now)

    # Pull every booking once + every pack once. Per-tutor volumes are
    # modest enough that in-memory aggregation beats five GROUP BY queries.
    bookings = list(
        session.exec(
            select(Booking).where(Booking.tutor_id == tutor.id)
        ).all()
    )
    pack_ids = {b.lesson_pack_id for b in bookings}
    packs_by_id = (
        {
            p.id: p
            for p in session.exec(
                select(LessonPack).where(LessonPack.id.in_(pack_ids))
            ).all()
        }
        if pack_ids
        else {}
    )

    def _completed_in_month(b: Booking) -> bool:
        if b.status != BookingStatus.COMPLETED:
            return False
        when = b.completed_at
        if when is None:
            return False
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        return when >= month_start

    def _first_paid_booking_per_student(rows: list[Booking]) -> dict[int, datetime]:
        """Map student_user_id → datetime of their FIRST non-trial booking."""
        firsts: dict[int, datetime] = {}
        for b in rows:
            pack = packs_by_id.get(b.lesson_pack_id)
            if pack is None or pack.is_trial:
                continue
            if b.status in (BookingStatus.CANCELLED,):
                continue
            when = b.created_at
            if when.tzinfo is None:
                when = when.replace(tzinfo=UTC)
            prev = firsts.get(b.student_user_id)
            if prev is None or when < prev:
                firsts[b.student_user_id] = when
        return firsts

    # ----- This month -----
    revenue_cents = 0
    lessons_completed = 0
    minutes_taught = 0
    currency = "eur"
    for b in bookings:
        if _completed_in_month(b):
            revenue_cents += max(0, b.price_cents - b.platform_fee_cents)
            lessons_completed += 1
            minutes_taught += b.duration_minutes
            currency = b.currency or currency

    firsts = _first_paid_booking_per_student(bookings)
    new_students_this_month = sum(
        1 for first_at in firsts.values() if first_at >= month_start
    )

    current_month = AnalyticsCurrentMonth(
        month_label=_month_label(now),
        revenue_cents=revenue_cents,
        currency=currency,
        lessons_completed=lessons_completed,
        hours_taught=round(minutes_taught / 60, 1),
        new_students=new_students_this_month,
    )

    # ----- Lifetime -----
    paid_booking_count_per_student: dict[int, int] = {}
    trial_student_ids: set[int] = set()
    paid_student_ids: set[int] = set()
    for b in bookings:
        if b.status == BookingStatus.CANCELLED:
            continue
        pack = packs_by_id.get(b.lesson_pack_id)
        if pack is None:
            continue
        if pack.is_trial:
            trial_student_ids.add(b.student_user_id)
        else:
            paid_student_ids.add(b.student_user_id)
            paid_booking_count_per_student[b.student_user_id] = (
                paid_booking_count_per_student.get(b.student_user_id, 0) + 1
            )

    total_students = len(paid_student_ids)
    repeat_students = sum(1 for n in paid_booking_count_per_student.values() if n >= 2)
    conversion = None
    if trial_student_ids:
        trials_who_converted = len(trial_student_ids & paid_student_ids)
        conversion = round(trials_who_converted / len(trial_student_ids), 3)

    lifetime = AnalyticsLifetime(
        total_students=total_students,
        repeat_students=repeat_students,
        trial_to_paid_conversion_rate=conversion,
    )

    # ----- Upcoming -----
    week_ahead = now + timedelta(days=7)
    confirmed_future = []
    for b in bookings:
        if b.status != BookingStatus.CONFIRMED:
            continue
        when = b.scheduled_at
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        if when > now:
            confirmed_future.append(when)
    upcoming = AnalyticsUpcoming(
        confirmed_count=len(confirmed_future),
        next_7_days=sum(1 for w in confirmed_future if w <= week_ahead),
    )

    # ----- Monthly trend (last 6 months including current) -----
    # Build a fixed list of month buckets so empty months show as zero
    # rather than disappearing — Sophia gets to see the gap visually.
    trend_buckets: dict[str, dict[str, int]] = {}
    cursor = month_start
    for _ in range(6):
        trend_buckets[cursor.strftime("%Y-%m")] = {"revenue_cents": 0, "lessons": 0}
        # Roll back one month — handle Jan → previous Dec.
        if cursor.month == 1:
            cursor = cursor.replace(year=cursor.year - 1, month=12)
        else:
            cursor = cursor.replace(month=cursor.month - 1)
    cutoff = cursor  # one month before the last included month — exclusive
    for b in bookings:
        if b.status != BookingStatus.COMPLETED or b.completed_at is None:
            continue
        when = b.completed_at
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        if when <= cutoff:
            continue
        key = when.strftime("%Y-%m")
        bucket = trend_buckets.get(key)
        if bucket is None:
            continue
        bucket["revenue_cents"] += max(0, b.price_cents - b.platform_fee_cents)
        bucket["lessons"] += 1

    monthly_trend = [
        AnalyticsTrendPoint(
            month=key,
            revenue_cents=trend_buckets[key]["revenue_cents"],
            lessons=trend_buckets[key]["lessons"],
        )
        for key in sorted(trend_buckets.keys())
    ]

    return TutorAnalytics(
        current_month=current_month,
        lifetime=lifetime,
        upcoming=upcoming,
        monthly_trend=monthly_trend,
    )


# --- Booking policy (public) --------------------------------------------


class BookingPolicyRead(BaseModel):
    """Public — what the student needs to know about cancellation before
    they book. Used by BookingDialog to render the 'within-cutoff' warning
    when a slot lands inside the no-cancel window."""

    cancellation_cutoff_hours: int


@router.get("/policy", response_model=BookingPolicyRead)
def read_booking_policy(tutor: CurrentTutor) -> BookingPolicyRead:
    return BookingPolicyRead(
        cancellation_cutoff_hours=tutor.cancellation_cutoff_hours,
    )


# --- Custom domain (Pro+ feature) ---------------------------------------


class CustomDomainRead(BaseModel):
    """Owner-side read of the custom-domain config. `status` is computed
    so the dashboard widget doesn't have to derive it from timestamps:
      - not_set: no domain on record
      - pending: domain saved but not yet verified
      - verified: DNS lookup succeeded; tenancy middleware now honours it

    `last_check` is populated by the verify endpoint so the UI can show what
    we actually saw on the network — way more useful than a generic error.
    """

    domain: str | None
    status: str  # "not_set" | "pending" | "verified"
    verified_at: datetime | None
    target_ip: str | None  # what tutors should point their A record at
    last_check: dict | None = None  # {success, resolved_ip, expected_ip, message}


class CustomDomainUpdate(BaseModel):
    domain: str = Field(min_length=1, max_length=255)


def _custom_domain_state(tutor: Tutor) -> CustomDomainRead:
    from ..services.custom_domain import expected_target_ip

    if not tutor.custom_domain:
        status = "not_set"
    elif tutor.custom_domain_verified_at is None:
        status = "pending"
    else:
        status = "verified"
    return CustomDomainRead(
        domain=tutor.custom_domain,
        status=status,
        verified_at=tutor.custom_domain_verified_at,
        target_ip=expected_target_ip(),
    )


@router.get("/custom-domain", response_model=CustomDomainRead)
def read_custom_domain(
    current: CurrentUser,
    tutor: CurrentTutor,
) -> CustomDomainRead:
    """Owner-only — current custom-domain config + verification status."""
    _require_owner(tutor, current)
    return _custom_domain_state(tutor)


@router.put("/custom-domain", response_model=CustomDomainRead)
def upsert_custom_domain(
    payload: CustomDomainUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CustomDomainRead:
    """Owner-only — set or change the tutor's custom domain.

    Plan-gated: PRO and BUSINESS only. Saving a domain resets verification
    (any prior verified_at is cleared) — the tutor has to re-verify after
    every change so we never serve traffic for a stale, possibly-spoofed
    domain.
    """
    _require_owner(tutor, current)
    if not current.is_pro_subscriber:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Custom domains are a Pro feature. Upgrade your plan to enable.",
        )
    from ..services.custom_domain import DomainValidationError, normalize_domain

    try:
        normalized = normalize_domain(payload.domain)
    except DomainValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None

    existing = session.exec(
        select(Tutor).where(
            Tutor.custom_domain == normalized,
            Tutor.id != tutor.id,
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That domain is already claimed by another tutor.",
        )

    tutor.custom_domain = normalized
    tutor.custom_domain_verified_at = None
    tutor.updated_at = datetime.now(UTC)
    session.add(tutor)
    session.commit()
    session.refresh(tutor)
    return _custom_domain_state(tutor)


@router.post("/custom-domain/verify", response_model=CustomDomainRead)
def verify_custom_domain(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CustomDomainRead:
    """Owner-only — run the DNS check.

    On success: stamps `verified_at` and returns a 200 with `last_check` set
    to {success=true, resolved_ip, expected_ip, message}. On failure: still
    returns 200 (not 400), with `last_check.success=false` and a message the
    UI can render verbatim. Returning the diagnostic in the body is much
    more useful than throwing an opaque 4xx — the tutor can see exactly
    what IP we resolved vs what we expected and fix the DNS themselves.
    """
    _require_owner(tutor, current)
    if not tutor.custom_domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Save your domain first.",
        )
    from ..services.custom_domain import (
        expected_target_ip,
        resolve_a_record,
        verify_domain_dns,
    )

    expected = expected_target_ip()
    resolved = resolve_a_record(tutor.custom_domain)
    success = verify_domain_dns(tutor.custom_domain)

    state = _custom_domain_state(tutor)
    if success:
        tutor.custom_domain_verified_at = datetime.now(UTC)
        tutor.updated_at = datetime.now(UTC)
        session.add(tutor)
        session.commit()
        session.refresh(tutor)
        state = _custom_domain_state(tutor)
        state.last_check = {
            "success": True,
            "resolved_ip": resolved,
            "expected_ip": expected,
            "message": "DNS verified. Your domain is now serving your tutor site.",
        }
        return state

    if expected is None:
        message = (
            "We can't run DNS checks yet — the platform's server IP isn't "
            "configured. Contact support if this persists."
        )
    elif resolved is None:
        message = (
            f"We couldn't resolve {tutor.custom_domain}. Make sure you've "
            "added the A record at your registrar and saved it. DNS changes "
            "can take a few minutes to propagate."
        )
    else:
        message = (
            f"{tutor.custom_domain} resolves to {resolved}, but it should "
            f"point to {expected}. Update the A record at your registrar "
            "and try again."
        )

    state.last_check = {
        "success": False,
        "resolved_ip": resolved,
        "expected_ip": expected,
        "message": message,
    }
    return state


@router.delete("/custom-domain", status_code=status.HTTP_204_NO_CONTENT)
def remove_custom_domain(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Owner-only — clear the custom domain. Tutor's subdomain on
    kotobaseed.net always still works."""
    _require_owner(tutor, current)
    tutor.custom_domain = None
    tutor.custom_domain_verified_at = None
    tutor.updated_at = datetime.now(UTC)
    session.add(tutor)
    session.commit()


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

    # Trial windows are a SUPERSET overlay on regular availability — the
    # tutor opts in per-window so they can protect peak hours for paid
    # students. The booking must land inside a window flagged allow_trial.
    if not _slot_fits_window(
        tutor=tutor,
        scheduled_at=payload.scheduled_at,
        duration_minutes=trial_pack.duration_minutes,
        session=session,
        trial_only=True,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This time isn't open for free trials. Pick a slot from the suggested list.",
        )

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

    # Email confirmations — failures swallowed inside the helper.
    from ..services import booking_emails

    booking_emails.send_confirmation_emails(session, booking)

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
        is_group=payload.is_group,
        max_students=payload.max_students,
        min_students=payload.min_students,
        group_min_threshold_hours=(
            payload.group_min_threshold_hours
            if payload.group_min_threshold_hours is not None
            else 24
        ),
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
    """One contiguous availability block on a weekly recurrence.

    `allow_trial=True` opts the window into free-trial bookings as well as
    paid bookings. Paid bookings ignore the flag entirely — trial windows
    only widen what's offered, never narrow paid availability.
    """

    weekday: int = Field(ge=0, le=6, description="0=Monday, 6=Sunday")
    start_minute: int = Field(ge=0, le=1440, description="Minutes from midnight in tutor TZ")
    end_minute: int = Field(ge=0, le=1440)
    allow_trial: bool = False


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
            allow_trial=r.allow_trial,
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
                allow_trial=w.allow_trial,
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


def _compute_slots(
    *,
    tutor: Tutor,
    duration_minutes: int,
    days: int,
    slot_step_minutes: int,
    session: Session,
    trial_only: bool,
) -> list[AvailableSlot]:
    """Shared slot walker used by paid and trial slot endpoints.

    When `trial_only=True`, only windows with `allow_trial=True` are walked.
    Otherwise every availability window contributes — paid bookings see all.
    """
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    tz_name = (tutor.user.timezone if tutor.user else "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")

    windows_q = select(TutorAvailability).where(
        TutorAvailability.tutor_id == tutor.id
    )
    if trial_only:
        windows_q = windows_q.where(TutorAvailability.allow_trial == True)  # noqa: E712
    windows = list(session.exec(windows_q).all())
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

    today_local = now_utc.astimezone(tz).date()
    slots: list[AvailableSlot] = []

    for day_offset in range(days):
        local_date = today_local + timedelta(days=day_offset)
        weekday = local_date.weekday()
        for window in windows_by_weekday.get(weekday, []):
            candidate_minute = window.start_minute
            while candidate_minute + duration_minutes <= window.end_minute:
                local_start = datetime(
                    local_date.year,
                    local_date.month,
                    local_date.day,
                    hour=candidate_minute // 60,
                    minute=candidate_minute % 60,
                    tzinfo=tz,
                )
                slot_utc = local_start.astimezone(UTC)
                if slot_utc < now_utc + timedelta(minutes=15):
                    candidate_minute += slot_step_minutes
                    continue
                if slot_utc > horizon_utc:
                    break
                if not _slot_conflicts(slot_utc, duration_minutes, bookings):
                    slots.append(
                        AvailableSlot(
                            scheduled_at=slot_utc,
                            duration_minutes=duration_minutes,
                        )
                    )
                candidate_minute += slot_step_minutes

    slots.sort(key=lambda s: s.scheduled_at)
    return slots


def _slot_fits_window(
    *,
    tutor: Tutor,
    scheduled_at: datetime,
    duration_minutes: int,
    session: Session,
    trial_only: bool,
) -> bool:
    """True if [scheduled_at, scheduled_at+duration) fits inside one of
    the tutor's recurring weekly windows. Respects the tutor's local TZ.

    When `trial_only=True`, only `allow_trial=True` windows are eligible.
    """
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    tz_name = (tutor.user.timezone if tutor.user else "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")

    local_start = scheduled_at.astimezone(tz)
    weekday = local_start.weekday()
    start_minute = local_start.hour * 60 + local_start.minute
    end_minute = start_minute + duration_minutes

    q = select(TutorAvailability).where(
        TutorAvailability.tutor_id == tutor.id,
        TutorAvailability.weekday == weekday,
        TutorAvailability.start_minute <= start_minute,
        TutorAvailability.end_minute >= end_minute,
    )
    if trial_only:
        q = q.where(TutorAvailability.allow_trial == True)  # noqa: E712
    return session.exec(q).first() is not None


@router.get("/availability/trial-slots", response_model=list[AvailableSlot])
def list_trial_slots(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    days: int = 14,
    slot_step_minutes: int = 30,
) -> list[AvailableSlot]:
    """Public — bookable free-trial slots for the next `days` days.

    Filters to availability windows where `allow_trial=True`, then walks
    them at `slot_step_minutes` granularity for the tutor's configured
    trial duration. Returns 404 if the tutor isn't offering trials.
    """
    if not tutor.offers_free_trial:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This tutor isn't offering free trials.",
        )
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
    return _compute_slots(
        tutor=tutor,
        duration_minutes=tutor.free_trial_minutes,
        days=days,
        slot_step_minutes=slot_step_minutes,
        session=session,
        trial_only=True,
    )


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

    # Auto-assign matching homework templates to the student. Local import
    # to avoid bootstrapping homework_grading on every tutor_site import.
    from ..services import homework_auto_assign

    homework_auto_assign.assign_for_completed_booking(
        session=session, tutor=tutor, booking=booking
    )

    student = session.get(User, booking.student_user_id)
    pack = session.get(LessonPack, booking.lesson_pack_id)

    # Referral evaluation — best-effort. Booking just moved to COMPLETED
    # so the student's attribution (if any) is now qualified.
    try:
        from ..models import ReferralAttribution
        from ..services import referrals as _referrals

        for attr in session.exec(
            select(ReferralAttribution).where(
                ReferralAttribution.referred_user_id == booking.student_user_id
            )
        ).all():
            _referrals.evaluate_attribution(session, attr)
        # Also evaluate any attribution where the TUTOR is the referee
        # (tutor-peer milestones key off completed lessons taught).
        for attr in session.exec(
            select(ReferralAttribution).where(
                ReferralAttribution.referred_user_id == tutor.user_id
            )
        ).all():
            _referrals.evaluate_attribution(session, attr)
    except Exception:
        log.exception(
            "Referral evaluation failed on completed booking %s", booking.id
        )

    # "Lesson complete" email to the student — best-effort.
    if student is not None:
        try:
            from ..services import (
                booking_emails,
                email as _email,
                email_templates as _templates,
            )

            tutor_site_url = booking_emails._tutor_site_url(tutor.tutor_slug)
            subject, html = _templates.render(
                "lesson_completed_student",
                {
                    "student_name": student.full_name or student.username or "there",
                    "tutor_name": tutor.display_name,
                    "tutor_site_url": tutor_site_url,
                },
                session=session,
                tutor=tutor,
            )
            _email.send_email(
                to=student.email,
                subject=subject,
                html=_email._wrap(subject, html),
                reply_to=tutor.public_reply_email,
            )
        except Exception:
            log.exception(
                "Could not send lesson-completed email for booking %s", booking.id
            )

    return _serialize_booking(booking, student=student, pack=pack)
