"""Article CRUD + publish flow + slug uniqueness."""

from __future__ import annotations

from sqlmodel import Session

from backend.models import Article

from .conftest import auth_headers_for

HOST = "vasso.kotobaseed.net"


def _create(client, headers, **overrides):
    body = {
        "title": "Welcome to my site",
        "summary": "An intro post",
        "body_markdown": "# Hi\n\nWelcome aboard.",
        "is_published": False,
    }
    body.update(overrides)
    return client.post("/articles", json=body, headers={"Host": HOST, **headers})


def test_create_requires_owner(client, vasso_tutor, student_user):
    r = _create(client, auth_headers_for(student_user))
    assert r.status_code == 403


def test_create_auto_slugs_from_title(client, vasso_tutor, teacher_user):
    r = _create(client, auth_headers_for(teacher_user), title="Hello World!")
    assert r.status_code == 201, r.text
    assert r.json()["slug"] == "hello-world"


def test_create_dedups_slug_within_tutor(client, vasso_tutor, teacher_user):
    """Two articles with the same title get -2, -3 suffixes."""
    a = _create(client, auth_headers_for(teacher_user), title="Greek basics")
    b = _create(client, auth_headers_for(teacher_user), title="Greek basics")
    c = _create(client, auth_headers_for(teacher_user), title="Greek basics")
    assert a.json()["slug"] == "greek-basics"
    assert b.json()["slug"] == "greek-basics-2"
    assert c.json()["slug"] == "greek-basics-3"


def test_create_can_force_slug(client, vasso_tutor, teacher_user):
    r = _create(
        client,
        auth_headers_for(teacher_user),
        title="A long pretentious title with many words",
        slug="short",
    )
    assert r.json()["slug"] == "short"


def test_slugify_handles_non_latin_gracefully(client, vasso_tutor, teacher_user):
    """Greek title → fallback `untitled` since no Latin characters survive."""
    r = _create(client, auth_headers_for(teacher_user), title="γεια σας")
    # Falls through slugify's stripping; gets the placeholder.
    assert r.json()["slug"] == "untitled"


def test_public_list_shows_only_published(client, vasso_tutor, teacher_user, db_session: Session):
    draft = _create(client, auth_headers_for(teacher_user), title="Draft")
    published = _create(
        client, auth_headers_for(teacher_user), title="Live", is_published=True
    )
    r = client.get("/articles", headers={"Host": HOST})
    slugs = {a["slug"] for a in r.json()}
    assert draft.json()["slug"] not in slugs
    assert published.json()["slug"] in slugs


def test_owner_list_shows_all(client, vasso_tutor, teacher_user):
    _create(client, auth_headers_for(teacher_user), title="Draft")
    _create(client, auth_headers_for(teacher_user), title="Live", is_published=True)
    r = client.get("/articles/all", headers={"Host": HOST, **auth_headers_for(teacher_user)})
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_public_read_404_for_draft(client, vasso_tutor, teacher_user):
    a = _create(client, auth_headers_for(teacher_user), title="Hidden")
    r = client.get(f"/articles/{a.json()['slug']}", headers={"Host": HOST})
    assert r.status_code == 404


def test_public_read_returns_published_body(client, vasso_tutor, teacher_user):
    _create(
        client,
        auth_headers_for(teacher_user),
        title="Open",
        body_markdown="## Hello\n\nworld",
        is_published=True,
    )
    r = client.get("/articles/open", headers={"Host": HOST})
    assert r.status_code == 200
    body = r.json()
    assert body["body_markdown"] == "## Hello\n\nworld"
    assert body["lexical_json"] is None


def test_owner_draft_endpoint_returns_unpublished(client, vasso_tutor, teacher_user):
    a = _create(client, auth_headers_for(teacher_user), title="WIP")
    r = client.get(
        f"/articles/{a.json()['slug']}/draft",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    assert r.json()["is_published"] is False


def test_patch_publishes_and_stamps(client, vasso_tutor, teacher_user, db_session: Session):
    a = _create(client, auth_headers_for(teacher_user), title="To publish")
    r = client.patch(
        f"/articles/{a.json()['id']}",
        json={"is_published": True},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["is_published"] is True
    assert body["published_at"] is not None


def test_patch_unpublish_preserves_published_at(client, vasso_tutor, teacher_user):
    """Once published, published_at stays even if the tutor later
    unpublishes — reflects when it first hit the public site."""
    a = _create(client, auth_headers_for(teacher_user), title="Toggle", is_published=True)
    first = a.json()["published_at"]
    r = client.patch(
        f"/articles/{a.json()['id']}",
        json={"is_published": False},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["published_at"] == first


def test_patch_lexical_json_roundtrips(client, vasso_tutor, teacher_user):
    a = _create(client, auth_headers_for(teacher_user), title="Lexical")
    payload = '{"root": {"type": "root", "children": []}}'
    r = client.patch(
        f"/articles/{a.json()['id']}",
        json={"lexical_json": payload},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["lexical_json"] == payload


def test_patch_other_tutor_404(client, vasso_tutor, teacher_user, db_session: Session):
    """Tutor can't edit articles that belong to a different tutor row even
    if they share the host (defense in depth)."""
    from backend.models import Tutor, TutorAccountStatus, TutorPlan

    other_tutor = Tutor(
        user_id=999_999,
        tutor_slug="other",
        display_name="Other",
        plan=TutorPlan.STARTER,
        account_status=TutorAccountStatus.ACTIVE,
    )
    db_session.add(other_tutor)
    db_session.commit()
    db_session.refresh(other_tutor)
    foreign = Article(
        tutor_id=other_tutor.id,
        slug="foreign",
        title="Foreign",
        body_markdown="",
    )
    db_session.add(foreign)
    db_session.commit()
    db_session.refresh(foreign)
    r = client.patch(
        f"/articles/{foreign.id}",
        json={"title": "Hijacked"},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 404


def test_delete_removes_row(client, vasso_tutor, teacher_user, db_session: Session):
    a = _create(client, auth_headers_for(teacher_user), title="Doomed")
    r = client.delete(
        f"/articles/{a.json()['id']}",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 204
    assert db_session.get(Article, a.json()["id"]) is None


def test_patch_can_rename_slug(client, vasso_tutor, teacher_user):
    a = _create(client, auth_headers_for(teacher_user), title="Original")
    r = client.patch(
        f"/articles/{a.json()['id']}",
        json={"slug": "renamed-post"},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["slug"] == "renamed-post"


def test_patch_slug_rename_dedups_against_others(client, vasso_tutor, teacher_user):
    """Renaming to a slug another article already has appends -2."""
    _create(client, auth_headers_for(teacher_user), title="Taken")
    other = _create(client, auth_headers_for(teacher_user), title="To rename")
    r = client.patch(
        f"/articles/{other.json()['id']}",
        json={"slug": "taken"},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["slug"] == "taken-2"
