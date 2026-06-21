import io
import os
import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta

import stripe
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import and_, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_user, get_current_user_optional
from ..models import (
    Booking,
    BookingStatus,
    Conversation,
    LessonPack,
    Message,
    Notification,
    Pledge,
    PledgeStatus,
    PriorityCredit,
    PriorityCreditStatus,
    Project,
    ProjectRating,
    ProjectStatus,
    Request,
    TeacherFollower,
    TeacherVerification,
    Tutor,
    User,
    UserRole,
    VerificationStatus,
    VideoComment,
)
from ..routers.projects import _cancel_project_logic, _create_project_read
from ..schemas import FilterOptionsRead, LanguageLevelsRead, PaginatedProjectRead, _utc_aware

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Single placeholder User that owns data orphaned by self-delete or admin
# delete. Lookup-by-email is the way to dedupe; previously this lived in two
# files with two different addresses and could collide.
DELETED_USER_EMAIL = "deleted-user@kotobaseed.internal"

router = APIRouter(prefix="/users", tags=["users"])


def _get_or_create_deleted_user(session: Session) -> User:
    """Return the singleton placeholder User that owns orphaned data.

    Idempotent — safe to call from both the self-delete and admin-delete paths.
    """
    placeholder = session.exec(
        select(User).where(User.email == DELETED_USER_EMAIL)
    ).first()
    if placeholder:
        return placeholder
    now = datetime.now(UTC)
    placeholder = User(
        email=DELETED_USER_EMAIL,
        hashed_password="placeholder_deleted_password",
        full_name="Deleted User",
        role=UserRole.STUDENT,
        is_active=False,
        created_at=now,
        updated_at=now,
        deleted_at=now,
    )
    session.add(placeholder)
    session.commit()
    session.refresh(placeholder)
    return placeholder


# Pydantic Models
class OnboardingResponse(BaseModel):
    onboarding_url: str


class TeacherRead(BaseModel):
    id: int
    full_name: str


class UserProfile(BaseModel):
    id: int
    full_name: str
    bio: str | None
    languages: str | None
    role: UserRole
    created_at: str
    average_rating: float | None = None
    intro_video_url: str | None = None
    sample_video_url: str | None = None
    avatar_url: str | None = None
    verified_languages: list[str] = []
    language_groups: list[str] = []
    follower_count: int = 0
    is_following: bool = False
    # When a creator is also running a tutoring site (i.e. a Tutor row
    # exists for them), expose the slug so the frontend can offer
    # "Book a lesson with this tutor" alongside their creator work.
    tutor_slug: str | None = None
    tutor_display_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    full_name: str | None = None
    bio: str | None = None
    languages: str | None = None
    intro_video_url: str | None = None
    sample_video_url: str | None = None
    avatar_url: str | None = None
    profile_public: bool | None = None
    # GDPR Article 7(3) — consent must be as easy to withdraw as to give.
    # The setting flips back from the Settings page.
    newsletter_opt_in: bool | None = None
    # IANA timezone name (e.g. "Europe/Athens", "America/New_York"). Tutors
    # set this to control how their availability windows project into
    # absolute lesson times. Students see those times converted to their
    # browser-local timezone. Validated against the runtime tz database.
    timezone: str | None = None

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(v)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(
                f"{v!r} is not a recognised IANA timezone name"
            ) from exc
        return v


class ProjectInfoForRating(BaseModel):
    id: int
    title: str
    funding_goal: int
    language: str
    level: str
    tags: str | None = None


class TeacherRatingRead(BaseModel):
    rating: int
    comment: str | None
    created_at: datetime
    project: ProjectInfoForRating
    teacher_response: str | None = None
    response_created_at: datetime | None = None

    @field_validator("created_at", "response_created_at", mode="before")
    @classmethod
    def _ensure_utc(cls, v):
        return _utc_aware(v)


class FollowerRead(BaseModel):
    id: int
    full_name: str
    avatar_url: str | None
    total_pledged: int


class FollowingTeacherRead(BaseModel):
    id: int
    full_name: str
    avatar_url: str | None
    total_pledged: int


# API Endpoints
@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return the User row plus a `tutor_slug` (or null) so the apex
    Navbar knows whether to show "My site" / "My dashboard" entries.
    """
    tutor = session.exec(select(Tutor).where(Tutor.user_id == current_user.id)).first()
    payload = current_user.model_dump(exclude={"hashed_password"})
    payload["tutor_slug"] = tutor.tutor_slug if tutor else None
    return payload


@router.patch("/me", response_model=User)
def update_me(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user_data = user_in.model_dump(exclude_unset=True)
    for key, value in user_data.items():
        setattr(current_user, key, value)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


# --- Avatar upload --------------------------------------------------------

AVATAR_MAX_BYTES = 6 * 1024 * 1024  # 6 MB hard cap on the multipart body
AVATAR_OUTPUT_SIZE = 400  # square: 400x400, plenty for any UI surface
AVATAR_ACCEPTED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}


class AvatarResponse(BaseModel):
    avatar_url: str


@router.post("/me/avatar", response_model=AvatarResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AvatarResponse:
    """Replace the current user's profile photo.

    Pipeline:
    1. Validate MIME + size up front (cheap, before reading the body).
    2. Read the body into memory (capped at AVATAR_MAX_BYTES).
    3. Decode with Pillow — this also rejects forged MIME headers
       because corrupt/non-image bytes raise ``UnidentifiedImageError``.
    4. Square-crop centred, resize to AVATAR_OUTPUT_SIZE, strip EXIF.
    5. Re-encode as WebP (small + universal browser support) and upload
       to R2 under ``avatars/<user_id>/<rand>.webp``. A random suffix in
       the key forces cache-busting after re-upload without touching the
       CDN edge.
    6. Best-effort delete the previous file if we recognise it as ours.
    """
    from ..services import storage

    if not storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File uploads aren't available on this deployment yet.",
        )

    if file.content_type not in AVATAR_ACCEPTED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Please upload a JPEG, PNG, WebP, or HEIC image.",
        )

    raw = await file.read(AVATAR_MAX_BYTES + 1)
    if len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image is too large — keep it under {AVATAR_MAX_BYTES // (1024 * 1024)} MB.",
        )

    try:
        # Local import keeps Pillow off the critical import path.
        from PIL import Image, ImageOps, UnidentifiedImageError

        img = Image.open(io.BytesIO(raw))
        # `exif_transpose` honours the camera's orientation tag so
        # portrait-mode iOS photos don't end up sideways.
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        # Square crop centred, then resize once at the final size — this
        # is sharper than scale-then-crop for portrait/landscape inputs.
        img = ImageOps.fit(
            img,
            (AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE),
            method=Image.Resampling.LANCZOS,
        )
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=85, method=6)
        body = buf.getvalue()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read that image. Try a different file.",
        ) from None

    suffix = secrets.token_hex(4)
    key = f"avatars/{current_user.id}/{suffix}.webp"

    public_url = storage.put_object(
        key=key, body=body, content_type="image/webp"
    )

    # Best-effort cleanup of the previous file. New avatar is already
    # live, so this never blocks the user-facing response.
    old_key = storage.key_from_public_url(current_user.avatar_url or "")
    if old_key and old_key != key:
        storage.delete_object(key=old_key)

    current_user.avatar_url = public_url
    current_user.updated_at = datetime.now(UTC)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return AvatarResponse(avatar_url=public_url)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def delete_avatar(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Remove the current user's profile photo."""
    from ..services import storage

    if not current_user.avatar_url:
        return None
    old_key = storage.key_from_public_url(current_user.avatar_url)
    if old_key and storage.is_configured():
        storage.delete_object(key=old_key)
    current_user.avatar_url = None
    current_user.updated_at = datetime.now(UTC)
    session.add(current_user)
    session.commit()
    return None


