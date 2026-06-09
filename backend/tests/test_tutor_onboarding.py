"""Tutor onboarding progress endpoint.

The frontend owns the module catalogue + copy. The backend just keeps a
list of completed module keys and the last-viewed key so the wizard can
resume. Tests cover:

- First read auto-creates a blank progress row
- `complete` appends to the list (idempotent on repeat)
- `view` bumps `last_viewed_*` but not the completed list
- `restart` wipes the row
- `completed_at` stamps when the count meets total_modules
- Non-owner gets 403
"""

from __future__ import annotations

import json

from sqlmodel import Session, select

from backend.models import Tutor, TutorOnboardingProgress, User
from backend.tests.conftest import auth_headers_for

HOST = {"Host": "vasso.kotobaseed.net"}


def test_first_read_creates_blank_row(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    r = client.get(
        "/tutor/onboarding/progress",
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["completed_module_keys"] == []
    assert body["last_viewed_module_key"] is None
    assert body["completed_at"] is None

    row = db_session.exec(
        select(TutorOnboardingProgress).where(
            TutorOnboardingProgress.tutor_id == vasso_tutor.id
        )
    ).first()
    assert row is not None


def test_view_records_last_viewed_only(
    client, vasso_tutor: Tutor, teacher_user: User
):
    r = client.post(
        "/tutor/onboarding/progress",
        json={"action": "view", "module_key": "stripe_connect"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["last_viewed_module_key"] == "stripe_connect"
    assert body["completed_module_keys"] == []


def test_complete_appends_and_is_idempotent(
    client, vasso_tutor: Tutor, teacher_user: User
):
    for _ in range(2):
        r = client.post(
            "/tutor/onboarding/progress",
            json={"action": "complete", "module_key": "welcome"},
            headers={**HOST, **auth_headers_for(teacher_user)},
        )
        assert r.status_code == 200
    assert r.json()["completed_module_keys"] == ["welcome"]


def test_completed_at_stamps_when_all_done(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    """When total_modules is satisfied by the count of completed keys,
    completed_at flips from null to a timestamp."""
    keys = ["welcome", "stripe_connect", "profile"]
    for i, k in enumerate(keys, start=1):
        r = client.post(
            f"/tutor/onboarding/progress?total_modules={len(keys)}",
            json={"action": "complete", "module_key": k},
            headers={**HOST, **auth_headers_for(teacher_user)},
        )
        assert r.status_code == 200
        body = r.json()
        if i < len(keys):
            assert body["completed_at"] is None
        else:
            assert body["completed_at"] is not None


def test_restart_wipes_progress(
    client, vasso_tutor: Tutor, teacher_user: User, db_session: Session
):
    client.post(
        "/tutor/onboarding/progress",
        json={"action": "complete", "module_key": "welcome"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    r = client.post(
        "/tutor/onboarding/progress",
        json={"action": "restart"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["completed_module_keys"] == []
    assert body["last_viewed_module_key"] is None
    assert body["completed_at"] is None

    row = db_session.exec(
        select(TutorOnboardingProgress).where(
            TutorOnboardingProgress.tutor_id == vasso_tutor.id
        )
    ).first()
    assert json.loads(row.completed_module_keys_json) == []


def test_non_owner_blocked(
    client, vasso_tutor: Tutor, student_user: User
):
    r = client.get(
        "/tutor/onboarding/progress",
        headers={**HOST, **auth_headers_for(student_user)},
    )
    assert r.status_code == 403


def test_view_without_module_key_is_400(
    client, vasso_tutor: Tutor, teacher_user: User
):
    r = client.post(
        "/tutor/onboarding/progress",
        json={"action": "view"},
        headers={**HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 400
