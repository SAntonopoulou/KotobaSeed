"""Per-tutor article CRUD + public reader.

Tenant-scoped: every endpoint resolves the current tutor via the tenancy
middleware. Public endpoints (`GET /articles`, `GET /articles/{slug}`)
serve only published articles; owner endpoints include drafts.

Slugs are auto-generated from the title when not provided, then
deduped against existing rows for this tutor by appending `-2`, `-3`, etc.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import Article, Tutor, User
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/articles", tags=["articles"])


# --- Slug helpers --------------------------------------------------------


_SLUG_NON_WORD = re.compile(r"[^a-z0-9-]+")
_SLUG_DASH_RUN = re.compile(r"-+")


def slugify(text: str) -> str:
    """Lossy lowercase → ASCII-ish slug. Latin diacritics get folded; non-
    Latin scripts (Greek, Japanese, etc.) get stripped — tutors can hand-
    edit the slug if the auto version is empty."""
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = ascii_text.lower()
    no_invalid = _SLUG_NON_WORD.sub("-", lowered)
    collapsed = _SLUG_DASH_RUN.sub("-", no_invalid).strip("-")
    return collapsed[:120]


def _unique_slug_for(
    base: str, tutor_id: int, session: Session, exclude_id: int | None = None
) -> str:
    """Return `base` if unique for this tutor, else `base-2`, `base-3`, ..."""
    candidate = base or "untitled"
    suffix = 1
    while True:
        attempt = candidate if suffix == 1 else f"{candidate}-{suffix}"
        q = select(Article).where(
            Article.tutor_id == tutor_id,
            Article.slug == attempt,
        )
        if exclude_id is not None:
            q = q.where(Article.id != exclude_id)
        existing = session.exec(q).first()
        if existing is None:
            return attempt
        suffix += 1


# --- Schemas -------------------------------------------------------------


class ArticleSummary(BaseModel):
    """Card-shaped payload for list views."""

    id: int
    slug: str
    title: str
    summary: str | None
    is_published: bool
    published_at: datetime | None
    updated_at: datetime


class ArticleRead(ArticleSummary):
    """Full article body for the reader.

    Returns both representations — the reader prefers lexical_json when
    present (richer rendering with custom blocks) and falls back to
    body_markdown for articles saved by an older client.
    """

    body_markdown: str
    lexical_json: str | None


class ArticleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    body_markdown: str = Field(default="", max_length=200_000)
    lexical_json: str | None = Field(default=None, max_length=500_000)
    slug: str | None = Field(default=None, max_length=120)
    is_published: bool = False


class ArticleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    body_markdown: str | None = Field(default=None, max_length=200_000)
    lexical_json: str | None = Field(default=None, max_length=500_000)
    slug: str | None = Field(default=None, max_length=120)
    is_published: bool | None = None


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _to_summary(article: Article) -> ArticleSummary:
    return ArticleSummary(
        id=article.id,
        slug=article.slug,
        title=article.title,
        summary=article.summary,
        is_published=article.is_published,
        published_at=article.published_at,
        updated_at=article.updated_at,
    )


def _to_read(article: Article) -> ArticleRead:
    return ArticleRead(
        id=article.id,
        slug=article.slug,
        title=article.title,
        summary=article.summary,
        body_markdown=article.body_markdown,
        lexical_json=article.lexical_json,
        is_published=article.is_published,
        published_at=article.published_at,
        updated_at=article.updated_at,
    )


# --- Public reads --------------------------------------------------------


@router.get("", response_model=list[ArticleSummary])
def list_published_articles(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[ArticleSummary]:
    """Public — published articles for the resolved tenant, newest first."""
    rows = session.exec(
        select(Article)
        .where(
            Article.tutor_id == tutor.id,
            Article.is_published == True,  # noqa: E712
        )
        .order_by(Article.published_at.desc())
    ).all()
    return [_to_summary(r) for r in rows]


@router.get("/all", response_model=list[ArticleSummary])
def list_all_articles(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[ArticleSummary]:
    """Owner-only — includes drafts, newest first by updated_at so works-in-
    progress stay at the top of the dashboard list."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(Article)
        .where(Article.tutor_id == tutor.id)
        .order_by(Article.updated_at.desc())
    ).all()
    return [_to_summary(r) for r in rows]


@router.get("/{slug}", response_model=ArticleRead)
def read_article_by_slug(
    slug: str,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    """Public — single published article by slug. 404 for drafts (don't
    leak the existence of unpublished content)."""
    article = session.exec(
        select(Article).where(
            Article.tutor_id == tutor.id,
            Article.slug == slug,
            Article.is_published == True,  # noqa: E712
        )
    ).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    return _to_read(article)


# --- Owner writes --------------------------------------------------------


@router.get("/{slug}/draft", response_model=ArticleRead)
def read_article_draft(
    slug: str,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    """Owner-only — fetch any article (draft or published) by slug for the
    editor. Separate path from the public reader so 404 stays unambiguous."""
    _require_owner(tutor, current)
    article = session.exec(
        select(Article).where(
            Article.tutor_id == tutor.id,
            Article.slug == slug,
        )
    ).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    return _to_read(article)


@router.post("", response_model=ArticleRead, status_code=status.HTTP_201_CREATED)
def create_article(
    payload: ArticleCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    _require_owner(tutor, current)
    base_slug = slugify(payload.slug) if payload.slug else slugify(payload.title)
    slug = _unique_slug_for(base_slug, tutor.id, session)
    now = datetime.now(UTC)
    article = Article(
        tutor_id=tutor.id,
        slug=slug,
        title=payload.title,
        summary=payload.summary,
        body_markdown=payload.body_markdown,
        lexical_json=payload.lexical_json,
        is_published=payload.is_published,
        published_at=now if payload.is_published else None,
    )
    session.add(article)
    session.commit()
    session.refresh(article)
    return _to_read(article)


@router.patch("/{article_id}", response_model=ArticleRead)
def update_article(
    article_id: int,
    payload: ArticleUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    _require_owner(tutor, current)
    article = session.get(Article, article_id)
    if article is None or article.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        article.title = changes["title"]
    if "summary" in changes:
        article.summary = changes["summary"]
    if "body_markdown" in changes:
        article.body_markdown = changes["body_markdown"]
    if "lexical_json" in changes:
        article.lexical_json = changes["lexical_json"]
    if "slug" in changes:
        new_base = slugify(changes["slug"])
        # Dedup against everyone but this article's own row.
        article.slug = _unique_slug_for(new_base, tutor.id, session, exclude_id=article.id)
    if "is_published" in changes:
        was_published = article.is_published
        article.is_published = bool(changes["is_published"])
        if article.is_published and not was_published:
            # First time publishing — stamp now. Re-publishing later
            # preserves the original published_at so syndication readers
            # don't re-surface old posts as new.
            article.published_at = datetime.now(UTC)
    article.updated_at = datetime.now(UTC)
    session.add(article)
    session.commit()
    session.refresh(article)
    return _to_read(article)


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Owner-only — hard delete. Articles don't have FK dependencies (no
    bookings reference them) so we don't need a soft-delete path."""
    _require_owner(tutor, current)
    article = session.get(Article, article_id)
    if article is None or article.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    session.delete(article)
    session.commit()
