"""Support ticket endpoints — create, reply (auto-reopen RESOLVED), staff
status changes with role-gated transitions, escalate, assign, internal
notes, and read-permission rules.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from backend.models import (
    SupportTicket,
    SupportTicketMessage,
    SupportTicketStatus,
    SubscriptionTier,
    UserRole,
)

from .conftest import auth_headers_for, _make_user


HOST = {"Host": "vasso.kotobaseed.net"}


@pytest.fixture
def support_user(db_session: Session):
    u = _make_user(db_session, email="support@kotobaseed.net", role=UserRole.SUPPORT)
    return u


@pytest.fixture
def manager_user(db_session: Session):
    u = _make_user(db_session, email="manager@kotobaseed.net", role=UserRole.MANAGER)
    return u


@pytest.fixture
def admin_user(db_session: Session):
    u = _make_user(db_session, email="adminsupport@kotobaseed.net", role=UserRole.ADMIN)
    return u


def _open_ticket(client, student_user) -> int:
    r = client.post(
        "/support/tickets",
        json={
            "subject": "Help please",
            "body": "Something is broken on my dashboard and I need help.",
            "category": "technical",
        },
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_create_ticket_minimum_fields(client, student_user):
    r = client.post(
        "/support/tickets",
        json={
            "subject": "Hi",  # 2 chars — too short
            "body": "Body of the ticket message that is long enough.",
        },
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 422


def test_user_can_read_own_ticket(client, student_user):
    tid = _open_ticket(client, student_user)
    r = client.get(
        f"/support/tickets/{tid}",
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "open"


def test_user_cannot_read_others_ticket(client, student_user, teacher_user):
    tid = _open_ticket(client, student_user)
    r = client.get(
        f"/support/tickets/{tid}",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 404


def test_user_reply_to_resolved_reopens(client, student_user, support_user, db_session):
    tid = _open_ticket(client, student_user)
    # Staff resolves first.
    r = client.post(
        f"/staff/support/tickets/{tid}/status",
        json={"status": "resolved"},
        headers={**HOST, **auth_headers_for(support_user)},
    )
    assert r.status_code == 200
    # User replies — should bounce back to in_progress.
    r = client.post(
        f"/support/tickets/{tid}/reply",
        json={"body": "Actually still broken — extra info here."},
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


def test_user_cannot_reply_to_closed(client, student_user, manager_user):
    tid = _open_ticket(client, student_user)
    # Manager closes it.
    r = client.post(
        f"/staff/support/tickets/{tid}/status",
        json={"status": "closed"},
        headers={**HOST, **auth_headers_for(manager_user)},
    )
    assert r.status_code == 200
    # User reply must be rejected.
    r = client.post(
        f"/support/tickets/{tid}/reply",
        json={"body": "still need help"},
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_support_cannot_close(client, student_user, support_user):
    tid = _open_ticket(client, student_user)
    r = client.post(
        f"/staff/support/tickets/{tid}/status",
        json={"status": "closed"},
        headers={**HOST, **auth_headers_for(support_user)},
    )
    assert r.status_code == 403


def test_manager_can_close(client, student_user, manager_user):
    tid = _open_ticket(client, student_user)
    r = client.post(
        f"/staff/support/tickets/{tid}/status",
        json={"status": "closed"},
        headers={**HOST, **auth_headers_for(manager_user)},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "closed"


def test_support_escalates(client, student_user, support_user, db_session):
    tid = _open_ticket(client, student_user)
    r = client.post(
        f"/staff/support/tickets/{tid}/escalate",
        headers={**HOST, **auth_headers_for(support_user)},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "escalated"
    assert r.json()["escalation_level"] == 1


def test_admin_cannot_escalate_further(client, student_user, admin_user):
    tid = _open_ticket(client, student_user)
    r = client.post(
        f"/staff/support/tickets/{tid}/escalate",
        headers={**HOST, **auth_headers_for(admin_user)},
    )
    assert r.status_code == 400


def test_staff_internal_note_hidden_from_user(
    client, student_user, support_user, db_session
):
    tid = _open_ticket(client, student_user)
    client.post(
        f"/staff/support/tickets/{tid}/note",
        json={"body": "Internal: routing to billing."},
        headers={**HOST, **auth_headers_for(support_user)},
    )
    # Staff sees internal notes.
    r = client.get(
        f"/support/tickets/{tid}",
        headers={**HOST, **auth_headers_for(support_user)},
    )
    assert any(m.get("is_internal") for m in r.json()["messages"])
    # The submitter doesn't.
    r = client.get(
        f"/support/tickets/{tid}",
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert all(not m.get("is_internal") for m in r.json()["messages"])


def test_manager_can_assign_to_staff(
    client, student_user, manager_user, support_user
):
    tid = _open_ticket(client, student_user)
    r = client.post(
        f"/staff/support/tickets/{tid}/assign",
        json={"assigned_to_user_id": support_user.id},
        headers={**HOST, **auth_headers_for(manager_user)},
    )
    assert r.status_code == 200
    assert r.json()["assigned_to_user_id"] == support_user.id


def test_manager_cannot_assign_to_non_staff(
    client, student_user, manager_user
):
    tid = _open_ticket(client, student_user)
    r = client.post(
        f"/staff/support/tickets/{tid}/assign",
        json={"assigned_to_user_id": student_user.id},
        headers={**HOST, **auth_headers_for(manager_user)},
    )
    assert r.status_code == 400


def test_staff_list_endpoint_returns_active_staff(client, manager_user, support_user):
    r = client.get(
        "/staff/support/staff-list",
        headers={**HOST, **auth_headers_for(manager_user)},
    )
    assert r.status_code == 200
    emails = {row["email"] for row in r.json()}
    assert support_user.email in emails
    assert manager_user.email in emails
