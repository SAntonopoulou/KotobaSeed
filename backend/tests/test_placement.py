"""Placement test CRUD + public take-quiz + submit + band-based level guess."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from backend.models import (
    PlacementSubmission,
    PlacementTest,
    TutorAccountStatus,
    User,
    UserRole,
)
from backend.security import get_password_hash

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _headers(user):
    return {"Host": HOST, **auth_headers_for(user)}


def _student(db_session, email="student@example.com"):
    user = User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name=email.split("@")[0].title(),
        role=UserRole.STUDENT,
        is_active=True,
        email_verified_at=datetime.now(UTC),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def active_tutor(db_session, vasso_tutor, teacher_user):
    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    db_session.add(vasso_tutor)
    db_session.commit()
    db_session.refresh(vasso_tutor)
    return vasso_tutor


def _payload(**overrides):
    body = {
        "title": "Greek placement",
        "description": "Five quick questions",
        "questions": [
            {
                "id": "q1",
                "type": "mc_single",
                "prompt": "What's hello in Greek?",
                "options": ["γεια", "ciao"],
                "correct": 0,
            },
            {
                "id": "q2",
                "type": "fill_blank",
                "prompt": "Greek for 'thank you':",
                "accepted_answers": ["ευχαριστώ"],
            },
        ],
        "level_bands": [
            {"min_percent": 80, "label": "B2"},
            {"min_percent": 50, "label": "A2"},
            {"min_percent": 0, "label": "A1"},
        ],
    }
    body.update(overrides)
    return body


# --- Owner: CRUD --------------------------------------------------------


def test_read_returns_empty_defaults_when_unset(client, active_tutor, teacher_user):
    r = client.get("/tutor/placement-test", headers=_headers(teacher_user))
    assert r.status_code == 200
    body = r.json()
    assert body["questions"] == []
    assert body["is_active"] is False


def test_read_requires_owner(client, active_tutor, student_user):
    r = client.get("/tutor/placement-test", headers=_headers(student_user))
    assert r.status_code == 403


def test_upsert_creates_and_then_updates(
    client, active_tutor, teacher_user, db_session
):
    r1 = client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    assert r1.status_code == 200
    assert r1.json()["max_score"] == 2
    assert r1.json()["is_active"] is True

    r2 = client.put(
        "/tutor/placement-test",
        json=_payload(title="Updated title"),
        headers=_headers(teacher_user),
    )
    assert r2.status_code == 200
    assert r2.json()["title"] == "Updated title"
    # Still only one row for this tutor.
    from sqlmodel import select
    rows = db_session.exec(
        select(PlacementTest).where(PlacementTest.tutor_id == active_tutor.id)
    ).all()
    assert len(rows) == 1


def test_upsert_rejects_malformed_question(client, active_tutor, teacher_user):
    bad = _payload(questions=[{"id": "q1", "type": "bogus", "prompt": "?"}])
    r = client.put("/tutor/placement-test", json=bad, headers=_headers(teacher_user))
    assert r.status_code == 400


def test_upsert_rejects_malformed_band(client, active_tutor, teacher_user):
    bad = _payload(level_bands=[{"min_percent": 150, "label": "Too high"}])
    r = client.put("/tutor/placement-test", json=bad, headers=_headers(teacher_user))
    assert r.status_code == 400


def test_delete_deactivates(client, active_tutor, teacher_user, db_session):
    client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    r = client.delete("/tutor/placement-test", headers=_headers(teacher_user))
    assert r.status_code == 204
    public = client.get(
        "/tutor/placement-test/public", headers={"Host": HOST}
    )
    assert public.json()["is_available"] is False


# --- Public read strips correct answers --------------------------------


def test_public_read_strips_correct_answers(
    client, active_tutor, teacher_user
):
    client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    r = client.get("/tutor/placement-test/public", headers={"Host": HOST})
    assert r.status_code == 200
    body = r.json()
    assert body["is_available"] is True
    for q in body["questions"]:
        assert "correct" not in q
        assert "accepted_answers" not in q


def test_public_read_reports_unavailable_when_none(client, active_tutor):
    r = client.get("/tutor/placement-test/public", headers={"Host": HOST})
    assert r.status_code == 200
    assert r.json()["is_available"] is False


# --- Submit + bands ---------------------------------------------------


def test_submit_grades_and_picks_band(
    client, active_tutor, teacher_user, db_session
):
    client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    student = _student(db_session)
    r = client.post(
        "/tutor/placement-test/submit",
        json={"answers": {"q1": 0, "q2": "ευχαριστώ"}},  # both correct → 100%
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["auto_score"] == 2
    assert body["percent"] == 100
    assert body["level_label"] == "B2"


def test_submit_picks_lower_band_for_lower_score(
    client, active_tutor, teacher_user, db_session
):
    client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    student = _student(db_session, "lower@example.com")
    r = client.post(
        "/tutor/placement-test/submit",
        json={"answers": {"q1": 0, "q2": "wrong"}},  # 1/2 → 50%
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.json()["percent"] == 50
    assert r.json()["level_label"] == "A2"


def test_submit_no_band_when_no_bands_configured(
    client, active_tutor, teacher_user, db_session
):
    client.put(
        "/tutor/placement-test",
        json=_payload(level_bands=[]),
        headers=_headers(teacher_user),
    )
    student = _student(db_session, "noband@example.com")
    r = client.post(
        "/tutor/placement-test/submit",
        json={"answers": {"q1": 0, "q2": "ευχαριστώ"}},
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.json()["level_label"] is None


def test_submit_404_when_no_test(client, active_tutor, db_session):
    student = _student(db_session, "notest@example.com")
    r = client.post(
        "/tutor/placement-test/submit",
        json={"answers": {}},
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 404


def test_tutor_cannot_take_own_test(
    client, active_tutor, teacher_user
):
    client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    r = client.post(
        "/tutor/placement-test/submit",
        json={"answers": {"q1": 0}},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 400


def test_student_can_retake(
    client, active_tutor, teacher_user, db_session
):
    """Two submissions from the same student create two rows so the tutor
    sees progression."""
    client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    student = _student(db_session, "retake@example.com")
    for _ in range(2):
        client.post(
            "/tutor/placement-test/submit",
            json={"answers": {"q1": 0}},
            headers={"Host": HOST, **auth_headers_for(student)},
        )
    from sqlmodel import select
    rows = db_session.exec(
        select(PlacementSubmission).where(
            PlacementSubmission.tutor_id == active_tutor.id,
            PlacementSubmission.student_user_id == student.id,
        )
    ).all()
    assert len(rows) == 2


# --- Tutor: list submissions ------------------------------------------


def test_list_submissions_returns_score_and_band(
    client, active_tutor, teacher_user, db_session
):
    client.put(
        "/tutor/placement-test", json=_payload(), headers=_headers(teacher_user)
    )
    student = _student(db_session, "sub@example.com")
    client.post(
        "/tutor/placement-test/submit",
        json={"answers": {"q1": 0, "q2": "ευχαριστώ"}},
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    r = client.get(
        "/tutor/placement-submissions", headers=_headers(teacher_user)
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["student_email"] == "sub@example.com"
    assert body[0]["percent"] == 100
    assert body[0]["level_label"] == "B2"


def test_list_submissions_requires_owner(
    client, active_tutor, student_user
):
    r = client.get(
        "/tutor/placement-submissions",
        headers={"Host": HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 403
