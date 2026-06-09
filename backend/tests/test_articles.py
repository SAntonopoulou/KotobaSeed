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


def test_delete_soft_deletes_and_hides_row(client, vasso_tutor, teacher_user, db_session: Session):
    """DELETE soft-deletes (sets deleted_at) so the tutor can restore via
    POST /:id/restore — the row stays in the database but disappears from
    list endpoints."""
    a = _create(client, auth_headers_for(teacher_user), title="Doomed")
    article_id = a.json()["id"]
    r = client.delete(
        f"/articles/{article_id}",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 204
    row = db_session.get(Article, article_id)
    assert row is not None
    assert row.deleted_at is not None
    listing = client.get("/articles/all", headers={"Host": HOST, **auth_headers_for(teacher_user)})
    assert all(item["id"] != article_id for item in listing.json())
    restored = client.post(
        f"/articles/{article_id}/restore",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert restored.status_code == 200
    db_session.expire_all()
    assert db_session.get(Article, article_id).deleted_at is None


def test_patch_can_rename_slug(client, vasso_tutor, teacher_user):
    a = _create(client, auth_headers_for(teacher_user), title="Original")
    r = client.patch(
        f"/articles/{a.json()['id']}",
        json={"slug": "renamed-post"},
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.json()["slug"] == "renamed-post"


def test_default_visibility_is_public(client, vasso_tutor, teacher_user):
    r = _create(client, auth_headers_for(teacher_user), title="Default")
    assert r.json()["visibility"] == "public"


def test_create_with_subscribers_only_visibility(client, vasso_tutor, teacher_user):
    r = _create(
        client,
        auth_headers_for(teacher_user),
        title="Sub only",
        visibility="subscribers_only",
        is_published=True,
    )
    assert r.json()["visibility"] == "subscribers_only"
    # The public articles index hides it.
    listing = client.get("/articles", headers={"Host": HOST})
    assert all(a["slug"] != r.json()["slug"] for a in listing.json())


def test_public_reader_returns_preview_for_subscribers_only(
    client, vasso_tutor, teacher_user
):
    """Anonymous visitor on a SUBSCRIBERS_ONLY article gets a preview
    shape (first 200 words of body OR the tutor's preview_markdown if
    set), with is_preview=True so the frontend can paywall it."""
    body = " ".join([f"word{i}" for i in range(500)])
    _create(
        client,
        auth_headers_for(teacher_user),
        title="Locked",
        visibility="subscribers_only",
        is_published=True,
        body_markdown=body,
    )
    r = client.get("/articles/locked", headers={"Host": HOST})
    assert r.status_code == 200
    data = r.json()
    assert data["is_preview"] is True
    assert data["lexical_json"] is None  # body tree must not leak
    # ~200 words returned, not 500. The trailing "…" is appended by the helper.
    word_count = len(data["body_markdown"].rstrip("…").split())
    assert 150 <= word_count <= 210
    assert data["body_markdown"].endswith("…")


def test_public_reader_uses_preview_markdown_when_set(
    client, vasso_tutor, teacher_user
):
    """If the tutor wrote a preview_markdown, that's returned verbatim
    instead of the auto-fallback."""
    _create(
        client,
        auth_headers_for(teacher_user),
        title="Locked",
        visibility="subscribers_only",
        is_published=True,
        body_markdown="The full secret answer is 42.",
        preview_markdown="Here's a hand-crafted hook the tutor wrote.",
    )
    r = client.get("/articles/locked", headers={"Host": HOST})
    assert r.status_code == 200
    data = r.json()
    assert data["is_preview"] is True
    assert data["body_markdown"] == "Here's a hand-crafted hook the tutor wrote."
    # Full body must NOT leak even though preview_markdown is shorter.
    assert "42" not in data["body_markdown"]


def test_public_reader_404s_module_only_for_anon(
    client, vasso_tutor, teacher_user
):
    """MODULE_ONLY articles still 404 anonymously — their preview lives
    inside the parent module's storefront, not on the article surface."""
    _create(
        client,
        auth_headers_for(teacher_user),
        title="Locked",
        visibility="module_only",
        is_published=True,
    )
    r = client.get("/articles/locked", headers={"Host": HOST})
    assert r.status_code == 404


def test_public_reader_lets_subscribers_through(
    client, vasso_tutor, teacher_user, db_session
):
    """An active StudentTutorSubscription unlocks subscribers-only articles."""
    from datetime import UTC, datetime, timedelta

    from backend.models import (
        StudentTutorSubscription,
        TutorAccountStatus,
        TutorSubscriptionStatus,
        User,
        UserRole,
    )
    from backend.security import get_password_hash

    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    db_session.add(vasso_tutor)
    db_session.commit()
    _create(
        client,
        auth_headers_for(teacher_user),
        title="Locked",
        visibility="subscribers_only",
        is_published=True,
    )
    student = User(
        email="sub@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="S",
        role=UserRole.STUDENT,
        is_active=True,
        email_verified_at=datetime.now(UTC),
    )
    db_session.add(student)
    db_session.commit()
    db_session.refresh(student)
    db_session.add(
        StudentTutorSubscription(
            tutor_id=vasso_tutor.id,
            student_user_id=student.id,
            status=TutorSubscriptionStatus.ACTIVE,
            stripe_subscription_id="sub_test",
            stripe_price_cents_snapshot=1500,
            current_period_end=datetime.now(UTC) + timedelta(days=10),
        )
    )
    db_session.commit()
    r = client.get(
        "/articles/locked",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 200


def test_owner_can_read_own_subscribers_only_article(
    client, vasso_tutor, teacher_user
):
    _create(
        client,
        auth_headers_for(teacher_user),
        title="Mine",
        visibility="subscribers_only",
        is_published=True,
    )
    r = client.get(
        "/articles/mine",
        headers={"Host": HOST, **auth_headers_for(teacher_user)},
    )
    assert r.status_code == 200


def test_module_only_visible_via_module_purchase(
    client, vasso_tutor, teacher_user, db_session
):
    from datetime import UTC, datetime

    from backend.models import (
        LessonModule,
        ModulePurchase,
        TutorAccountStatus,
        User,
        UserRole,
    )
    from backend.security import get_password_hash

    vasso_tutor.account_status = TutorAccountStatus.ACTIVE
    db_session.add(vasso_tutor)
    db_session.commit()
    article_create = _create(
        client,
        auth_headers_for(teacher_user),
        title="Module Lesson",
        visibility="module_only",
        is_published=True,
    )
    article_id = article_create.json()["id"]
    article_slug = article_create.json()["slug"]
    # Create a module that includes this article.
    import json as _json

    module = LessonModule(
        tutor_id=vasso_tutor.id,
        slug="m1",
        title="M1",
        items_json=_json.dumps([{"kind": "article", "ref_id": article_id}]),
        is_published=True,
        published_at=datetime.now(UTC),
        price_cents=1000,
    )
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    student = User(
        email="moduleowner@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="O",
        role=UserRole.STUDENT,
        is_active=True,
        email_verified_at=datetime.now(UTC),
    )
    db_session.add(student)
    db_session.commit()
    db_session.refresh(student)
    db_session.add(
        ModulePurchase(
            module_id=module.id,
            tutor_id=vasso_tutor.id,
            student_user_id=student.id,
            amount_cents=1000,
        )
    )
    db_session.commit()
    r = client.get(
        f"/articles/{article_slug}",
        headers={"Host": HOST, **auth_headers_for(student)},
    )
    assert r.status_code == 200


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
