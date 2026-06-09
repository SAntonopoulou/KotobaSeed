"""Tutor's "My students" panel — lists every student enrolled with the
current tenant, with booking counts and recency for quick triage.

Enrollment is auto-created on the student's first booking with the
tutor (any status), so the list reflects everyone who has ever expressed
interest. Tutors can manually flip ACTIVE / INACTIVE for curation —
mark a student INACTIVE if they've moved on.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    Booking,
    BookingStatus,
    StudentEnrollment,
    StudentEnrollmentStatus,
    Tutor,
    User,
)
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/tutor/students", tags=["tutor-students"])


class StudentRow(BaseModel):
    enrollment_id: int
    student_user_id: int
    student_name: str
    student_email: str
    status: StudentEnrollmentStatus
    first_enrolled_at: datetime
    last_active_at: datetime
    total_bookings: int
    completed_bookings: int
    upcoming_bookings: int


class StatusUpdate(BaseModel):
    status: StudentEnrollmentStatus


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


@router.get("", response_model=list[StudentRow])
def list_my_students(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    status_filter: StudentEnrollmentStatus | None = None,
) -> list[StudentRow]:
    """Roster for the current tutor. Joins StudentEnrollment with User for
    display details and aggregates Booking counts per student. Sorted by
    `last_active_at` desc so recently engaged students surface first.
    """
    _require_owner(tutor, current)

    stmt = (
        select(StudentEnrollment, User)
        .join(User, User.id == StudentEnrollment.student_user_id)
        .where(StudentEnrollment.tutor_id == tutor.id)
        .order_by(StudentEnrollment.last_active_at.desc())
    )
    if status_filter is not None:
        stmt = stmt.where(StudentEnrollment.status == status_filter)

    pairs = session.exec(stmt).all()
    if not pairs:
        return []

    # Bucketed Booking counts in one round-trip — N=enrolled-students.
    now = datetime.now(UTC)
    student_ids = [enr.student_user_id for enr, _ in pairs]
    counts_rows = session.exec(
        select(
            Booking.student_user_id,
            func.count(Booking.id),
            func.sum(
                # SQLite-compatible "1 if completed else 0".
                case((Booking.status == BookingStatus.COMPLETED, 1), else_=0)
            ),
            func.sum(
                case(
                    (
                        (Booking.status == BookingStatus.CONFIRMED)
                        & (Booking.scheduled_at > now),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .where(
            Booking.tutor_id == tutor.id,
            Booking.student_user_id.in_(student_ids),
        )
        .group_by(Booking.student_user_id)
    ).all()
    by_id: dict[int, tuple[int, int, int]] = {
        sid: (int(total or 0), int(done or 0), int(upcoming or 0))
        for sid, total, done, upcoming in counts_rows
    }

    out: list[StudentRow] = []
    for enr, student in pairs:
        total, done, upcoming = by_id.get(enr.student_user_id, (0, 0, 0))
        out.append(
            StudentRow(
                enrollment_id=enr.id,
                student_user_id=student.id,
                student_name=student.full_name or student.email,
                student_email=student.email,
                status=enr.status,
                first_enrolled_at=enr.first_enrolled_at,
                last_active_at=enr.last_active_at,
                total_bookings=total,
                completed_bookings=done,
                upcoming_bookings=upcoming,
            )
        )
    return out


@router.patch("/{enrollment_id}/status", response_model=StudentRow)
def update_student_status(
    enrollment_id: int,
    payload: StatusUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> StudentRow:
    """Flip ACTIVE ↔ INACTIVE for a single enrollment. Marking INACTIVE
    just hides the student from the default roster view — bookings and
    history stay intact.
    """
    _require_owner(tutor, current)
    row = session.get(StudentEnrollment, enrollment_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found."
        )
    row.status = payload.status
    session.add(row)
    session.commit()
    session.refresh(row)

    # Re-render this single row with stats so the UI can update in place.
    student = session.get(User, row.student_user_id)
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student account missing."
        )
    now = datetime.now(UTC)
    counts = session.exec(
        select(
            func.count(Booking.id),
            func.sum(
                case((Booking.status == BookingStatus.COMPLETED, 1), else_=0)
            ),
            func.sum(
                case(
                    (
                        (Booking.status == BookingStatus.CONFIRMED)
                        & (Booking.scheduled_at > now),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .where(
            Booking.tutor_id == tutor.id,
            Booking.student_user_id == student.id,
        )
    ).first()
    total, done, upcoming = (int(counts[0] or 0), int(counts[1] or 0), int(counts[2] or 0))
    return StudentRow(
        enrollment_id=row.id,
        student_user_id=student.id,
        student_name=student.full_name or student.email,
        student_email=student.email,
        status=row.status,
        first_enrolled_at=row.first_enrolled_at,
        last_active_at=row.last_active_at,
        total_bookings=total,
        completed_bookings=done,
        upcoming_bookings=upcoming,
    )
