"""Per-tutor testimonials.

Tenant-scoped: all endpoints resolve through the tenancy middleware.
Public list (`GET /testimonials`) returns only published rows; owner list
(`GET /testimonials/all`) includes drafts. Tutor types testimonials in
themselves on the dashboard — no public submission endpoint in v1.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser, get_current_user_optional
from ..models import Booking, BookingStatus, LessonPack, Testimonial, Tutor, User
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/testimonials", tags=["testimonials"])


class TestimonialRead(BaseModel):
    id: int
    student_name: str
    location: str | None
    body: str
    rating: int
    display_order: int
    is_published: bool
    created_at: datetime
    updated_at: datetime


class TestimonialCreate(BaseModel):
    student_name: str = Field(min_length=1, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    body: str = Field(min_length=1, max_length=2000)
    rating: int = Field(default=5, ge=1, le=5)
    display_order: int = Field(default=100, ge=0, le=10_000)
    is_published: bool = True


class TestimonialUpdate(BaseModel):
    student_name: str | None = Field(default=None, min_length=1, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    body: str | None = Field(default=None, min_length=1, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)
    display_order: int | None = Field(default=None, ge=0, le=10_000)
    is_published: bool | None = None


class TestimonialSubmit(BaseModel):
    """Public student-submission payload. Display name + location are
    what the student wants to appear publicly — defaulted from their
    own profile by the frontend, but they can override."""

    student_name: str = Field(min_length=1, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    body: str = Field(min_length=12, max_length=2000)
    rating: int = Field(default=5, ge=1, le=5)


class EligibilityResponse(BaseModel):
    """Whether the current viewer can leave a testimonial for this tutor.

    Eligibility = at least one COMPLETED booking with this tutor on a
    non-trial lesson pack. The frontend uses this to decide whether to
    show the "Leave a review" form."""

    eligible: bool
    already_submitted: bool
    reason: str | None = None


def _eligibility(
    session: Session, tutor: Tutor, current: User | None
) -> EligibilityResponse:
    if current is None:
        return EligibilityResponse(
            eligible=False,
            already_submitted=False,
            reason="Sign in to leave a review.",
        )
    # Self-review block — even if the tutor has bookings under their
    # own user id (shouldn't happen, but defend), block submission.
    if tutor.user_id == current.id:
        return EligibilityResponse(
            eligible=False,
            already_submitted=False,
            reason="You can't review your own profile.",
        )

    # Already-submitted check (non-deleted, regardless of approval).
    existing = session.exec(
        select(Testimonial)
        .where(
            Testimonial.tutor_id == tutor.id,
            Testimonial.submitted_by_user_id == current.id,
            Testimonial.deleted_at.is_(None),
        )
    ).first()
    already_submitted = existing is not None

    # Paid completed booking check — JOIN Booking ↔ LessonPack so we
    # only count bookings whose pack is NOT a trial.
    qualifying = session.exec(
        select(Booking.id)
        .join(LessonPack, LessonPack.id == Booking.lesson_pack_id)
        .where(
            Booking.tutor_id == tutor.id,
            Booking.student_user_id == current.id,
            Booking.status == BookingStatus.COMPLETED,
            LessonPack.is_trial == False,  # noqa: E712
        )
        .limit(1)
    ).first()

    if qualifying is None:
        return EligibilityResponse(
            eligible=False,
            already_submitted=already_submitted,
            reason=(
                "You can leave a review after your first completed paid lesson."
            ),
        )

    if already_submitted:
        return EligibilityResponse(
            eligible=True,
            already_submitted=True,
            reason="Your review is on the way — the tutor will publish it shortly.",
        )

    return EligibilityResponse(eligible=True, already_submitted=False)


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _to_read(row: Testimonial) -> TestimonialRead:
    return TestimonialRead(
        id=row.id,
        student_name=row.student_name,
        location=row.location,
        body=row.body,
        rating=row.rating,
        display_order=row.display_order,
        is_published=row.is_published,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[TestimonialRead])
def list_published(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[TestimonialRead]:
    """Public — published testimonials for the tenant, ordered by
    display_order ascending then created_at descending (newer wins ties)."""
    rows = session.exec(
        select(Testimonial)
        .where(
            Testimonial.tutor_id == tutor.id,
            Testimonial.is_published == True,  # noqa: E712
            Testimonial.deleted_at.is_(None),
        )
        .order_by(
            Testimonial.display_order.asc(),
            Testimonial.created_at.desc(),
        )
    ).all()
    return [_to_read(r) for r in rows]


@router.get("/all", response_model=list[TestimonialRead])
def list_all(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[TestimonialRead]:
    """Owner-only — includes drafts but excludes soft-deleted. Sorted the
    same way so the dashboard shows what the public site would show."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(Testimonial)
        .where(Testimonial.tutor_id == tutor.id, Testimonial.deleted_at.is_(None))
        .order_by(
            Testimonial.display_order.asc(),
            Testimonial.created_at.desc(),
        )
    ).all()
    return [_to_read(r) for r in rows]