class StudentClassroomTokenResponse(BaseModel):
    room_url: str
    token: str
    role: str = "student"


@router.post("/me/bookings/{booking_id}/classroom-token", response_model=StudentClassroomTokenResponse)
def student_classroom_token(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Student-side classroom join. Returns a Daily.co meeting token + room
    URL. Time-gated identically to the tutor-side endpoint.

    Delegates to the same `_mint_classroom_token` helper as
    /tutor/bookings/{id}/classroom-token so the policy + room-creation
    logic stays in one place.
    """
    from .tutor_site import _mint_classroom_token

    booking = session.get(Booking, booking_id)
    if not booking or booking.student_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    resp = _mint_classroom_token(
        booking=booking, user=current_user, is_owner=False, session=session
    )
    return StudentClassroomTokenResponse(room_url=resp.room_url, token=resp.token)


class StudentBookingRead(BaseModel):
    id: int
    tutor_slug: str | None
    tutor_display_name: str | None
    # `counterparty_name` is the unified field a shared <BookingCard>
    # component reads regardless of whose side it's rendering. From the
    # student's perspective that's the tutor; the tutor-side endpoint
    # populates it with the student's name. Lets the SPA render bookings
    # consistently across My Bookings, the dashboard cards, and the
    # upcoming-lesson banner without each view re-implementing the same
    # shape conversion. Defaults to None so call sites that haven't
    # adopted the field yet keep returning a valid response — a
    # model_validator below fills it from tutor_display_name when None.
    counterparty_name: str | None = None
    pack_name: str | None
    scheduled_at: datetime
    duration_minutes: int
    price_cents: int
    currency: str
    status: BookingStatus
    paid_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None
    # Tutor's cancellation cutoff at read time — frontend uses this to
    # disable the Cancel button when the lesson is too close.
    cancellation_cutoff_hours: int | None = None

    @field_validator(
        "scheduled_at",
        "paid_at",
        "completed_at",
        "cancelled_at",
        "refunded_at",
        mode="before",
    )
    @classmethod
    def _ensure_utc(cls, v):
        # Times are stored in the DB as naive UTC; without this they
        # serialise to ISO strings with no `Z` / `+00:00` suffix and
        # JavaScript's `new Date()` treats them as local time, throwing
        # the rendered hour off by the user's UTC offset. Always emit
        # timezone-aware UTC so the browser converts cleanly.
        if v is None or not isinstance(v, datetime):
            return v
        if v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v

    @model_validator(mode="after")
    def _fill_counterparty(self):
        if self.counterparty_name is None and self.tutor_display_name:
            self.counterparty_name = self.tutor_display_name
        return self


class MyTutorRead(BaseModel):
    tutor_id: int
    user_id: int
    tutor_slug: str
    display_name: str
    photo_url: str | None
    bio: str | None
    languages_taught: str | None
    total_bookings: int
    completed_bookings: int
    upcoming_bookings: int
    last_lesson_at: datetime | None
    next_lesson_at: datetime | None

    @field_validator("last_lesson_at", "next_lesson_at", mode="before")
    @classmethod
    def _ensure_utc(cls, v):
        if v is None or not isinstance(v, datetime):
            return v
        if v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v


@router.get("/me/tutors", response_model=list[MyTutorRead])
def list_my_tutors(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[MyTutorRead]:
    """Every tutor the current student has booked with — drives the
    'My Tutors' page so a student can quickly find their teacher's site
    and start a conversation.

    Ordered by most-recent booking activity (active > upcoming > stale).
    Includes booking-count stats per tutor.
    """
    bookings = list(
        session.exec(
            select(Booking)
            .where(Booking.student_user_id == current_user.id)
        ).all()
    )
    if not bookings:
        return []
    tutor_ids = list({b.tutor_id for b in bookings})
    tutors = {
        t.id: t for t in session.exec(
            select(Tutor).where(Tutor.id.in_(tutor_ids))
        ).all()
    }
    users = {
        u.id: u for u in session.exec(
            select(User).where(
                User.id.in_([t.user_id for t in tutors.values()])
            )
        ).all()
    }

    now = datetime.now(UTC)
    by_tutor: dict[int, dict] = {}
    for b in bookings:
        sched = b.scheduled_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=UTC)
        slot = by_tutor.setdefault(
            b.tutor_id,
            {
                "total": 0,
                "completed": 0,
                "upcoming": 0,
                "last_lesson_at": None,
                "next_lesson_at": None,
            },
        )
        slot["total"] += 1
        if b.status == BookingStatus.COMPLETED:
            slot["completed"] += 1
            if slot["last_lesson_at"] is None or sched > slot["last_lesson_at"]:
                slot["last_lesson_at"] = sched
        elif b.status == BookingStatus.CONFIRMED and sched > now:
            slot["upcoming"] += 1
            if slot["next_lesson_at"] is None or sched < slot["next_lesson_at"]:
                slot["next_lesson_at"] = sched

    rows: list[MyTutorRead] = []
    for tid, stats in by_tutor.items():
        tutor = tutors.get(tid)
        if tutor is None:
            continue
        user = users.get(tutor.user_id)
        rows.append(
            MyTutorRead(
                tutor_id=tutor.id,
                user_id=tutor.user_id,
                tutor_slug=tutor.tutor_slug,
                display_name=tutor.display_name,
                photo_url=user.avatar_url if user else None,
                bio=user.bio if user else None,
                languages_taught=user.languages if user else None,
                total_bookings=stats["total"],
                completed_bookings=stats["completed"],
                upcoming_bookings=stats["upcoming"],
                last_lesson_at=stats["last_lesson_at"],
                next_lesson_at=stats["next_lesson_at"],
            )
        )
    # Sort: tutors with an upcoming lesson first (soonest), then last
    # completed lesson, then alphabetical.
    rows.sort(
        key=lambda r: (
            r.next_lesson_at or datetime.max.replace(tzinfo=UTC),
            -(r.last_lesson_at.timestamp() if r.last_lesson_at else 0),
            r.display_name.lower(),
        )
    )
    return rows


@router.get("/me/bookings", response_model=list[StudentBookingRead])
def list_my_bookings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """All bookings (across all tutors) for the current student. Newest first."""
    rows = session.exec(
        select(Booking)
        .where(Booking.student_user_id == current_user.id)
        .order_by(Booking.scheduled_at.desc())
    ).all()
    tutor_ids = {b.tutor_id for b in rows}
    pack_ids = {b.lesson_pack_id for b in rows}
    tutors = {
        t.id: t for t in session.exec(select(Tutor).where(Tutor.id.in_(tutor_ids))).all()
    } if tutor_ids else {}
    packs = {
        p.id: p for p in session.exec(select(LessonPack).where(LessonPack.id.in_(pack_ids))).all()
    } if pack_ids else {}
    return [
        StudentBookingRead(
            id=b.id,
            tutor_slug=tutors.get(b.tutor_id).tutor_slug if tutors.get(b.tutor_id) else None,
            tutor_display_name=tutors.get(b.tutor_id).display_name if tutors.get(b.tutor_id) else None,
            counterparty_name=tutors.get(b.tutor_id).display_name if tutors.get(b.tutor_id) else None,
            pack_name=packs.get(b.lesson_pack_id).name if packs.get(b.lesson_pack_id) else None,
            scheduled_at=b.scheduled_at,
            duration_minutes=b.duration_minutes,
            price_cents=b.price_cents,
            currency=b.currency,
            status=b.status,
            paid_at=b.paid_at,
            completed_at=b.completed_at,
            cancelled_at=b.cancelled_at,
            refunded_at=b.refunded_at,
            cancellation_cutoff_hours=(
                tutors.get(b.tutor_id).cancellation_cutoff_hours
                if tutors.get(b.tutor_id)
                else None
            ),
        )
        for b in rows
    ]


@router.get("/me/bookings/{booking_id}/ics")
def export_booking_ics(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Calendar export for a single booking — drops into Apple Calendar /
    Google Calendar / Outlook on import."""
    from fastapi.responses import Response

    from ..services import ics as _ics

    booking = session.get(Booking, booking_id)
    if booking is None or booking.student_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    tutor = session.get(Tutor, booking.tutor_id)
    pack = session.get(LessonPack, booking.lesson_pack_id)
    summary = f"Lesson with {tutor.display_name if tutor else 'your tutor'}"
    description = pack.name if pack else None
    url = None
    if tutor and tutor.tutor_slug:
        frontend = os.environ.get("FRONTEND_URL", "https://kotobaseed.net").rstrip("/")
        if "://" in frontend:
            scheme, rest = frontend.split("://", 1)
            url = f"{scheme}://{tutor.tutor_slug}.{rest}/classroom/{booking.id}"
    body = _ics.booking_to_ics(
        uid=f"booking-{booking.id}@kotobaseed",
        summary=summary,
        description=description,
        start=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        url=url,
    )
    return Response(
        content=body,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="kotobaseed-{booking.id}.ics"',
        },
    )


