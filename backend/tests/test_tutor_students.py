"""Tests for the tutor "My students" panel.

Behaviour:
- Booking a lesson auto-creates a StudentEnrollment row
- Listing returns one row per enrolled student with booking counts
- Status filter respected
- PATCH flips ACTIVE <-> INACTIVE
- Non-owner is 403
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from backend.models import (
    Booking,
    BookingStatus,
    LessonPack,
    StudentEnrollment,
    StudentEnrollmentStatus,
    Tutor,
    User,
)
from backend.services import enrollment as enroll_service
from backend.tests.conftest import auth_headers_for

HOST = {"Host": "vasso.kotobaseed.net"}


def _seed_pack(db_session: Session, tutor: Tutor) -> LessonPack:
    pack = LessonPack(
        tutor_id=tutor.id,
        name="Standard 60",
        num_lessons=1,
        duration_minutes=60,
        price_cents=2500,
        currency="eur",
        is_active=True,
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)
    return pack


def _seed_booking(
    db_session: Session,
    *,
    tutor: Tutor,
    student: User,
    pack: LessonPack,
    when: datetime,
    status_: BookingStatus,
) -> Booking:
    b = Booking(
        tutor_id=tutor.id,
        student_user_id=student.id,
        lesson_pack_id=pack.id,
        scheduled_at=when,
        duration_minutes=pack.duration_minutes,
        price_cents=pack.price_cents,
        currency=pack.currency,
        platform_fee_cents=0,
        status=status_,
    )
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)
    return b


# -- service layer ------------------------------------------------------


def test_ensure_enrollment_idempotent(
    db_session: Session, vasso_tutor: Tutor, student_user: User
):
    enroll_service.ensure_enrollment(
        student_user_id=student_user.id,
        tutor_id=vasso_tutor.id,
        session=db_session,
        commit=True,
    )
    enroll_service.ensure_enrollment(
        student_user_id=student_user.id,
        tutor_id=vasso_tutor.id,
        session=db_session,
        commit=True,
    )
    rows = db_session.exec(
        select(StudentEnrollment).where(
            StudentEnrollment.student_user_id == student_user.id,
            StudentEnrollment.tutor_id == vasso_tutor.id,
        )
    ).all()
    assert len(rows) == 1


def test_touch_enrollment_bumps_last_active(
    db_session: Session, vasso_tutor: Tutor, student_user: User
):
    enroll_service.ensure_enrollment(
        student_user_id=student_user.id,
        tutor_id=vasso_tutor.id,
        session=db_session,
        commit=True,
    )
    row = db_session.exec(
        select(StudentEnrollment).where(
            StudentEnrollment.student_user_id == student_user.id
        )
    ).first()
    old = row.last_active_at

    enroll_service.touch_enrollment(
        student_user_id=student_user.id,
        tutor_id=vasso_tutor.id,
        session=db_session,
        commit=True,
    )
    db_session.refresh(row)
    assert row.last_active_at > old


# -- HTTP — list ---------------------------------------------------------


def test_list_my_students_returns_aggregates(
    client, vasso_tutor: Tutor, teacher_user: User, student_user: User, db_session: Session
):
    pack = _seed_pack(db_session, vasso_tutor)
    now = datetime.now(UTC)
    _seed_booking(
        db_session, tutor=vasso_tutor, student=student_user, pack=pack,
        when=now - timedelta(days=10), status_=BookingStatus.COMPLETED,
    )
    _seed_booking(
        db_session, tutor=vasso_tutor, student=student_user, pack=pack,
        when=now + timedelta(days=3), status_=BookingStatus.CONFIRMED,
    )
    enroll_service.ensure_enrollment(
        student_user_id=student_user.id,
        tutor_id=vasso_tutor.id,
        session=db_session,
        commit=True,
    )

    r = client.get(
        "/tutor/students",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200, r.json()
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["student_user_id"] == student_user.id
    assert row["total_bookings"] == 2
    assert row["completed_bookings"] == 1
    assert row["upcoming_bookings"] == 1


def test_non_owner_blocked(client, vasso_tutor: Tutor, student_user: User):
    r = client.get(
        "/tutor/students",
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_status_filter_respected(
    client, vasso_tutor: Tutor, teacher_user: User, student_user: User, db_session: Session
):
    row = enroll_service.ensure_enrollment(
        student_user_id=student_user.id,
        tutor_id=vasso_tutor.id,
        session=db_session,
        commit=True,
    )
    row.status = StudentEnrollmentStatus.INACTIVE
    db_session.add(row)
    db_session.commit()

    r = client.get(
        "/tutor/students?status_filter=active",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert r.json() == []

    r = client.get(
        "/tutor/students?status_filter=inactive",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


# -- HTTP — patch status -------------------------------------------------


def test_patch_status_flips_value(
    client, vasso_tutor: Tutor, teacher_user: User, student_user: User, db_session: Session
):
    row = enroll_service.ensure_enrollment(
        student_user_id=student_user.id,
        tutor_id=vasso_tutor.id,
        session=db_session,
        commit=True,
    )
    r = client.patch(
        f"/tutor/students/{row.id}/status",
        json={"status": "inactive"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200, r.json()
    assert r.json()["status"] == "inactive"
    db_session.refresh(row)
    assert row.status == StudentEnrollmentStatus.INACTIVE
