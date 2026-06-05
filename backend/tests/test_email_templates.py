"""Per-tutor email template CRUD + render + safe placeholder fallback."""

from __future__ import annotations

from sqlmodel import Session, select

from backend.models import TutorEmailTemplate
from backend.services import email_templates as svc

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _headers(user):
    return {"Host": HOST, **auth_headers_for(user)}


# --- Pure service ----------------------------------------------------


def test_safe_dict_returns_braced_key_for_missing():
    safe = svc.SafePlaceholderDict({"name": "Sara"})
    template = "Hi {name}, your {bookng_date} is set."  # intentional typo
    assert template.format_map(safe) == "Hi Sara, your {bookng_date} is set."


def test_markdown_to_html_paragraphs_and_inline():
    html = svc._markdown_to_html(
        "Hi **Sara**,\n\nYour lesson with *Vasso* is set.\n\n"
        "[Join here](https://example.com/x)"
    )
    assert "<p>Hi <strong>Sara</strong>,</p>" in html
    assert "<em>Vasso</em>" in html
    assert 'href="https://example.com/x"' in html


def test_markdown_to_html_escapes_html_injection():
    html = svc._markdown_to_html("<script>alert(1)</script>")
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_render_uses_default_when_no_override(db_session: Session, vasso_tutor):
    subject, body_html = svc.render(
        "booking_confirmation_student",
        {
            "student_name": "Sara",
            "tutor_name": "Vasso",
            "when": "Fri 14 Feb at 18:00 UTC",
            "duration_minutes": 60,
            "pack_name": "Single lesson",
            "classroom_url": "https://x.test",
        },
        session=db_session,
        tutor=vasso_tutor,
    )
    assert subject == "Your lesson with Vasso is confirmed"
    assert "<strong>Vasso</strong>" in body_html
    assert 'href="https://x.test"' in body_html


def test_render_uses_override_when_present(db_session: Session, vasso_tutor):
    override = TutorEmailTemplate(
        tutor_id=vasso_tutor.id,
        template_key="booking_confirmation_student",
        subject="Hey {student_name} — you're booked!",
        body_markdown="See you {when}.",
    )
    db_session.add(override)
    db_session.commit()
    subject, body_html = svc.render(
        "booking_confirmation_student",
        {
            "student_name": "Sara",
            "tutor_name": "Vasso",
            "when": "Fri 14 Feb at 18:00",
            "duration_minutes": 60,
            "pack_name": "Single lesson",
            "classroom_url": "https://x.test",
        },
        session=db_session,
        tutor=vasso_tutor,
    )
    assert subject == "Hey Sara — you're booked!"
    assert "See you Fri 14 Feb at 18:00." in body_html


def test_render_missing_placeholder_does_not_crash(
    db_session: Session, vasso_tutor
):
    override = TutorEmailTemplate(
        tutor_id=vasso_tutor.id,
        template_key="booking_confirmation_student",
        subject="Hi {custome_name}",  # typo
        body_markdown="Welcome",
    )
    db_session.add(override)
    db_session.commit()
    subject, _ = svc.render(
        "booking_confirmation_student",
        {"student_name": "Sara"},
        session=db_session,
        tutor=vasso_tutor,
    )
    assert subject == "Hi {custome_name}"


def test_render_unknown_key_raises():
    import pytest

    with pytest.raises(ValueError):
        svc.render("nonexistent", {}, session=None, tutor=None)


# --- HTTP endpoints --------------------------------------------------


def test_list_requires_owner(client, vasso_tutor, student_user):
    r = client.get("/tutor/email-templates", headers=_headers(student_user))
    assert r.status_code == 403


def test_list_returns_defaults_for_fresh_tutor(client, vasso_tutor, teacher_user):
    r = client.get("/tutor/email-templates", headers=_headers(teacher_user))
    assert r.status_code == 200
    body = r.json()
    keys = {t["key"] for t in body}
    assert "booking_confirmation_student" in keys
    assert "booking_reminder_student" in keys
    assert "trial_welcome_student" in keys
    assert all(t["is_overridden"] is False for t in body)
    # Defaults are surfaced both in the live fields and the *_default fields.
    bc = next(t for t in body if t["key"] == "booking_confirmation_student")
    assert bc["subject"] == bc["default_subject"]
    assert "student_name" in bc["placeholders"]


def test_put_creates_override(client, vasso_tutor, teacher_user, db_session):
    r = client.put(
        "/tutor/email-templates/booking_confirmation_student",
        json={
            "subject": "Custom subject for {student_name}",
            "body_markdown": "Hi {student_name}!",
        },
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["is_overridden"] is True
    assert body["subject"] == "Custom subject for {student_name}"
    # The list endpoint reflects the override.
    listing = client.get("/tutor/email-templates", headers=_headers(teacher_user))
    bc = next(
        t for t in listing.json() if t["key"] == "booking_confirmation_student"
    )
    assert bc["is_overridden"] is True


def test_put_updates_existing_row(client, vasso_tutor, teacher_user, db_session):
    client.put(
        "/tutor/email-templates/booking_confirmation_student",
        json={"subject": "First", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    client.put(
        "/tutor/email-templates/booking_confirmation_student",
        json={"subject": "Second", "body_markdown": "Hi"},
        headers=_headers(teacher_user),
    )
    rows = db_session.exec(
        select(TutorEmailTemplate).where(
            TutorEmailTemplate.tutor_id == vasso_tutor.id,
            TutorEmailTemplate.template_key == "booking_confirmation_student",
        )
    ).all()
    assert len(rows) == 1  # update in place, no second row
    assert rows[0].subject == "Second"


def test_put_unknown_key_404(client, vasso_tutor, teacher_user):
    r = client.put(
        "/tutor/email-templates/nope",
        json={"subject": "x", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 404


def test_delete_reverts_to_default(client, vasso_tutor, teacher_user, db_session):
    client.put(
        "/tutor/email-templates/booking_confirmation_student",
        json={"subject": "Custom", "body_markdown": ""},
        headers=_headers(teacher_user),
    )
    r = client.delete(
        "/tutor/email-templates/booking_confirmation_student",
        headers=_headers(teacher_user),
    )
    assert r.status_code == 204
    listing = client.get("/tutor/email-templates", headers=_headers(teacher_user))
    bc = next(
        t for t in listing.json() if t["key"] == "booking_confirmation_student"
    )
    assert bc["is_overridden"] is False


def test_delete_idempotent_when_no_override(client, vasso_tutor, teacher_user):
    r = client.delete(
        "/tutor/email-templates/booking_confirmation_student",
        headers=_headers(teacher_user),
    )
    assert r.status_code == 204


def test_preview_renders_with_sample_data(client, vasso_tutor, teacher_user):
    r = client.post(
        "/tutor/email-templates/booking_confirmation_student/preview",
        json={
            "subject": "Hi {student_name}!",
            "body_markdown": "See you {when}.",
        },
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["subject"] == "Hi Sara!"
    assert "See you Friday 14 February at 18:00 (UTC)." in body["body_html"]


def test_preview_safe_for_unknown_placeholders(client, vasso_tutor, teacher_user):
    r = client.post(
        "/tutor/email-templates/booking_confirmation_student/preview",
        json={"subject": "Hi {nope}", "body_markdown": "{still_nope}"},
        headers=_headers(teacher_user),
    )
    assert r.status_code == 200
    assert r.json()["subject"] == "Hi {nope}"
