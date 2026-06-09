"""Non-compete protection when a tutor leaves a TutorTeam.

Behavior covered:
- A leaver's TutorPageSection rows are wiped (theme back to default)
- TutorProtectedStudent rows are stamped for every student they taught
  while team_id matched, with the school's poaching_protection_days
- Booking checkout blocks during the window
- 0-day policy means no protection rows
- Owner-set protection days endpoint
- Self-leave endpoint
- Owner cannot self-leave (must cancel sub instead)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from backend.models import (
    Booking,
    BookingStatus,
    LessonPack,
    SubscriptionTier,
    Tutor,
    TutorPageSection,
    TutorPageSectionType,
    TutorProtectedStudent,
    TutorTeam,
    User,
    UserRole,
)
from backend.services import team_protection as _protection
from backend.services import teams as _teams
from backend.tests.conftest import auth_headers_for


HOST = {"Host": "kotobaseed.net"}
SUB_HOST = {"Host": "vasso.kotobaseed.net"}


def _seed_member_tutor(
    db_session: Session, *, email: str, slug: str, team_id: int | None
) -> tuple[User, Tutor]:
    u = User(
        email=email,
        hashed_password="x",
        full_name="Member " + slug.title(),
        role=UserRole.CREATOR,
        subscription_tier=SubscriptionTier.BUSINESS,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    t = Tutor(
        user_id=u.id,
        tutor_slug=slug,
        display_name="Member " + slug.title(),
        team_id=team_id,
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return u, t


def _seed_booking(
    db_session: Session,
    *,
    tutor: Tutor,
    student: User,
    team_id: int | None,
    status_: BookingStatus = BookingStatus.COMPLETED,
) -> Booking:
    pack = db_session.exec(
        select(LessonPack).where(LessonPack.tutor_id == tutor.id)
    ).first()
    if pack is None:
        pack = LessonPack(
            tutor_id=tutor.id,
            name="Test pack",
            num_lessons=1,
            duration_minutes=60,
            price_cents=1000,
            currency="eur",
            is_active=True,
        )
        db_session.add(pack)
        db_session.commit()
        db_session.refresh(pack)
    b = Booking(
        tutor_id=tutor.id,
        student_user_id=student.id,
        lesson_pack_id=pack.id,
        tutor_team_id=team_id,
        scheduled_at=datetime.now(UTC) - timedelta(days=14),
        duration_minutes=60,
        price_cents=1000,
        currency="eur",
        platform_fee_cents=0,
        status=status_,
    )
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)
    return b


# -- service layer -----------------------------------------------------


def test_leaving_stamps_protected_students_and_wipes_theme(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User, student_user: User
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    member_user, member_tutor = _seed_member_tutor(
        db_session, email="alice@example.com", slug="alice", team_id=team.id
    )
    _seed_booking(
        db_session, tutor=member_tutor, student=student_user, team_id=team.id
    )
    # Seed a TutorPageSection row to confirm it gets wiped on leave.
    db_session.add(
        TutorPageSection(
            tutor_id=member_tutor.id,
            section_type=TutorPageSectionType.HERO_PORTRAIT,
            position=0,
            is_visible=True,
        )
    )
    db_session.commit()

    count = _protection.process_tutor_left_team(
        member_tutor, team, db_session, commit=True
    )
    assert count == 1

    rows = db_session.exec(
        select(TutorProtectedStudent).where(
            TutorProtectedStudent.tutor_id == member_tutor.id
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].student_user_id == student_user.id

    db_session.refresh(member_tutor)
    assert member_tutor.team_id is None

    sections = db_session.exec(
        select(TutorPageSection).where(
            TutorPageSection.tutor_id == member_tutor.id
        )
    ).all()
    assert sections == []


def test_zero_days_protection_is_no_op(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User, student_user: User
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    team.poaching_protection_days = 0
    db_session.add(team)
    db_session.commit()

    member_user, member_tutor = _seed_member_tutor(
        db_session, email="bob@example.com", slug="bob", team_id=team.id
    )
    _seed_booking(
        db_session, tutor=member_tutor, student=student_user, team_id=team.id
    )

    count = _protection.process_tutor_left_team(
        member_tutor, team, db_session, commit=True
    )
    assert count == 0
    rows = db_session.exec(select(TutorProtectedStudent)).all()
    assert rows == []


def test_bookings_outside_team_do_not_protect(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User, student_user: User
):
    """A booking where Booking.tutor_team_id is NULL (tutor was solo at the
    time) should NOT trigger protection when the tutor later leaves a team
    they joined afterward."""
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    member_user, member_tutor = _seed_member_tutor(
        db_session, email="carol@example.com", slug="carol", team_id=team.id
    )
    # Booking with team_id = NULL (solo era).
    _seed_booking(
        db_session, tutor=member_tutor, student=student_user, team_id=None
    )

    count = _protection.process_tutor_left_team(
        member_tutor, team, db_session, commit=True
    )
    assert count == 0


def test_is_student_protected_active_then_expired(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User, student_user: User
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    member_user, member_tutor = _seed_member_tutor(
        db_session, email="dan@example.com", slug="dan", team_id=team.id
    )
    _seed_booking(
        db_session, tutor=member_tutor, student=student_user, team_id=team.id
    )
    _protection.process_tutor_left_team(
        member_tutor, team, db_session, commit=True
    )

    active = _protection.is_student_protected_from_tutor(
        tutor_id=member_tutor.id,
        student_user_id=student_user.id,
        session=db_session,
    )
    assert active is not None

    # Time-travel past the window.
    row = db_session.exec(select(TutorProtectedStudent)).first()
    row.protection_ends_at = datetime.now(UTC) - timedelta(days=1)
    db_session.add(row)
    db_session.commit()

    expired = _protection.is_student_protected_from_tutor(
        tutor_id=member_tutor.id,
        student_user_id=student_user.id,
        session=db_session,
    )
    assert expired is None


# -- HTTP layer --------------------------------------------------------


def test_owner_can_update_protection_days(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    teacher_user.subscription_tier = SubscriptionTier.BUSINESS
    db_session.add(teacher_user)
    db_session.commit()
    r = client.patch(
        "/tutor/team/protection",
        json={"poaching_protection_days": 30},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200, r.json()
    team = db_session.exec(
        select(TutorTeam).where(TutorTeam.owner_user_id == teacher_user.id)
    ).first()
    assert team.poaching_protection_days == 30


def test_member_can_self_leave(
    client, vasso_tutor: Tutor, teacher_user: User, student_user: User, db_session: Session
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    member_user, member_tutor = _seed_member_tutor(
        db_session, email="ellie@example.com", slug="ellie", team_id=team.id
    )
    _seed_booking(
        db_session, tutor=member_tutor, student=student_user, team_id=team.id
    )
    r = client.post(
        "/tutor/team/leave",
        headers={**HOST, **auth_headers_for(member_user)},
    )
    assert r.status_code == 204
    db_session.refresh(member_tutor)
    assert member_tutor.team_id is None


def test_owner_cannot_self_leave(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    r = client.post(
        "/tutor/team/leave",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400


def test_booking_checkout_blocked_during_protection(
    client, vasso_tutor: Tutor, teacher_user: User, student_user: User, db_session: Session
):
    """End-to-end: a student who studied with a tutor while on a team
    can't book that ex-tutor directly during the protection window."""
    # vasso_tutor IS the ex-member here. teacher_user is the school owner.
    # 1. Put vasso_tutor inside teacher_user's team and seed a past booking.
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    vasso_tutor.team_id = team.id
    db_session.add(vasso_tutor)
    db_session.commit()
    _seed_booking(
        db_session, tutor=vasso_tutor, student=student_user, team_id=team.id
    )
    # 2. vasso leaves the team — protection stamps.
    _protection.process_tutor_left_team(
        vasso_tutor, team, db_session, commit=True
    )

    # 3. Set up a Stripe-ready tutor to attempt the booking.
    vasso_tutor.stripe_connect_account_id = "acct_test_protection"
    db_session.add(vasso_tutor)
    pack = LessonPack(
        tutor_id=vasso_tutor.id,
        name="Single 60",
        num_lessons=1,
        duration_minutes=60,
        price_cents=2000,
        currency="eur",
        is_active=True,
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)

    future = (datetime.now(UTC) + timedelta(days=5)).isoformat()
    r = client.post(
        f"/tutor/lesson-packs/{pack.id}/book",
        json={"scheduled_at": future},
        headers={**SUB_HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 403
    assert "school" in r.json()["detail"].lower()
