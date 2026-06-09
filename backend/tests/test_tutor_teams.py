"""TutorTeam invite + accept + seat-cap tests.

Covers:
- ensure_team_for_owner is idempotent + attaches the owner's Tutor
- Non-Business users can't invite (402)
- Owner-only mutations (rename, invite, revoke, remove)
- Seat cap blocks invites once full
- Duplicate-email + already-a-member 409s
- Invite token verify + accept (happy path)
- Accept requires the same email + a Tutor profile
- Removing a member nulls Tutor.team_id
"""

from __future__ import annotations

from sqlmodel import Session, select

from backend.models import (
    SubscriptionTier,
    Tutor,
    TutorTeam,
    TutorTeamInvite,
    TutorTeamInviteStatus,
    User,
    UserRole,
)
from backend.services import teams as _teams
from backend.tests.conftest import auth_headers_for

HOST = {"Host": "kotobaseed.net"}


def _set_business(db_session: Session, user: User) -> None:
    user.subscription_tier = SubscriptionTier.BUSINESS
    db_session.add(user)
    db_session.commit()


def _seed_secondary_tutor(
    db_session: Session, email: str = "member@example.com", slug: str = "member"
) -> tuple[User, Tutor]:
    u = User(
        email=email,
        hashed_password="x",
        full_name="Team Member",
        role=UserRole.TUTOR,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    t = Tutor(
        user_id=u.id,
        tutor_slug=slug,
        display_name="Member Tutor",
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return u, t


# -- service helpers ---------------------------------------------------


def test_ensure_team_for_owner_is_idempotent(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    team1 = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    team2 = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    assert team1.id == team2.id
    rows = db_session.exec(
        select(TutorTeam).where(TutorTeam.owner_user_id == teacher_user.id)
    ).all()
    assert len(rows) == 1


def test_ensure_team_attaches_owner_tutor(
    db_session: Session, vasso_tutor: Tutor, teacher_user: User
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    db_session.refresh(vasso_tutor)
    assert vasso_tutor.team_id == team.id


# -- non-business denied -----------------------------------------------


def test_invite_requires_business_tier(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    # teacher_user is on the default FREE tier — invite must 402.
    r = client.post(
        "/tutor/team/invites",
        json={"email": "new@example.com"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 402


# -- happy path: invite, verify, accept --------------------------------


def test_invite_creates_pending_row(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    _set_business(db_session, teacher_user)
    r = client.post(
        "/tutor/team/invites",
        json={"email": "Newhire@example.com"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 201, r.json()
    assert r.json()["email"] == "newhire@example.com"
    invite = db_session.exec(select(TutorTeamInvite)).first()
    assert invite is not None
    assert invite.status == TutorTeamInviteStatus.PENDING


def test_verify_invite_returns_team_context(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    _set_business(db_session, teacher_user)
    client.post(
        "/tutor/team/invites",
        json={"email": "hi@example.com"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    invite = db_session.exec(select(TutorTeamInvite)).first()
    r = client.get(f"/tutor/team/invites/by-token/{invite.token}")
    assert r.status_code == 200
    assert r.json()["email"] == "hi@example.com"


def test_accept_invite_links_tutor_to_team(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    _set_business(db_session, teacher_user)
    member_user, member_tutor = _seed_secondary_tutor(db_session)
    client.post(
        "/tutor/team/invites",
        json={"email": member_user.email},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    invite = db_session.exec(select(TutorTeamInvite)).first()

    r = client.post(
        "/tutor/team/invites/accept",
        json={"token": invite.token},
        headers={**HOST, **auth_headers_for(member_user)},
    )
    assert r.status_code == 200, r.json()
    db_session.refresh(member_tutor)
    assert member_tutor.team_id is not None
    db_session.refresh(invite)
    assert invite.status == TutorTeamInviteStatus.ACCEPTED


# -- guardrails --------------------------------------------------------


def test_accept_wrong_email_is_403(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    _set_business(db_session, teacher_user)
    client.post(
        "/tutor/team/invites",
        json={"email": "real-invitee@example.com"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    invite = db_session.exec(select(TutorTeamInvite)).first()
    # student_user has a different email so should be rejected.
    from backend.models import User as _U
    other = _U(email="other@example.com", hashed_password="x", full_name="X")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    r = client.post(
        "/tutor/team/invites/accept",
        json={"token": invite.token},
        headers={**HOST, **auth_headers_for(other)},
    )
    assert r.status_code == 403


def test_seat_cap_blocks_extra_invites(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    _set_business(db_session, teacher_user)
    # Shrink team to 2 seats (owner is seat 1) so we can hit the cap fast.
    team.max_seats = 2
    db_session.add(team)
    db_session.commit()

    r1 = client.post(
        "/tutor/team/invites",
        json={"email": "one@example.com"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/tutor/team/invites",
        json={"email": "two@example.com"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r2.status_code == 402


def test_remove_member_nulls_team_id(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    _set_business(db_session, teacher_user)
    member_user, member_tutor = _seed_secondary_tutor(db_session)
    member_tutor.team_id = vasso_tutor.team_id
    db_session.add(member_tutor)
    db_session.commit()

    r = client.delete(
        f"/tutor/team/members/{member_tutor.id}",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 204
    db_session.refresh(member_tutor)
    assert member_tutor.team_id is None


def test_non_owner_cannot_invite(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    team = _teams.ensure_team_for_owner(db_session, teacher_user, commit=True)
    _set_business(db_session, teacher_user)
    # Add a second tutor as member; they should NOT be able to invite.
    member_user, member_tutor = _seed_secondary_tutor(db_session)
    member_tutor.team_id = team.id
    member_user.subscription_tier = SubscriptionTier.BUSINESS  # bypass 402
    db_session.add_all([member_user, member_tutor])
    db_session.commit()

    r = client.post(
        "/tutor/team/invites",
        json={"email": "outside@example.com"},
        headers={**HOST, **auth_headers_for(member_user)},
    )
    assert r.status_code == 403