class BulkCancelRequest(BaseModel):
    booking_ids: list[int] = Field(min_length=1, max_length=50)


class BulkCancelResult(BaseModel):
    succeeded: list[int]
    failed: list[dict]


@router.post("/me/bookings/bulk-cancel", response_model=BulkCancelResult)
def bulk_cancel_my_bookings(
    payload: BulkCancelRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> BulkCancelResult:
    """Cancel many bookings in one round trip. Each booking goes through
    the same cancellation rules as the single-cancel endpoint — invalid
    ones land in `failed[]` so the caller can surface them per-row."""
    succeeded: list[int] = []
    failed: list[dict] = []
    for booking_id in payload.booking_ids:
        try:
            cancel_my_booking(  # type: ignore[name-defined]
                booking_id=booking_id,
                current_user=current_user,
                session=session,
            )
            succeeded.append(booking_id)
        except HTTPException as exc:
            failed.append({"booking_id": booking_id, "detail": exc.detail})
        except Exception as exc:  # noqa: BLE001
            failed.append({"booking_id": booking_id, "detail": str(exc)})
    return BulkCancelResult(succeeded=succeeded, failed=failed)


@router.post("/me/bookings/{booking_id}/cancel", response_model=StudentBookingRead)
def cancel_my_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Cancel a future, confirmed booking and refund via Stripe.

    Rules:
      - Only the student who paid can cancel.
      - Past lessons (scheduled_at <= now) cannot be cancelled — talk to
        the tutor for an after-the-fact resolution.
      - PENDING_PAYMENT bookings get marked CANCELLED without a refund
        (no money moved yet).
      - CONFIRMED bookings get refunded via Stripe with the Application
        Fee reversed and the transfer pulled back from the Connect
        account. The status flips to REFUNDED.
    """
    booking = session.get(Booking, booking_id)
    if not booking or booking.student_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    # Idempotent: a double-click on Cancel shouldn't error, it should
    # just return the booking in its terminal state. Saves the student
    # from a confusing 400 toast on a network blip retry.
    if booking.status in (
        BookingStatus.CANCELLED,
        BookingStatus.REFUNDED,
    ):
        tutor = session.get(Tutor, booking.tutor_id)
        pack = session.get(LessonPack, booking.lesson_pack_id)
        return StudentBookingRead(
            id=booking.id,
            tutor_slug=tutor.tutor_slug if tutor else None,
            tutor_display_name=tutor.display_name if tutor else None,
            counterparty_name=tutor.display_name if tutor else None,
            pack_name=pack.name if pack else None,
            scheduled_at=booking.scheduled_at,
            duration_minutes=booking.duration_minutes,
            price_cents=booking.price_cents,
            currency=booking.currency,
            status=booking.status,
            paid_at=booking.paid_at,
            completed_at=booking.completed_at,
            cancelled_at=booking.cancelled_at,
            refunded_at=booking.refunded_at,
            cancellation_cutoff_hours=tutor.cancellation_cutoff_hours if tutor else None,
        )
    now = datetime.now(UTC)
    sched = booking.scheduled_at
    if sched.tzinfo is None:
        sched = sched.replace(tzinfo=UTC)
    # Boundary semantics consistent with the cancel-cutoff strict-`<`
    # below: sched in the past blocks cancel; sched exactly equal to
    # now is rare enough not to worry about (microsecond precision).
    if sched < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That lesson has already started or is in the past.",
        )
    # Cancellation cutoff — the platform's 48h floor or whatever stricter
    # window the tutor has set. PENDING_PAYMENT slips through the cutoff:
    # if the student bailed at the Stripe screen there's no money to
    # refund and no reason to penalise them for closing the tab.
    if booking.status == BookingStatus.CONFIRMED:
        tutor = session.get(Tutor, booking.tutor_id)
        cutoff_hours = (tutor.cancellation_cutoff_hours if tutor else 48) or 48
        if sched - now < timedelta(hours=cutoff_hours):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"This lesson is within the {cutoff_hours}-hour cancellation "
                    "window. Message the tutor directly if something has come up."
                ),
            )
    if booking.status == BookingStatus.PENDING_PAYMENT:
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = now
        booking.updated_at = now
        session.add(booking)
        session.commit()
        session.refresh(booking)
    elif booking.status == BookingStatus.CONFIRMED:
        if not booking.stripe_payment_intent_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Booking has no payment intent on file — contact support.",
            )
        try:
            stripe.Refund.create(
                api_key=os.environ.get("STRIPE_SECRET_KEY"),
                payment_intent=booking.stripe_payment_intent_id,
                reverse_transfer=True,
                refund_application_fee=True,
            )
        except stripe.error.StripeError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Stripe refund failed. Try again or contact support.",
            ) from None
        booking.status = BookingStatus.REFUNDED
        booking.cancelled_at = now
        booking.refunded_at = now
        booking.updated_at = now
        session.add(booking)
        # Refund implies the lesson won't happen — release the minutes.
        from ..services import minute_quota
        minute_quota.release_booking_minutes(booking, session)
        session.commit()
        session.refresh(booking)
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Booking is {booking.status.value}; cannot cancel.",
        )

    from ..services.booking_emails import send_cancellation_email_student

    send_cancellation_email_student(session, booking)

    tutor = session.get(Tutor, booking.tutor_id)
    pack = session.get(LessonPack, booking.lesson_pack_id)
    return StudentBookingRead(
        id=booking.id,
        tutor_slug=tutor.tutor_slug if tutor else None,
        tutor_display_name=tutor.display_name if tutor else None,
        pack_name=pack.name if pack else None,
        scheduled_at=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        price_cents=booking.price_cents,
        currency=booking.currency,
        status=booking.status,
        paid_at=booking.paid_at,
        completed_at=booking.completed_at,
        cancelled_at=booking.cancelled_at,
        refunded_at=booking.refunded_at,
        cancellation_cutoff_hours=tutor.cancellation_cutoff_hours if tutor else None,
    )


class StudentRescheduleRequest(BaseModel):
    scheduled_at: datetime


@router.post(
    "/me/bookings/{booking_id}/reschedule",
    response_model=StudentBookingRead,
)
def reschedule_my_booking(
    booking_id: int,
    payload: StudentRescheduleRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Student reschedules a CONFIRMED booking to a new slot.

    Same cutoff rule as cancellation — the student can't reschedule a
    lesson that's already within the no-cancel window (otherwise reschedule
    becomes a backdoor cancellation, pushing the lesson far enough out that
    it lands outside the window). The new slot must also be outside the
    cutoff so the lesson doesn't get rescheduled INTO a window the student
    can't cancel out of accidentally.

    Trial bookings: also rescheduleable. Same window check; no money to
    move so just updates scheduled_at.
    """
    booking = session.get(Booking, booking_id)
    if not booking or booking.student_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only confirmed bookings can be rescheduled.",
        )

    now = datetime.now(UTC)
    tutor = session.get(Tutor, booking.tutor_id)
    if tutor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor not found.")
    cutoff_hours = tutor.cancellation_cutoff_hours

    sched = booking.scheduled_at
    if sched.tzinfo is None:
        sched = sched.replace(tzinfo=UTC)
    new_at = payload.scheduled_at
    if new_at.tzinfo is None:
        new_at = new_at.replace(tzinfo=UTC)

    if sched - now < timedelta(hours=cutoff_hours):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This lesson is within the {cutoff_hours}-hour cancellation "
                "window. Message the tutor directly to reschedule."
            ),
        )
    if new_at - now < timedelta(hours=cutoff_hours):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Pick a new time at least {cutoff_hours} hours from now — "
                "otherwise you wouldn't be able to cancel the rescheduled lesson "
                "if something came up."
            ),
        )
    if new_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pick a new time in the future.",
        )

    # Verify the new slot fits an availability window for the right kind
    # of booking. Trials must land in allow_trial=True windows; paid
    # bookings can land anywhere the tutor's available.
    from ..routers.tutor_site import _slot_conflicts, _slot_fits_window

    pack = session.get(LessonPack, booking.lesson_pack_id)
    if pack is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pack not found.")
    if not _slot_fits_window(
        tutor=tutor,
        scheduled_at=new_at,
        duration_minutes=booking.duration_minutes,
        session=session,
        trial_only=pack.is_trial,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The tutor isn't available at that time.",
        )

    # Check the new slot doesn't collide with another booking (excluding
    # the one we're moving). Pull all the tutor's nearby bookings then
    # filter out this booking's row.
    nearby = list(
        session.exec(
            select(Booking)
            .where(Booking.tutor_id == tutor.id)
            .where(Booking.id != booking.id)
            .where(Booking.scheduled_at >= new_at - timedelta(hours=4))
            .where(Booking.scheduled_at <= new_at + timedelta(hours=4))
        ).all()
    )
    if _slot_conflicts(new_at, booking.duration_minutes, nearby):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That slot is already booked. Pick another.",
        )

    booking.scheduled_at = new_at
    booking.updated_at = now
    # Reset reminder so the rescheduled lesson gets a fresh reminder sweep.
    booking.reminder_sent_at = None
    # The classroom room (Daily.co) becomes stale once the time moves; the
    # lazy room creation will mint a new one on next join.
    booking.daily_room_name = None
    booking.daily_room_url = None
    session.add(booking)

    # Migrate the minute-quota ledger row to the new month. The old row's
    # `usage_date` was stamped at confirm time from the original
    # scheduled_at; without this re-record, a late-June lesson moved to
    # early July still counts against June's quota and never shows up in
    # July's. Release-then-record uses the same source key so it stays
    # idempotent for replay.
    from ..services import minute_quota
    minute_quota.release_booking_minutes(booking, session)
    minute_quota.record_booking_minutes(booking, session)

    session.commit()
    session.refresh(booking)

    return StudentBookingRead(
        id=booking.id,
        tutor_slug=tutor.tutor_slug,
        tutor_display_name=tutor.display_name,
        counterparty_name=tutor.display_name,
        pack_name=pack.name,
        scheduled_at=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        price_cents=booking.price_cents,
        currency=booking.currency,
        status=booking.status,
        paid_at=booking.paid_at,
        completed_at=booking.completed_at,
        cancelled_at=booking.cancelled_at,
        refunded_at=booking.refunded_at,
        cancellation_cutoff_hours=tutor.cancellation_cutoff_hours if tutor else None,
    )


