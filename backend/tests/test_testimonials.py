"""Testimonial CRUD + public/owner visibility split."""

from __future__ import annotations

from sqlmodel import Session

from backend.models import Testimonial

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _create(client, headers, **overrides):
    body = {
        "student_name": "Sara M.",
        "body": "Vasso made Greek click for me — finally!",
        "rating": 5,
        "is_published": True,
    }
    body.update(overrides)
    return client.post("/testimonials", json=body, headers={"Host": HOST, **headers})


def test_create_requires_owner(client, vasso_tutor, student_user):
    r = _create(client, auth_headers_for(student_user))
    assert r.status_code == 403


def test_create_succeeds_for_owner(client, vasso_tutor, teacher_user):
    r = _create(client, auth_headers_for(teacher_user))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["student_name"] == "Sara M."
    assert body["rating"] == 5
    assert body["is_published"] is True


def test_rating_validation_rejects_out_of_range(client, vasso_tutor, teacher_user):
    r = _create(client, auth_headers_for(teacher_user), rating=6)
    assert r.status_code == 422
    r2 = _create(client, auth_headers_for(teacher_user), rating=0)
    assert r2.status_code == 422


def test_public_list_returns_only_published(client, vasso_tutor, teacher_user):
    _create(client, auth_headers_for(teacher_user), student_name="Published", is_published=True)
    _create(client, auth_headers_for(teacher_user), student_name="Draft", is_published=False)
    r = client.get("/testimonials", headers={"Host": HOST})
    names = [t["student_name"] for t in r.json()]
    assert "Published" in names
    assert "Draft" not in names


def test_owner_all_returns_drafts(client, vasso_tutor, teacher_user):
    _create(client, auth_headers_for(teacher_user), student_name="Live", is_published=True)
    _create(client, auth_headers_for(teacher_user), student_name="Hidden", is_published=False)
    r = client.get(
        "/testimonials/all",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_public_list_sorted_by_display_order(client, vasso_tutor, teacher_user):
    _create(client, auth_headers_for(teacher_user), student_name="Third", display_order=30)
    _create(client, auth_headers_for(teacher_user), student_name="First", display_order=10)
    _create(client, auth_headers_for(teacher_user), student_name="Second", display_order=20)
    r = client.get("/testimonials", headers={"Host": HOST})
    assert [t["student_name"] for t in r.json()] == ["First", "Second", "Third"]


def test_patch_updates_rating_and_publish(client, vasso_tutor, teacher_user):
    a = _create(client, auth_headers_for(teacher_user), student_name="X")
    r = client.patch(
        f"/testimonials/{a.json()['id']}",
        json={"rating": 4, "is_published": False},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert r.json()["rating"] == 4
    assert r.json()["is_published"] is False


def test_patch_other_tutor_404(client, vasso_tutor, teacher_user, db_session: Session):
    from backend.models import Tutor, TutorAccountStatus, TutorPlan

    other = Tutor(
        user_id=999_999,
        tutor_slug="other",
        display_name="Other",
        plan=TutorPlan.STARTER,
        account_status=TutorAccountStatus.ACTIVE,
    )
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    foreign = Testimonial(
        tutor_id=other.id,
        student_name="Outside",
        body="...",
        rating=5,
    )
    db_session.add(foreign)
    db_session.commit()
    db_session.refresh(foreign)
    r = client.patch(
        f"/testimonials/{foreign.id}",
        json={"body": "Hijacked"},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 404


def test_delete_requires_owner(client, vasso_tutor, teacher_user, student_user):
    a = _create(client, auth_headers_for(teacher_user))
    r = client.delete(
        f"/testimonials/{a.json()['id']}",
        headers={"Host": HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_delete_removes_row(client, vasso_tutor, teacher_user, db_session: Session):
    a = _create(client, auth_headers_for(teacher_user))
    r = client.delete(
        f"/testimonials/{a.json()['id']}",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 204
    assert db_session.get(Testimonial, a.json()["id"]) is None
