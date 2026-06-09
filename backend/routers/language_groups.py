"""Language Groups — per-language community surface.

Phase 1A endpoints:
- GET /groups                  → list every active group (apex index)
- GET /groups/{slug}           → group detail (hero, pinned tutors, articles)
- POST /groups/{slug}/join     → join group (auth required)
- DELETE /groups/{slug}/join   → leave group

Phase 1B (next session) adds article comments + ratings.
Phase 2 adds cohorts. Phase 3 adds threads. Phase 4 adds badges.

The router is mounted at the apex (no tenant scoping) — groups are a
cross-tutor surface.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_user, get_current_user_optional
from ..models import (
    Article,
    ArticleVisibility,
    LanguageGroup,
    LanguageGroupMembership,
    Tutor,
    User,
    UserLanguageGroup,
)

router = APIRouter(prefix="/groups", tags=["language-groups"])


# --- Schemas ----------------------------------------------------------


class GroupSummary(BaseModel):
    id: int
    slug: str
    language_name: str
    description: str | None
    cover_color: str | None
    member_count: int
    tutor_count: int
    is_member: bool = False


class GroupTutorRead(BaseModel):
    user_id: int
    tutor_slug: str | None
    display_name: str | None
    photo_url: str | None
    bio_excerpt: str | None
    pinned: bool = False


class GroupArticleRead(BaseModel):
    id: int
    slug: str
    title: str
    summary: str | None
    published_at: datetime | None
    tutor_id: int
    tutor_slug: str | None
    tutor_display_name: str | None


class GroupRead(GroupSummary):
    tutors: list[GroupTutorRead]
    recent_articles: list[GroupArticleRead]
    # Open + confirmed cohorts that members can buy seats in. Phase 2.
    cohorts: list[dict] = []
    # Top 10 of the current month's leaderboard. Phase 4.
    leaderboard: list[dict] = []


class JoinResponse(BaseModel):
    is_member: bool


# --- Helpers ----------------------------------------------------------


def _slugify(text: str) -> str:
    import re
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_text = "".join(c for c in decomposed if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9-]+", "-", ascii_text.lower())
    return re.sub(r"-+", "-", cleaned).strip("-")[:80] or "group"


def _group_by_slug(session: Session, slug: str) -> LanguageGroup:
    """Find a group by slug; falls back to language_name lowercased so
    legacy rows without slugs still resolve cleanly."""
    g = session.exec(
        select(LanguageGroup).where(LanguageGroup.slug == slug)
    ).first()
    if g is not None:
        return g
    # Tolerate slug-less rows by matching against the legacy
    # lowercased language_name.
    g = session.exec(
        select(LanguageGroup).where(func.lower(LanguageGroup.language_name) == slug)
    ).first()
    if g is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    return g


def _tutor_count(session: Session, group_id: int) -> int:
    return int(
        session.exec(
            select(func.count(UserLanguageGroup.user_id)).where(
                UserLanguageGroup.group_id == group_id
            )
        ).one()
        or 0
    )


def _member_count(session: Session, group_id: int) -> int:
    return int(
        session.exec(
            select(func.count(LanguageGroupMembership.id)).where(
                LanguageGroupMembership.group_id == group_id
            )
        ).one()
        or 0
    )


def _is_member(session: Session, group_id: int, user_id: int) -> bool:
    return (
        session.exec(
            select(LanguageGroupMembership).where(
                LanguageGroupMembership.group_id == group_id,
                LanguageGroupMembership.user_id == user_id,
            )
        ).first()
        is not None
    )


# --- Index ------------------------------------------------------------


@router.get("", response_model=list[GroupSummary])
def list_groups(
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> list[GroupSummary]:
    """All active language groups, sorted by member count desc."""
    rows = session.exec(
        select(LanguageGroup)
        .where(LanguageGroup.is_active == True)  # noqa: E712
        .order_by(LanguageGroup.language_name)
    ).all()
    out: list[GroupSummary] = []
    for g in rows:
        out.append(
            GroupSummary(
                id=g.id,
                slug=g.slug or _slugify(g.language_name),
                language_name=g.language_name,
                description=g.description,
                cover_color=g.cover_color,
                member_count=_member_count(session, g.id),
                tutor_count=_tutor_count(session, g.id),
                is_member=_is_member(session, g.id, current.id) if current else False,
            )
        )
    out.sort(key=lambda s: (-s.member_count, -s.tutor_count, s.language_name))
    return out


# --- Detail -----------------------------------------------------------


@router.get("/{slug}", response_model=GroupRead)
def read_group(
    slug: str,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> GroupRead:
    g = _group_by_slug(session, slug)
    if not g.is_active:
        raise HTTPException(status_code=404, detail="Group not found.")

    # Tutors who teach this language. We pull tutor profile data via the
    # User → Tutor relationship.
    tutor_user_ids = [
        row
        for row in session.exec(
            select(UserLanguageGroup.user_id).where(
                UserLanguageGroup.group_id == g.id
            )
        ).all()
    ]
    tutors_out: list[GroupTutorRead] = []
    if tutor_user_ids:
        tutor_rows = session.exec(
            select(Tutor).where(Tutor.user_id.in_(tutor_user_ids))
        ).all()
        # Pinned members get a "pinned" role marker. We look up the
        # editorial role per (group, user).
        pinned_ids = set(
            session.exec(
                select(LanguageGroupMembership.user_id).where(
                    LanguageGroupMembership.group_id == g.id,
                    LanguageGroupMembership.role == "pinned",
                )
            ).all()
        )
        for t in tutor_rows:
            user = session.get(User, t.user_id)
            bio = (user.bio or "")[:160].strip() if user else None
            tutors_out.append(
                GroupTutorRead(
                    user_id=t.user_id,
                    tutor_slug=t.tutor_slug,
                    display_name=t.display_name,
                    photo_url=user.avatar_url if user else None,
                    bio_excerpt=bio or None,
                    pinned=t.user_id in pinned_ids,
                )
            )
        # Pinned first, then alphabetical.
        tutors_out.sort(
            key=lambda t: (not t.pinned, (t.display_name or "").lower())
        )

    # Recent articles from every tutor in this group. Public visibility
    # only — subscriber-only articles surface via the article reader's
    # preview gate, not in a public feed.
    articles_out: list[GroupArticleRead] = []
    if tutor_user_ids:
        # Tutor.id → tutor_user_id reverse lookup
        tutor_id_by_user = {t.user_id: t for t in tutor_rows}
        tutor_table_ids = [t.id for t in tutor_rows]
        if tutor_table_ids:
            article_rows = session.exec(
                select(Article)
                .where(
                    Article.tutor_id.in_(tutor_table_ids),
                    Article.is_published == True,  # noqa: E712
                    Article.visibility == ArticleVisibility.PUBLIC,
                    Article.deleted_at.is_(None),
                )
                .order_by(Article.published_at.desc())
                .limit(12)
            ).all()
            tutor_by_id = {t.id: t for t in tutor_rows}
            for a in article_rows:
                t = tutor_by_id.get(a.tutor_id)
                articles_out.append(
                    GroupArticleRead(
                        id=a.id,
                        slug=a.slug,
                        title=a.title,
                        summary=a.summary,
                        published_at=a.published_at,
                        tutor_id=t.id if t else 0,
                        tutor_slug=t.tutor_slug if t else None,
                        tutor_display_name=t.display_name if t else None,
                    )
                )

    # Cohorts open in this group. Imported lazily so a cohorts-module
    # refactor doesn't break this read endpoint.
    from .cohorts import list_open_cohorts_for_group
    from ..services.engagement import leaderboard_for_group

    cohorts = [
        c.model_dump(mode="json") for c in list_open_cohorts_for_group(session, g.id)
    ]
    leaderboard = leaderboard_for_group(session, group_id=g.id, limit=10)

    return GroupRead(
        id=g.id,
        slug=g.slug or _slugify(g.language_name),
        language_name=g.language_name,
        description=g.description,
        cover_color=g.cover_color,
        member_count=_member_count(session, g.id),
        tutor_count=len(tutors_out),
        is_member=_is_member(session, g.id, current.id) if current else False,
        tutors=tutors_out,
        recent_articles=articles_out,
        cohorts=cohorts,
        leaderboard=leaderboard,
    )


# --- Join / Leave -----------------------------------------------------


@router.post("/{slug}/join", response_model=JoinResponse)
def join_group(
    slug: str,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> JoinResponse:
    g = _group_by_slug(session, slug)
    if not g.is_active:
        raise HTTPException(status_code=404, detail="Group not found.")
    existing = session.exec(
        select(LanguageGroupMembership).where(
            LanguageGroupMembership.group_id == g.id,
            LanguageGroupMembership.user_id == current.id,
        )
    ).first()
    if existing is not None:
        return JoinResponse(is_member=True)
    row = LanguageGroupMembership(
        group_id=g.id,
        user_id=current.id,
        joined_at=datetime.now(UTC),
        role="member",
    )
    session.add(row)
    session.commit()
    return JoinResponse(is_member=True)


@router.delete("/{slug}/join", response_model=JoinResponse)
def leave_group(
    slug: str,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> JoinResponse:
    g = _group_by_slug(session, slug)
    existing = session.exec(
        select(LanguageGroupMembership).where(
            LanguageGroupMembership.group_id == g.id,
            LanguageGroupMembership.user_id == current.id,
        )
    ).first()
    if existing is not None:
        session.delete(existing)
        session.commit()
    return JoinResponse(is_member=False)