class PriorityCreditRead(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    status: PriorityCreditStatus


class PriorityCreditSummary(BaseModel):
    available: int
    used: int
    expired: int
    credits: list[PriorityCreditRead]


@router.get("/me/priority-credits", response_model=PriorityCreditSummary)
def list_my_priority_credits(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Student's priority credit ledger — used by the credits widget so
    they can see what they have and how long it lasts. Auto-expires
    credits whose expires_at has passed; idempotent so it's safe to call
    on every page load."""
    now = datetime.now(UTC)
    rows = list(
        session.exec(
            select(PriorityCredit)
            .where(PriorityCredit.user_id == current_user.id)
            .order_by(PriorityCredit.created_at.desc())
        ).all()
    )
    dirty = False
    for c in rows:
        if c.status == PriorityCreditStatus.AVAILABLE:
            expires = c.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=UTC)
            if expires < now:
                c.status = PriorityCreditStatus.EXPIRED
                session.add(c)
                dirty = True
    if dirty:
        session.commit()
    available = sum(1 for c in rows if c.status == PriorityCreditStatus.AVAILABLE)
    used = sum(1 for c in rows if c.status == PriorityCreditStatus.USED)
    expired = sum(1 for c in rows if c.status == PriorityCreditStatus.EXPIRED)
    return PriorityCreditSummary(
        available=available,
        used=used,
        expired=expired,
        credits=[
            PriorityCreditRead(
                id=c.id,
                created_at=c.created_at,
                expires_at=c.expires_at,
                status=c.status,
            )
            for c in rows
        ],
    )


@router.get("/me/export")
def export_my_data(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """GDPR Article 15 — right of access. Returns a JSON dump of everything
    we hold that's tied to this user. Frontend can offer it as a download.

    Scope: profile, bookings, pledges, content authored, messages,
    notifications, testimonials. We exclude server logs and hashed
    passwords — neither is meaningful data the user can act on.
    """
    from ..models import (
        Article,
        HomeworkAssignment,
        HomeworkSubmission,
        LessonModule,
        Testimonial,
    )

    def _serialize_model(row) -> dict:
        return row.model_dump(mode="json", exclude={"hashed_password"})

    tutor = session.exec(select(Tutor).where(Tutor.user_id == current_user.id)).first()

    payload: dict = {
        "exported_at": datetime.now(UTC).isoformat(),
        "export_format_version": 1,
        "profile": current_user.model_dump(
            mode="json", exclude={"hashed_password"}
        ),
    }

    if tutor is not None:
        payload["tutor_site"] = tutor.model_dump(mode="json")
        payload["tutor_articles"] = [
            _serialize_model(r)
            for r in session.exec(
                select(Article).where(Article.tutor_id == tutor.id)
            ).all()
        ]
        payload["tutor_modules"] = [
            _serialize_model(r)
            for r in session.exec(
                select(LessonModule).where(LessonModule.tutor_id == tutor.id)
            ).all()
        ]
        payload["tutor_bookings_as_tutor"] = [
            _serialize_model(r)
            for r in session.exec(
                select(Booking).where(Booking.tutor_id == tutor.id)
            ).all()
        ]
        payload["testimonials_about_me"] = [
            _serialize_model(r)
            for r in session.exec(
                select(Testimonial).where(Testimonial.tutor_id == tutor.id)
            ).all()
        ]

    payload["bookings_as_student"] = [
        _serialize_model(r)
        for r in session.exec(
            select(Booking).where(Booking.student_user_id == current_user.id)
        ).all()
    ]
    payload["pledges"] = [
        _serialize_model(r)
        for r in session.exec(
            select(Pledge).where(Pledge.user_id == current_user.id)
        ).all()
    ]
    payload["projects_authored"] = [
        _serialize_model(r)
        for r in session.exec(
            select(Project).where(Project.teacher_id == current_user.id)
        ).all()
    ]
    payload["requests_made"] = [
        _serialize_model(r)
        for r in session.exec(
            select(Request).where(Request.user_id == current_user.id)
        ).all()
    ]
    payload["messages_sent"] = [
        _serialize_model(r)
        for r in session.exec(
            select(Message).where(Message.sender_id == current_user.id)
        ).all()
    ]
    payload["notifications"] = [
        _serialize_model(r)
        for r in session.exec(
            select(Notification).where(Notification.user_id == current_user.id)
        ).all()
    ]
    payload["homework_assignments"] = [
        _serialize_model(r)
        for r in session.exec(
            select(HomeworkAssignment).where(
                HomeworkAssignment.student_user_id == current_user.id
            )
        ).all()
    ]
    payload["homework_submissions"] = [
        _serialize_model(r)
        for r in session.exec(
            select(HomeworkSubmission).where(
                HomeworkSubmission.student_user_id == current_user.id
            )
        ).all()
    ]

    return payload


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    now = datetime.now(UTC)
    # 1. Find or create the singleton deleted-user placeholder
    deleted_user = _get_or_create_deleted_user(session)

    # If the user is a teacher, cancel their non-completed projects
    if current_user.role == UserRole.TUTOR:
        teacher_projects = session.exec(
            select(Project)
            .where(Project.teacher_id == current_user.id)
            .options(selectinload(Project.pledges))
        ).all()
        for project in teacher_projects:
            if project.status not in [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED]:
                _cancel_project_logic(project, session)

    # 2. Reassign all associated data to the 'deleted@system' user
    # Projects
    for project in session.exec(select(Project).where(Project.teacher_id == current_user.id)).all():
        project.teacher_id = deleted_user.id
        session.add(project)
    # Pledges
    for pledge in session.exec(select(Pledge).where(Pledge.user_id == current_user.id)).all():
        pledge.user_id = deleted_user.id
        session.add(pledge)
    # Requests
    for request_obj in session.exec(
        select(Request).where(Request.user_id == current_user.id)
    ).all():
        request_obj.user_id = deleted_user.id
        session.add(request_obj)
    # ProjectRatings
    for rating in session.exec(
        select(ProjectRating).where(ProjectRating.user_id == current_user.id)
    ).all():
        rating.user_id = deleted_user.id
        session.add(rating)
    # VideoComments
    for comment in session.exec(
        select(VideoComment).where(VideoComment.user_id == current_user.id)
    ).all():
        comment.user_id = deleted_user.id
        session.add(comment)
    # Notifications
    for notification in session.exec(
        select(Notification).where(Notification.user_id == current_user.id)
    ).all():
        notification.user_id = deleted_user.id
        session.add(notification)
    # TeacherVerifications
    if current_user.role == UserRole.TUTOR:
        for verification in session.exec(
            select(TeacherVerification).where(TeacherVerification.teacher_id == current_user.id)
        ).all():
            verification.teacher_id = deleted_user.id
            session.add(verification)

    # Conversations and Messages
    for conv in session.exec(
        select(Conversation).where(Conversation.student_id == current_user.id)
    ).all():
        conv.student_demo_video_url = None
        conv.student_id = deleted_user.id
        session.add(conv)
    for conv in session.exec(
        select(Conversation).where(Conversation.teacher_id == current_user.id)
    ).all():
        conv.teacher_id = deleted_user.id
        session.add(conv)
    for msg in session.exec(select(Message).where(Message.sender_id == current_user.id)).all():
        msg.sender_id = deleted_user.id
        session.add(msg)

    # 3. If the user has a Tutor row, anonymise it. We DO NOT delete it
    # because Tutor.id is referenced by Bookings, Articles, Modules,
    # HomeworkAssignments etc. — financial records must survive deletion
    # for tax purposes. We strip identifying fields and orphan the tutor
    # site by clearing the slug + Stripe + custom domain.
    tutor = session.exec(select(Tutor).where(Tutor.user_id == current_user.id)).first()
    if tutor is not None:
        from ..models import (
            Article,
            HomeworkAssignment,
            HomeworkSubmission,
            LessonModule,
            Testimonial,
            TutorEmailTemplate,
            TutorPageSection,
        )

        # The slug becomes a guaranteed-unique sentinel so a re-registration
        # never collides — and tenancy middleware can never resolve to this
        # ghost tutor again.
        tutor.tutor_slug = f"deleted_{tutor.id}_{int(now.timestamp())}"
        tutor.display_name = "Deleted tutor"
        tutor.public_reply_email = None
        tutor.custom_domain = None
        tutor.custom_domain_verified_at = None
        tutor.list_in_marketplace = False
        tutor.stripe_connect_account_id = None
        tutor.account_status_paused_reason = None if hasattr(tutor, "account_status_paused_reason") else None
        session.add(tutor)

        # Cascade-anonymise content owned by this tutor. We DELETE rather
        # than reassign for content rows — they're tutor-scoped, not
        # platform-wide, and reassigning to a placeholder would leak the
        # tutor's pedagogy under a different identity.
        for row in session.exec(
            select(Article).where(Article.tutor_id == tutor.id)
        ).all():
            session.delete(row)
        for row in session.exec(
            select(LessonModule).where(LessonModule.tutor_id == tutor.id)
        ).all():
            session.delete(row)
        for row in session.exec(
            select(TutorPageSection).where(TutorPageSection.tutor_id == tutor.id)
        ).all():
            session.delete(row)
        for row in session.exec(
            select(TutorEmailTemplate).where(TutorEmailTemplate.tutor_id == tutor.id)
        ).all():
            session.delete(row)
        # Testimonials about this tutor are about-the-business — delete with
        # the tutor identity. Submitted-by side handled above via Conversation
        # placeholder reassignment.
        for row in session.exec(
            select(Testimonial).where(Testimonial.tutor_id == tutor.id)
        ).all():
            session.delete(row)
        # Submissions + assignments are pedagogical artefacts of completed
        # work — anonymise the student-side fields if they belong to this
        # user, otherwise leave them attached to the tutor (anonymised
        # display).
        for row in session.exec(
            select(HomeworkAssignment).where(
                HomeworkAssignment.student_user_id == current_user.id
            )
        ).all():
            row.student_user_id = deleted_user.id
            session.add(row)
        for row in session.exec(
            select(HomeworkSubmission).where(
                HomeworkSubmission.student_user_id == current_user.id
            )
        ).all():
            row.student_user_id = deleted_user.id
            session.add(row)

    # 4. Detach the user from their bookings as a student (financial records
    # stay intact at the tutor side; the student-PII link is severed).
    for booking in session.exec(
        select(Booking).where(Booking.student_user_id == current_user.id)
    ).all():
        booking.student_user_id = deleted_user.id
        session.add(booking)

    # 5. Anonymize the current_user's row (soft delete)
    current_user.full_name = "Deleted User"
    current_user.email = f"deleted_{current_user.id}_{int(now.timestamp())}@system.com"
    current_user.hashed_password = "deleted"
    current_user.bio = None
    current_user.languages = None
    current_user.intro_video_url = None
    current_user.sample_video_url = None
    current_user.avatar_url = None
    current_user.stripe_account_id = None
    current_user.stripe_customer_id = None
    current_user.subscription_tier = current_user.subscription_tier.__class__.FREE
    current_user.subscription_expires_at = None
    current_user.deleted_at = now
    current_user.role = UserRole.STUDENT

    session.add(current_user)
    session.commit()
    session.refresh(current_user)


@router.get("/{user_id}/profile", response_model=UserProfile)
def get_user_profile(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
):
    user = session.get(User, user_id, options=[selectinload(User.language_groups)])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Privacy: students who opted out are hidden from anyone but themselves.
    # Teachers and tutors are always public (their business face). 404 (not
    # 403) so we don't leak whether the slug exists.
    if (
        user.role == UserRole.STUDENT
        and not user.profile_public
        and (current_user is None or current_user.id != user.id)
    ):
        raise HTTPException(status_code=404, detail="User not found")

    average_rating = None
    verified_languages = []
    follower_count = 0
    if user.role == UserRole.TUTOR:
        # Calculate average rating
        rating_statement = (
            select(func.avg(ProjectRating.rating))
            .join(Project)
            .where(Project.teacher_id == user.id)
        )
        avg_rating_result = session.exec(rating_statement).first()
        if avg_rating_result:
            average_rating = round(avg_rating_result, 1)

        verification_statement = select(TeacherVerification.language).where(
            TeacherVerification.teacher_id == user.id,
            TeacherVerification.status == VerificationStatus.APPROVED,
        )
        verified_languages = session.exec(verification_statement).all()

        # Calculate follower count
        follower_count = session.exec(
            select(func.count(TeacherFollower.student_id)).where(
                TeacherFollower.teacher_id == user.id
            )
        ).one()

    is_following = False
    if current_user and current_user.id != user.id:
        is_following = session.get(TeacherFollower, (user.id, current_user.id)) is not None

    # Surface their tutoring site slug if they have one — drives the
    # "Book a lesson with this tutor" cross-sell on the profile page.
    tutor_row = session.exec(
        select(Tutor).where(Tutor.user_id == user.id)
    ).first()

    return UserProfile(
        id=user.id,
        full_name=user.full_name,
        bio=user.bio,
        languages=user.languages,
        role=user.role,
        created_at=user.created_at.isoformat(),
        average_rating=average_rating,
        intro_video_url=user.intro_video_url,
        sample_video_url=user.sample_video_url,
        avatar_url=user.avatar_url,
        verified_languages=verified_languages,
        language_groups=[group.language_name for group in user.language_groups],
        follower_count=follower_count,
        is_following=is_following,
        tutor_slug=tutor_row.tutor_slug if tutor_row else None,
        tutor_display_name=tutor_row.display_name if tutor_row else None,
    )


@router.post("/{teacher_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def follow_teacher(
    teacher_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.id == teacher_id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself.")

    teacher = session.get(User, teacher_id)
    if not teacher or teacher.role != UserRole.TUTOR:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    follow = session.get(TeacherFollower, (teacher_id, current_user.id))
    if follow:
        return

    new_follow = TeacherFollower(teacher_id=teacher_id, student_id=current_user.id)
    session.add(new_follow)

    # Notify the teacher
    notification = Notification(
        user_id=teacher_id,
        message=f"{current_user.full_name} is now following you.",
        link=f"/profile/{current_user.id}",
    )
    session.add(notification)
    session.commit()


@router.delete("/{teacher_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_teacher(
    teacher_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    follow = session.get(TeacherFollower, (teacher_id, current_user.id))
    if not follow:
        return

    session.delete(follow)
    session.commit()


@router.get("/{teacher_id}/followers", response_model=list[FollowerRead])
def get_teacher_followers(
    teacher_id: int, limit: int = 10, offset: int = 0, session: Session = Depends(get_session)
):
    teacher = session.get(User, teacher_id)
    if not teacher or teacher.role != UserRole.TUTOR:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    followers_statement = (
        select(User, func.sum(Pledge.amount).label("total_pledged"))
        .join(TeacherFollower, User.id == TeacherFollower.student_id)
        .join(
            Pledge,
            and_(User.id == Pledge.user_id, Pledge.status == PledgeStatus.CAPTURED),
            isouter=True,
        )
        .join(
            Project,
            and_(Pledge.project_id == Project.id, Project.teacher_id == teacher_id),
            isouter=True,
        )
        .where(TeacherFollower.teacher_id == teacher_id)
        .group_by(User.id)
        .order_by(func.sum(Pledge.amount).desc().nulls_last())
        .limit(limit)
        .offset(offset)
    )

    results = session.exec(followers_statement).all()

    return [
        FollowerRead(
            id=user.id,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            total_pledged=total_pledged or 0,
        )
        for user, total_pledged in results
    ]


@router.get("/{user_id}/following", response_model=list[FollowingTeacherRead])
def get_user_following(user_id: int, session: Session = Depends(get_session)):
    """
    Get a list of teachers a specific user is following, ranked by how much that user has pledged to them.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    statement = (
        select(User, func.sum(Pledge.amount).label("total_pledged"))
        .join(TeacherFollower, User.id == TeacherFollower.teacher_id)
        .join(Project, User.id == Project.teacher_id, isouter=True)
        .join(
            Pledge,
            and_(
                Project.id == Pledge.project_id,
                Pledge.user_id == user_id,  # Use the user_id from the path
                Pledge.status == PledgeStatus.CAPTURED,
            ),
            isouter=True,
        )
        .where(TeacherFollower.student_id == user_id)  # Use the user_id from the path
        .group_by(User.id)
        .order_by(func.sum(Pledge.amount).desc().nulls_last())
    )
    results = session.exec(statement).all()
    return [
        FollowingTeacherRead(
            id=teacher.id,
            full_name=teacher.full_name,
            avatar_url=teacher.avatar_url,
            total_pledged=total_pledged or 0,
        )
        for teacher, total_pledged in results
    ]


@router.get("/{user_id}/backed-projects", response_model=PaginatedProjectRead)
def get_user_backed_projects(
    user_id: int,
    limit: int = 10,
    offset: int = 0,
    current_user: User | None = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    base_query = select(Project).join(Pledge).where(Pledge.user_id == user_id)

    count_statement = select(func.count()).select_from(base_query.subquery())
    total_count = session.exec(count_statement).one()

    projects_statement = (
        base_query.options(selectinload(Project.teacher), selectinload(Project.videos))
        .offset(offset)
        .limit(limit)
    )
    projects = session.exec(projects_statement).all()

    return PaginatedProjectRead(
        projects=[_create_project_read(p, current_user, session) for p in projects],
        total_count=total_count,
    )


@router.get("/{user_id}/completed-projects", response_model=PaginatedProjectRead)
def get_teacher_completed_projects(
    user_id: int,
    language: str | None = None,
    level: str | None = None,
    search: str | None = None,
    limit: int = 10,
    offset: int = 0,
    current_user: User | None = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    teacher = session.get(User, user_id)
    if not teacher or teacher.role != UserRole.TUTOR:
        raise HTTPException(status_code=404, detail="Teacher not found")

    base_query = select(Project).where(
        Project.teacher_id == user_id, Project.status == ProjectStatus.COMPLETED
    )

    if language:
        base_query = base_query.where(Project.language == language)
    if level:
        base_query = base_query.where(Project.level == level)
    if search:
        search_term = f"%{search}%"
        base_query = base_query.where(
            or_(
                Project.title.ilike(search_term),
                Project.description.ilike(search_term),
                Project.tags.ilike(search_term),
            )
        )

    count_statement = select(func.count()).select_from(base_query.subquery())
    total_count = session.exec(count_statement).one()

    projects_statement = (
        base_query.options(selectinload(Project.teacher), selectinload(Project.videos))
        .offset(offset)
        .limit(limit)
    )
    projects = session.exec(projects_statement).all()

    return PaginatedProjectRead(
        projects=[_create_project_read(p, current_user, session) for p in projects],
        total_count=total_count,
    )


@router.get("/{user_id}/completed-projects/filter-options", response_model=FilterOptionsRead)
def get_teacher_completed_projects_filter_options(
    user_id: int, session: Session = Depends(get_session)
):
    teacher = session.get(User, user_id)
    if not teacher or teacher.role != UserRole.TUTOR:
        raise HTTPException(status_code=404, detail="Teacher not found")

    query = (
        select(Project.language, Project.level)
        .where(Project.teacher_id == user_id, Project.status == ProjectStatus.COMPLETED)
        .distinct()
    )
    results = session.exec(query).all()

    language_levels = defaultdict(set)
    for lang, level in results:
        language_levels[lang].add(level)

    languages_list = [
        LanguageLevelsRead(language=lang, levels=sorted(levels))
        for lang, levels in language_levels.items()
    ]

    return FilterOptionsRead(languages=sorted(languages_list, key=lambda x: x.language))


@router.get("/{user_id}/ratings", response_model=list[TeacherRatingRead])
def get_teacher_ratings(user_id: int, session: Session = Depends(get_session)):
    teacher = session.get(User, user_id)
    if not teacher or teacher.role != UserRole.TUTOR:
        raise HTTPException(status_code=404, detail="Teacher not found")

    statement = (
        select(ProjectRating)
        .join(Project)
        .where(Project.teacher_id == teacher.id)  # Corrected from user.id to teacher.id
        .options(selectinload(ProjectRating.project))
        .order_by(ProjectRating.created_at.desc())
    )

    ratings = session.exec(statement).all()

    return [
        TeacherRatingRead(
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
            project=ProjectInfoForRating(
                id=r.project.id,
                title=r.project.title,
                funding_goal=r.project.funding_goal,
                language=r.project.language,
                level=r.project.level,
                tags=r.project.tags,
            ),
            teacher_response=r.teacher_response,
            response_created_at=r.response_created_at,
        )
        for r in ratings
    ]


@router.get("/teachers", response_model=list[TeacherRead])
def search_teachers(query: str = Query(..., min_length=1), session: Session = Depends(get_session)):
    statement = (
        select(User).where(User.role == UserRole.TUTOR).where(User.full_name.ilike(f"%{query}%"))
    )
    teachers = session.exec(statement).all()
    return [TeacherRead(id=t.id, full_name=t.full_name) for t in teachers]


@router.post("/stripe-onboarding-link", response_model=OnboardingResponse)
def create_stripe_onboarding_link(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    if current_user.role != UserRole.TUTOR:
        raise HTTPException(
            status_code=403, detail="Only teachers can create Stripe onboarding links."
        )

    try:
        if not current_user.stripe_account_id:
            account = stripe.Account.create(type="express", email=current_user.email)
            current_user.stripe_account_id = account.id
            session.add(current_user)
            session.commit()
            session.refresh(current_user)

        account_link = stripe.AccountLink.create(
            account=current_user.stripe_account_id,
            refresh_url=f"{FRONTEND_URL}/settings?stripe_reauth=true",
            return_url=f"{FRONTEND_URL}/teacher/dashboard?stripe_return=true",
            type="account_onboarding",
        )

        return {"onboarding_url": account_link.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


class LoginLinkResponse(BaseModel):
    login_url: str


@router.post("/stripe-login-link", response_model=LoginLinkResponse)
def create_stripe_login_link(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Create a one-time login link to the tutor's own Express dashboard.

    For CREATORS only. Routes the caller into THEIR connected Stripe
    Connect account — never to the platform Stripe account. Admins use a
    separate `/admin/stripe-dashboard` flow (or the platform Stripe dashboard
    directly). Students who want to manage their saved payment methods use
    `/subscriptions/customer-portal`.

    Prefers `Tutor.stripe_connect_account_id` (canonical for payouts) and
    falls back to `User.stripe_account_id` (legacy field used at onboarding
    time) so we work either side of the sync.
    """
    if current_user.role != UserRole.TUTOR:
        raise HTTPException(
            status_code=403,
            detail="Only tutors have a Stripe Connect dashboard. Students manage saved cards from their billing settings.",
        )

    account_id = None
    tutor_row = session.exec(
        select(Tutor).where(Tutor.user_id == current_user.id)
    ).first()
    if tutor_row and tutor_row.stripe_connect_account_id:
        account_id = tutor_row.stripe_connect_account_id
    if not account_id:
        account_id = current_user.stripe_account_id

    if not account_id:
        raise HTTPException(
            status_code=409,
            detail="No Stripe account connected yet. Onboard first via /users/stripe-onboarding-link.",
        )

    try:
        link = stripe.Account.create_login_link(account_id)
        return {"login_url": link.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