@router.post("", response_model=TestimonialRead, status_code=status.HTTP_201_CREATED)
def create(
    payload: TestimonialCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TestimonialRead:
    _require_owner(tutor, current)
    row = Testimonial(
        tutor_id=tutor.id,
        student_name=payload.student_name,
        location=payload.location,
        body=payload.body,
        rating=payload.rating,
        display_order=payload.display_order,
        is_published=payload.is_published,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@router.patch("/{testimonial_id}", response_model=TestimonialRead)
def update(
    testimonial_id: int,
    payload: TestimonialUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TestimonialRead:
    _require_owner(tutor, current)
    row = session.get(Testimonial, testimonial_id)
    if row is None or row.tutor_id != tutor.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Testimonial not found.")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(row, field, value)
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@router.delete("/{testimonial_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove(
    testimonial_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Soft-delete — sets deleted_at so the row can be restored via /restore."""
    _require_owner(tutor, current)
    row = session.get(Testimonial, testimonial_id)
    if row is None or row.tutor_id != tutor.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Testimonial not found.")
    row.deleted_at = datetime.now(UTC)
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()


@router.get("/eligibility", response_model=EligibilityResponse)
def check_eligibility(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> EligibilityResponse:
    """Student-side gate check. Returns whether the caller can submit a
    testimonial for this tenant, plus whether they already submitted
    one. Surfaced by the themed Reviews page to decide form visibility.
    Allows unauthenticated callers — they get a clean "sign in" response
    instead of a 401."""
    return _eligibility(session, tutor, current)


@router.post(
    "/submit",
    response_model=TestimonialRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_review(
    payload: TestimonialSubmit,
    tutor: CurrentTutor,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TestimonialRead:
    """Student-side submission. Always lands as unpublished — the tutor
    must approve before it surfaces. Eligibility (≥1 completed paid
    booking with this tutor + no existing submission) is enforced here
    independently of the GET /eligibility helper."""
    elig = _eligibility(session, tutor, current)
    if not elig.eligible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=elig.reason or "Not eligible to leave a review yet.",
        )
    if elig.already_submitted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You've already submitted a review — the tutor will publish it shortly.",
        )

    row = Testimonial(
        tutor_id=tutor.id,
        student_name=payload.student_name.strip(),
        location=(payload.location or "").strip() or None,
        body=payload.body.strip(),
        rating=payload.rating,
        display_order=100,
        is_published=False,    # awaits tutor approval
        submitted_by_user_id=current.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@router.get("/pending", response_model=list[TestimonialRead])
def list_pending(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[TestimonialRead]:
    """Owner-only — student-submitted testimonials waiting for approval.
    Used by the tutor dashboard to surface a review-moderation tray."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(Testimonial)
        .where(
            Testimonial.tutor_id == tutor.id,
            Testimonial.is_published == False,    # noqa: E712
            Testimonial.submitted_by_user_id.is_not(None),
            Testimonial.deleted_at.is_(None),
        )
        .order_by(Testimonial.created_at.desc())
    ).all()
    return [_to_read(r) for r in rows]


@router.post("/{testimonial_id}/restore", response_model=TestimonialRead)
def restore(
    testimonial_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> TestimonialRead:
    """Restore a soft-deleted testimonial — backs the undo toast."""
    _require_owner(tutor, current)
    row = session.get(Testimonial, testimonial_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Testimonial not found.")
    if row.deleted_at is None:
        return _to_read(row)
    row.deleted_at = None
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)
