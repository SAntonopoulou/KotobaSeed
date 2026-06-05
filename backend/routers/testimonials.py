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
from ..deps import CurrentUser
from ..models import Testimonial, Tutor, User
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
    """Owner-only — includes drafts. Sorted the same way so the dashboard
    shows what the public site would show."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(Testimonial)
        .where(Testimonial.tutor_id == tutor.id)
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
    if row is None or row.tutor_id != tutor.id:
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
    _require_owner(tutor, current)
    row = session.get(Testimonial, testimonial_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Testimonial not found.")
    session.delete(row)
    session.commit()
