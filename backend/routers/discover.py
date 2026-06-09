"""Content-led tutor discovery — cross-tenant article + module feed.

The signature feature that makes Kotobaseed feel different from iTalki:
students browse *content*, not tutor profiles, and discover the tutor
through the content they care about. Tutors who write win more students;
students who can't pay still benefit from the free content (and a few of
them convert to Plus to unlock the premium tier).

Backed only by what already exists:
- Article (public articles across every tenant)
- Module (public modules across every tenant)
- Tutor (so we can attribute and link)

No new tables. Pagination via offset/limit, filterable by language.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import get_session
from ..models import Article, LessonModule, Tutor, User

log = logging.getLogger(__name__)
router = APIRouter(prefix="/discover", tags=["discover"])


# --- schemas ----------------------------------------------------------


class DiscoverItem(BaseModel):
    kind: Literal["article", "module"]
    id: int
    slug: str
    title: str
    summary: str | None
    image_url: str | None
    published_at: datetime
    tutor_id: int
    tutor_slug: str
    tutor_display_name: str
    tutor_photo_url: str | None
    language: str | None
    is_premium: bool


class DiscoverResponse(BaseModel):
    items: list[DiscoverItem]
    has_more: bool
    languages: list[str]


# --- helpers ----------------------------------------------------------


def _languages_taught(raw: str | None) -> list[str]:
    """Tutor.languages_taught can be a JSON array or a CSV — accept both."""
    if not raw:
        return []
    raw = raw.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(s).strip() for s in parsed if str(s).strip()]
    except (TypeError, ValueError):
        pass
    return [piece.strip() for piece in raw.split(",") if piece.strip()]


def _primary_language(user: User) -> str | None:
    """Languages are stored on the User row (single identity source).
    Accepts either a JSON array string or a CSV; returns the first entry
    so cards have a single label to display."""
    langs = _languages_taught(user.languages)
    return langs[0] if langs else None


# --- endpoint ---------------------------------------------------------


@router.get("", response_model=DiscoverResponse)
def list_discover(
    session: Annotated[Session, Depends(get_session)],
    language: str | None = Query(default=None, max_length=40),
    kind: Literal["all", "article", "module"] = "all",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=24, ge=1, le=100),
) -> DiscoverResponse:
    """Public — paginated feed of articles + modules across every tutor.

    `language` filters by the tutor's primary taught language (case
    insensitive substring match against the JSON / CSV stored on
    `Tutor.languages_taught`). `kind` narrows to one content type.

    Sorted by published_at desc — newest first.
    """
    # Build the full list of articles + modules in one trip each, merge
    # in Python. The limit on items per source is the request limit; we
    # then sort + slice. This keeps the query simple and works on both
    # sqlite + postgres without dialect-specific UNIONs.

    items: list[DiscoverItem] = []

    if kind in ("all", "article"):
        rows = session.exec(
            select(Article, Tutor, User)
            .join(Tutor, Tutor.id == Article.tutor_id)
            .join(User, User.id == Tutor.user_id)
            .where(
                Article.is_published == True,  # noqa: E712
                Article.visibility == "public",
                Article.deleted_at.is_(None),
            )
            .order_by(Article.published_at.desc())
            .limit(offset + limit + 1)
        ).all()
        for art, tut, _user in rows:
            tutor_lang = _primary_language(_user)
            if language and (not tutor_lang or language.lower() not in tutor_lang.lower()):
                continue
            items.append(
                DiscoverItem(
                    kind="article",
                    id=art.id,
                    slug=art.slug,
                    title=art.title,
                    summary=art.summary,
                    image_url=getattr(art, "hero_image_url", None),
                    published_at=art.published_at or art.created_at,
                    tutor_id=tut.id,
                    tutor_slug=tut.tutor_slug,
                    tutor_display_name=tut.display_name,
                    tutor_photo_url=_user.avatar_url,
                    language=tutor_lang,
                    is_premium=False,
                )
            )

    if kind in ("all", "module"):
        rows = session.exec(
            select(LessonModule, Tutor, User)
            .join(Tutor, Tutor.id == LessonModule.tutor_id)
            .join(User, User.id == Tutor.user_id)
            .where(LessonModule.is_published == True)  # noqa: E712
            .order_by(LessonModule.published_at.desc())
            .limit(offset + limit + 1)
        ).all()
        for mod, tut, _user in rows:
            tutor_lang = _primary_language(_user)
            if language and (not tutor_lang or language.lower() not in tutor_lang.lower()):
                continue
            items.append(
                DiscoverItem(
                    kind="module",
                    id=mod.id,
                    slug=mod.slug,
                    title=mod.title,
                    summary=mod.summary,
                    image_url=getattr(mod, "featured_image_url", None),
                    published_at=mod.published_at or mod.created_at,
                    tutor_id=tut.id,
                    tutor_slug=tut.tutor_slug,
                    tutor_display_name=tut.display_name,
                    tutor_photo_url=_user.avatar_url,
                    language=tutor_lang,
                    is_premium=bool((getattr(mod, "price_cents", 0) or 0) > 0),
                )
            )

    # Newest first, then paginate.
    items.sort(key=lambda i: i.published_at, reverse=True)
    page = items[offset : offset + limit]
    has_more = len(items) > offset + limit

    # Distinct languages currently in the catalog — drives the filter chip
    # list on the discovery page. We pull from User.languages because
    # Tutor leans on the User row for identity-bearing fields.
    all_langs: set[str] = set()
    lang_rows = session.exec(
        select(User.languages).join(Tutor, Tutor.user_id == User.id)
    ).all()
    for raw in lang_rows:
        for lang in _languages_taught(raw):
            all_langs.add(lang)
    languages_sorted = sorted(all_langs)

    return DiscoverResponse(
        items=page, has_more=has_more, languages=languages_sorted
    )
