"""Homework grading + template CRUD + assignment + submission + auto-assign."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from backend.models import (
    Booking,
    BookingStatus,
    LessonPack,
    TutorAccountStatus,
    User,
    UserRole,
)
from backend.security import get_password_hash
from backend.services import homework_grading

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _headers(user):
    return {"Host": HOST, **auth_headers_for(user)}


def _student(db_session, email="x@example.com"):
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


# --- Grading engine ----------------------------------------------------


def test_grading_mc_single():
    q = {"id": "q1", "type": "mc_single", "prompt": "?", "correct": 1}
    result = homework_grading.grade_submission([q], {"q1": 1})
    assert result["auto_score"] == 1
    assert result["max_score"] == 1
    wrong = homework_grading.grade_submission([q], {"q1": 2})
    assert wrong["auto_score"] == 0


def test_grading_mc_single_with_points():
    q = {"id": "q1", "type": "mc_single", "prompt": "?", "correct": 0, "points": 5}
    result = homework_grading.grade_submission([q], {"q1": 0})
    assert result["auto_score"] == 5
    assert result["max_score"] == 5


def test_grading_mc_multi_all_or_nothing():
    q = {"id": "q1", "type": "mc_multi", "prompt": "?", "correct": [0, 2]}
    assert homework_grading.grade_submission([q], {"q1": [0, 2]})["auto_score"] == 1
    # Partial = 0.
    assert homework_grading.grade_submission([q], {"q1": [0]})["auto_score"] == 0
    # Extra = 0.
    assert homework_grading.grade_submission([q], {"q1": [0, 1, 2]})["auto_score"] == 0
    # Different order, same set = correct.
    assert homework_grading.grade_submission([q], {"q1": [2, 0]})["auto_score"] == 1


def test_grading_fill_blank_with_accents():
    """Greek `γειά` with acute accent should match accepted `γεια`."""
    q = {
        "id": "q1",
        "type": "fill_blank",
        "prompt": "Hello in Greek?",
        "accepted_answers": ["γεια"],
    }
    assert homework_grading.grade_submission([q], {"q1": "γειά"})["auto_score"] == 1
    # Case-insensitive by default.
    assert homework_grading.grade_submission([q], {"q1": "ΓΕΙΑ"})["auto_score"] == 1


def test_grading_fill_blank_case_sensitive_off_by_default_can_be_enabled():
    q = {
        "id": "q1",
        "type": "fill_blank",
        "prompt": "?",
        "accepted_answers": ["Hello"],
        "case_sensitive": True,
    }
    assert homework_grading.grade_submission([q], {"q1": "hello"})["auto_score"] == 0
    assert homework_grading.grade_submission([q], {"q1": "Hello"})["auto_score"] == 1


def test_grading_short_answer_needs_review():
    q = {"id": "q1", "type": "short_answer", "prompt": "?", "points": 5}
    result = homework_grading.grade_submission([q], {"q1": "anything"})
    assert result["needs_manual_review"] is True
    assert result["auto_score"] == 0
    assert result["max_score"] == 5


def test_normalize_accents_helper():
    assert homework_grading.normalize_accents("γειά σου") == "γεια σου"
    assert homework_grading.normalize_accents("café") == "cafe"


# --- Tutor: template CRUD ---------------------------------------------


def _make_template(client, headers, **kwargs):
    body = {
        "title": "Lesson 1 review",
        "questions": [
            {"id": "q1", "type": "mc_single", "prompt": "?", "correct": 0,
             "options": ["a", "b"]},
        ],
    }
    body.update(kwargs)
    return client.post("/tutor/homework/templates", json=body, headers={"Host": HOST, **headers})


def test_template_create_owner_only(client, active_tutor, student_user):
    r = _make_template(client, auth_headers_for(student_user))
    assert r.status_code == 403


def test_template_create_validates_question_shape(client, active_tutor, teacher_user):
    r = _make_template(
        client,
        auth_headers_for(teacher_user),
        questions=[{"id": "q1", "type": "broken", "prompt": "x"}],
    )
    assert r.status_code == 400


def test_template_create_rejects_duplicate_ids(client, active_tutor, teacher_user):
    r = _make_template(
        client,
        auth_headers_for(teacher_user),
        questions=[
            {"id": "q1", "type": "mc_single", "prompt": "?", "correct": 0, "options": ["a"]},
            {"id": "q1", "type": "mc_single", "prompt": "?", "correct": 0, "options": ["b"]},
        ],
    )
    assert r.status_code == 400


def test_template_lifecycle(client, active_tutor, teacher_user):
    created = _make_template(client, auth_headers_for(teacher_user))
    assert created.status_code == 201
    tid = created.json()["id"]
    assert created.json()["max_score"] == 1
    # Update
    r = client.patch(
        f"/tutor/homework/templates/{tid}",
        json={"title": "Lesson 1 redux"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Lesson 1 redux"
    # Soft-delete
    r = client.delete(f"/tutor/homework/templates/{tid}", headers=_headers(teacher_user))
    assert r.status_code == 204
    # Still listable (just inactive)
    listing = client.get("/tutor/homework/templates", headers=_headers(teacher_user))
    assert len(listing.json()) == 1
    assert listing.json()[0]["is_active"] is False


# --- Tutor: assignment + grading flow ----------------------------------


def test_assignment_from_template(
    client, active_tutor, teacher_user, db_session
):
    created = _make_template(client, auth_headers_for(teacher_user))
    tid = created.json()["id"]
    student = _student(db_session, "alice@example.com")
    r = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "template_id": tid},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Lesson 1 review"
    assert body["max_score"] == 1
    assert body["template_id"] == tid


def test_assignment_inline_one_off(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "bob@example.com")
    r = client.post(
        "/tutor/homework/assignments",
        json={
            "student_user_id": student.id,
            "title": "Personalized practice",
            "questions": [
                {"id": "q1", "type": "fill_blank", "prompt": "Hi in Greek?",
                 "accepted_answers": ["γεια"]},
            ],
        },
        headers=_headers(teacher_user),
    )
    assert r.status_code == 201
    assert r.json()["template_id"] is None


def test_assignment_requires_template_or_questions(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "c@example.com")
    r = client.post(
        "/tutor/homework/assignments",
        json={"student_user_id": student.id, "title": "Bad"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 400


def test_tutor_grades_short_answer(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "shortanswer@example.com")
    # Inline assignment with a short answer.
    created = client.post(
        "/tutor/homework/assignments",
        json={
            "student_user_id": student.id,
            "title": "Reflection",
            "questions": [
                {"id": "q1", "type": "short_answer", "prompt": "Why Greek?",
                 "points": 10},
            ],
        },
        headers=_headers(teacher_user),
    )
    aid = created.json()["id"]
    # Student submits
    client.post(
        f"/users/me/assignments/{aid}/submit",
        json={"answers": {"q1": "I like the alphabet."}},
        headers=auth_headers_for(student),
    )
    # The assignment lists submission_needs_review=True for tutor.
    listing = client.get("/tutor/homework/assignments", headers=_headers(teacher_user))
    item = next(a for a in listing.json() if a["id"] == aid)
    assert item["submission_needs_review"] is True
    sub_id = item["submission_id"]
    r = client.post(
        f"/tutor/homework/submissions/{sub_id}/grade",
        json={"manual_score": 8, "feedback": "Nice answer!"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    assert r.json()["submission_score"] == 8
    assert r.json()["submission_needs_review"] is False
    assert r.json()["status"] == "graded"


def test_grade_above_max_rejected(client, active_tutor, teacher_user, db_session):
    student = _student(db_session, "high@example.com")
    created = client.post(
        "/tutor/homework/assignments",
        json={
            "student_user_id": student.id,
            "title": "X",
            "questions": [{"id": "q1", "type": "short_answer", "prompt": "?", "points": 5}],
        },
        headers=_headers(teacher_user),
    )
    aid = created.json()["id"]
    client.post(
        f"/users/me/assignments/{aid}/submit",
        json={"answers": {"q1": "y"}},
        headers=auth_headers_for(student),
    )
    listing = client.get("/tutor/homework/assignments", headers=_headers(teacher_user))
    sub_id = next(a for a in listing.json() if a["id"] == aid)["submission_id"]
    r = client.post(
        f"/tutor/homework/submissions/{sub_id}/grade",
        json={"manual_score": 99},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 400


# --- Student: take quiz, submit, view results --------------------------


def test_student_take_quiz_strips_correct_answers(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "test@example.com")
    created = client.post(
        "/tutor/homework/assignments",
        json={
            "student_user_id": student.id,
            "title": "Pre-submit fetch",
            "questions": [
                {"id": "q1", "type": "mc_single", "prompt": "?", "correct": 1,
                 "options": ["a", "b", "c"]},
                {"id": "q2", "type": "fill_blank", "prompt": "?",
                 "accepted_answers": ["yes"]},
            ],
        },
        headers=_headers(teacher_user),
    )
    aid = created.json()["id"]
    r = client.get(
        f"/users/me/assignments/{aid}",
        headers=auth_headers_for(student),
    )
    assert r.status_code == 200
    # `correct` and `accepted_answers` must not leak before submit.
    for q in r.json()["questions"]:
        assert "correct" not in q
        assert "accepted_answers" not in q


def test_student_submit_autogrades_and_reveals_correct_answers(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "auto@example.com")
    created = client.post(
        "/tutor/homework/assignments",
        json={
            "student_user_id": student.id,
            "title": "Auto",
            "questions": [
                {"id": "q1", "type": "mc_single", "prompt": "?", "correct": 0,
                 "options": ["a", "b"]},
                {"id": "q2", "type": "fill_blank", "prompt": "?",
                 "accepted_answers": ["γεια"]},
            ],
        },
        headers=_headers(teacher_user),
    )
    aid = created.json()["id"]
    r = client.post(
        f"/users/me/assignments/{aid}/submit",
        json={"answers": {"q1": 0, "q2": "γειά"}},  # Both correct
        headers=auth_headers_for(student),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["submission_score"] == 2
    assert body["submission_max_score"] == 2
    # Post-submit, correct answers should be visible.
    assert any("correct" in q for q in body["questions"])


def test_student_cannot_submit_twice(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "twice@example.com")
    created = client.post(
        "/tutor/homework/assignments",
        json={
            "student_user_id": student.id,
            "title": "X",
            "questions": [{"id": "q1", "type": "mc_single", "prompt": "?",
                           "correct": 0, "options": ["a"]}],
        },
        headers=_headers(teacher_user),
    )
    aid = created.json()["id"]
    client.post(
        f"/users/me/assignments/{aid}/submit",
        json={"answers": {"q1": 0}},
        headers=auth_headers_for(student),
    )
    r = client.post(
        f"/users/me/assignments/{aid}/submit",
        json={"answers": {"q1": 0}},
        headers=auth_headers_for(student),
    )
    assert r.status_code == 409


def test_student_cannot_see_others_assignment(
    client, active_tutor, teacher_user, db_session
):
    a = _student(db_session, "ours@example.com")
    other = _student(db_session, "theirs@example.com")
    created = client.post(
        "/tutor/homework/assignments",
        json={
            "student_user_id": a.id,
            "title": "Just for A",
            "questions": [{"id": "q1", "type": "mc_single", "prompt": "?",
                           "correct": 0, "options": ["a"]}],
        },
        headers=_headers(teacher_user),
    )
    aid = created.json()["id"]
    r = client.get(
        f"/users/me/assignments/{aid}",
        headers=auth_headers_for(other),
    )
    assert r.status_code == 404


# --- Auto-assign on booking complete ------------------------------------


def test_auto_assign_on_lesson_complete(
    client, active_tutor, teacher_user, db_session
):
    student = _student(db_session, "autostudent@example.com")
    # Tutor sets up an auto-assign template.
    _make_template(
        client,
        auth_headers_for(teacher_user),
        title="After-class drill",
        auto_assign_on_lesson_complete=True,
    )
    # Tutor also has a non-auto template — shouldn't get assigned.
    _make_template(
        client,
        auth_headers_for(teacher_user),
        title="Optional review",
        auto_assign_on_lesson_complete=False,
    )
    # Create a confirmed booking + complete it.
    pack = LessonPack(
        tutor_id=active_tutor.id,
        name="Single",
        num_lessons=1,
        duration_minutes=60,
        price_cents=2500,
        currency="eur",
    )
    db_session.add(pack)
    db_session.commit()
    db_session.refresh(pack)
    booking = Booking(
        tutor_id=active_tutor.id,
        student_user_id=student.id,
        lesson_pack_id=pack.id,
        scheduled_at=datetime.now(UTC) - timedelta(hours=1),
        duration_minutes=60,
        price_cents=2500,
        currency="eur",
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)
    r = client.post(
        f"/tutor/bookings/{booking.id}/complete",
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    # Student should now have exactly one assignment (the auto-assign template).
    listing = client.get(
        "/users/me/assignments", headers=auth_headers_for(student)
    )
    titles = [a["title"] for a in listing.json()]
    assert titles == ["After-class drill"]
