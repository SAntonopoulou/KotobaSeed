"""Lesson-pack CRUD + visibility tests."""

from __future__ import annotations

from sqlmodel import Session

from .conftest import auth_headers_for


def _make_pack(client, headers, host="vasso.kotobaseed.net", **overrides):
    body = {
        "name": "Single lesson",
        "description": "One on one, 60 minutes",
        "num_lessons": 1,
        "duration_minutes": 60,
        "price_cents": 2500,
        "currency": "eur",
    }
    body.update(overrides)
    return client.post(
        "/tutor/lesson-packs",
        json=body,
        headers={"Host": host, **headers},
    )


def test_create_requires_owner(client, vasso_tutor, student_user):
    r = _make_pack(client, auth_headers_for(student_user))
    assert r.status_code == 403


def test_create_requires_auth(client, vasso_tutor):
    r = client.post(
        "/tutor/lesson-packs",
        json={
            "name": "Single",
            "num_lessons": 1,
            "duration_minutes": 60,
            "price_cents": 2500,
        },
        headers={"Host": "vasso.kotobaseed.net"},
    )
    assert r.status_code in (401, 403)


def test_owner_can_create_and_list(client, vasso_tutor, teacher_user, db_session: Session):
    r = _make_pack(client, auth_headers_for(teacher_user))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Single lesson"
    assert body["price_cents"] == 2500
    assert body["is_active"] is True

    # Public list shows the new pack
    listing = client.get("/tutor/lesson-packs", headers={"Host": "vasso.kotobaseed.net"})
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["id"] == body["id"]


def test_public_list_hides_inactive(client, vasso_tutor, teacher_user, db_session: Session):
    create = _make_pack(client, auth_headers_for(teacher_user))
    pack_id = create.json()["id"]

    # Deactivate
    r = client.delete(
        f"/tutor/lesson-packs/{pack_id}",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 204

    # Public list no longer shows it
    listing = client.get("/tutor/lesson-packs", headers={"Host": "vasso.kotobaseed.net"})
    assert listing.json() == []

    # Owner's "all" view still shows it
    all_view = client.get(
        "/tutor/lesson-packs/all",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert all_view.status_code == 200
    assert [p["id"] for p in all_view.json()] == [pack_id]
    assert all_view.json()[0]["is_active"] is False


def test_update_changes_only_sent_fields(client, vasso_tutor, teacher_user, db_session: Session):
    create = _make_pack(client, auth_headers_for(teacher_user))
    pack_id = create.json()["id"]

    r = client.patch(
        f"/tutor/lesson-packs/{pack_id}",
        json={"price_cents": 3000},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["price_cents"] == 3000
    assert body["name"] == "Single lesson"  # untouched


def test_non_owner_cant_update(client, vasso_tutor, teacher_user, student_user, db_session: Session):
    create = _make_pack(client, auth_headers_for(teacher_user))
    pack_id = create.json()["id"]

    r = client.patch(
        f"/tutor/lesson-packs/{pack_id}",
        json={"price_cents": 1},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_validation_rejects_silly_inputs(client, vasso_tutor, teacher_user):
    # 0 lessons
    r1 = _make_pack(client, auth_headers_for(teacher_user), num_lessons=0)
    assert r1.status_code == 422
    # 5 minute lesson
    r2 = _make_pack(client, auth_headers_for(teacher_user), duration_minutes=5)
    assert r2.status_code == 422
    # negative price
    r3 = _make_pack(client, auth_headers_for(teacher_user), price_cents=-1)
    assert r3.status_code == 422


# --- Headline single-lesson endpoints ------------------------------------


def test_single_lesson_returns_nulls_when_unset(client, vasso_tutor):
    r = client.get("/tutor/single-lesson", headers={"Host": "vasso.kotobaseed.net"})
    assert r.status_code == 200
    body = r.json()
    assert body["price_cents"] is None
    assert body["duration_minutes"] is None
    assert body["is_active"] is False


def test_single_lesson_put_creates_default_pack(client, vasso_tutor, teacher_user):
    r = client.put(
        "/tutor/single-lesson",
        json={"price_cents": 2500, "duration_minutes": 60, "currency": "eur"},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["price_cents"] == 2500
    assert body["duration_minutes"] == 60
    assert body["is_active"] is True

    # The public lesson-packs feed surfaces it (so the tutor's site can
    # render it inline).
    public = client.get("/tutor/lesson-packs", headers={"Host": "vasso.kotobaseed.net"})
    assert public.status_code == 200
    items = public.json()
    assert len(items) == 1
    assert items[0]["is_default_single"] is True

    # But the owner's "all" feed (used by LessonPackManager) hides it so the
    # tutor isn't editing the same row in two places.
    owner_all = client.get(
        "/tutor/lesson-packs/all",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert owner_all.json() == []


def test_single_lesson_put_updates_existing(client, vasso_tutor, teacher_user):
    client.put(
        "/tutor/single-lesson",
        json={"price_cents": 2500, "duration_minutes": 60},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    r = client.put(
        "/tutor/single-lesson",
        json={"price_cents": 3000, "duration_minutes": 45},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["price_cents"] == 3000
    assert body["duration_minutes"] == 45

    # Only one default-single pack ever exists for a tutor.
    public = client.get("/tutor/lesson-packs", headers={"Host": "vasso.kotobaseed.net"})
    items = public.json()
    assert len([p for p in items if p["is_default_single"]]) == 1


def test_single_lesson_put_requires_owner(client, vasso_tutor, student_user):
    r = client.put(
        "/tutor/single-lesson",
        json={"price_cents": 2500, "duration_minutes": 60},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_single_lesson_delete_soft_deactivates(client, vasso_tutor, teacher_user):
    client.put(
        "/tutor/single-lesson",
        json={"price_cents": 2500, "duration_minutes": 60},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    r = client.delete(
        "/tutor/single-lesson",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 204
    # GET returns the soft-deactivated pack but flags it inactive.
    after = client.get("/tutor/single-lesson", headers={"Host": "vasso.kotobaseed.net"})
    body = after.json()
    assert body["is_active"] is False
    # Public feed no longer surfaces it.
    public = client.get("/tutor/lesson-packs", headers={"Host": "vasso.kotobaseed.net"})
    assert public.json() == []


def test_single_lesson_put_after_delete_reactivates(client, vasso_tutor, teacher_user):
    client.put(
        "/tutor/single-lesson",
        json={"price_cents": 2500, "duration_minutes": 60},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    client.delete(
        "/tutor/single-lesson",
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    r = client.put(
        "/tutor/single-lesson",
        json={"price_cents": 2800, "duration_minutes": 60},
        headers={"Host": "vasso.kotobaseed.net", **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is True
