"""Group threads — members-only async Q&A inside a LanguageGroup.

Endpoints (all under /groups/{slug}/threads):
  GET    /                 — list (sorted by last_reply_at desc)
  POST   /                 — new thread (must be member or tutor for lang)
  GET    /{id}             — thread + replies
  DELETE /{id}             — author can delete own thread (hard delete)
  POST   /{id}/archive     — author can archive (no new replies)
  POST   /{id}/hide        — tutor of the language can soft-hide
  POST   /{id}/unhide      — tutor unhide
  POST   /{id}/replies     — post a reply
  DELETE /{id}/replies/{r} — author delete own reply
  POST   /{id}/replies/{r}/hide — tutor moderation
  POST   /{id}/replies/{r}/unhide

Tutors of the language (i.e. linked via UserLanguageGroup) can moderate
regardless of membership — they have a duty of care for their language
community.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user, get_current_user_optional
from ..models import (
    GroupThread,
    GroupThreadReply,
    LanguageGroup,
    LanguageGroupMembership,
    User,
    UserLanguageGroup,
)

router = APIRouter(prefix="/groups/{slug}/threads", tags=["language-groups", "threads"])


# --- Schemas ----------------------------------------------------------


class ThreadAuthorRead(BaseModel):
    user_id: int
    name: str | None
    avatar_url: str | None
    is_tutor: bool = False


class ThreadSummary(BaseModel):
    id: int
    title: str
    excerpt: str
    author: ThreadAuthorRead
    created_at: datetime
    last_reply_at: datetime
    reply_count: int
    archived: bool = False
    hidden: bool = False


class ReplyRead(BaseModel):
    id: int
    thread_id: int
    author: ThreadAuthorRead
    body_markdown: str
    created_at: datetime
    is_own: bool = False
    hidden: bool = False


class ThreadRead(ThreadSummary):
    body_markdown: str
    replies: list[ReplyRead]
    can_reply: bool = False
    is_own: bool = False


class ThreadCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body_markdown: str = Field(min_length=1, max_length=8000)


class ReplyCreate(BaseModel):
    body_markdown: str = Field(min_length=1, max_length=4000)


# --- Helpers ----------------------------------------------------------


def _group_by_slug(session: Session, slug: str) -> LanguageGroup:
    g = session.exec(
        select(LanguageGroup).where(LanguageGroup.slug == slug)
    ).first()
    if g is None or not g.is_active:
        raise HTTPException(status_code=404, detail="Group not found.")
    return g


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


def _is_language_tutor(session: Session, group_id: int, user_id: int) -> bool:
    """True if this user teaches the group's language (via UserLanguageGroup)."""
    return (
        session.exec(
            select(UserLanguageGroup).where(
                UserLanguageGroup.group_id == group_id,
                UserLanguageGroup.user_id == user_id,
            )
        ).first()
        is not None
    )


def _author_blob(
    session: Session, user_id: int, group_id: int
) -> ThreadAuthorRead:
    u = session.get(User, user_id)
    return ThreadAuthorRead(
        user_id=user_id,
        name=u.full_name if u else None,
        avatar_url=u.avatar_url if u else None,
        is_tutor=_is_language_tutor(session, group_id, user_id) if u else False,
    )


def _excerpt(body: str, n: int = 200) -> str:
    text = (body or "").strip().replace("\n", " ")
    if len(text) <= n:
        return text
    return text[:n].rstrip() + "…"


def _can_post(
    session: Session, group_id: int, user: User
) -> bool:
    """Either a member of the group OR a tutor teaching the language."""
    return _is_member(session, group_id, user.id) or _is_language_tutor(
        session, group_id, user.id
    )


# --- Index ------------------------------------------------------------


@router.get("", response_model=list[ThreadSummary])
def list_threads(
    slug: str,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> list[ThreadSummary]:
    g = _group_by_slug(session, slug)
    is_tutor = (
        current is not None
        and _is_language_tutor(session, g.id, current.id)
    )

    rows = session.exec(
        select(GroupThread)
        .where(GroupThread.group_id == g.id)
        .order_by(GroupThread.last_reply_at.desc())
    ).all()
    out: list[ThreadSummary] = []
    for r in rows:
        hidden = r.hidden_at is not None
        # Hidden threads visible only to author + moderating tutors.
        if hidden and not is_tutor and not (
            current is not None and current.id == r.author_user_id
        ):
            continue
        out.append(
            ThreadSummary(
                id=r.id,
                title=r.title,
                excerpt=_excerpt(r.body_markdown),
                author=_author_blob(session, r.author_user_id, g.id),
                created_at=r.created_at,
                last_reply_at=r.last_reply_at,
                reply_count=r.reply_count,
                archived=r.archived_at is not None,
                hidden=hidden,
            )
        )
    return out


@router.post("", response_model=ThreadRead, status_code=status.HTTP_201_CREATED)
def create_thread(
    slug: str,
    payload: ThreadCreate,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ThreadRead:
    g = _group_by_slug(session, slug)
    if not _can_post(session, g.id, current):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Join the group before posting a thread.",
        )
    now = datetime.now(UTC)
    row = GroupThread(
        group_id=g.id,
        author_user_id=current.id,
        title=payload.title.strip(),
        body_markdown=payload.body_markdown,
        created_at=now,
        last_reply_at=now,
        reply_count=0,
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    # Phase 4 — points + badge ladder.
    from ..services.engagement import record_activity

    record_activity(
        session,
        user=current,
        kind="thread_posted",
        group_ids=[g.id],
        dedupe_key=f"thread:{row.id}",
    )
    return ThreadRead(
        id=row.id,
        title=row.title,
        excerpt=_excerpt(row.body_markdown),
        author=_author_blob(session, row.author_user_id, g.id),
        created_at=row.created_at,
        last_reply_at=row.last_reply_at,
        reply_count=0,
        archived=False,
        hidden=False,
        body_markdown=row.body_markdown,
        replies=[],
        can_reply=True,
        is_own=True,
    )


# --- Detail -----------------------------------------------------------


@router.get("/{thread_id}", response_model=ThreadRead)
def read_thread(
    slug: str,
    thread_id: int,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> ThreadRead:
    g = _group_by_slug(session, slug)
    row = session.get(GroupThread, thread_id)
    if row is None or row.group_id != g.id:
        raise HTTPException(status_code=404, detail="Thread not found.")
    is_tutor = (
        current is not None
        and _is_language_tutor(session, g.id, current.id)
    )
    is_own = current is not None and current.id == row.author_user_id
    if row.hidden_at is not None and not is_tutor and not is_own:
        raise HTTPException(status_code=404, detail="Thread not found.")

    replies = session.exec(
        select(GroupThreadReply)
        .where(GroupThreadReply.thread_id == row.id)
        .order_by(GroupThreadReply.created_at.asc())
    ).all()
    reply_reads: list[ReplyRead] = []
    for r in replies:
        hidden = r.hidden_at is not None
        if hidden and not is_tutor and not (
            current is not None and current.id == r.author_user_id
        ):
            continue
        reply_reads.append(
            ReplyRead(
                id=r.id,
                thread_id=r.thread_id,
                author=_author_blob(session, r.author_user_id, g.id),
                body_markdown=r.body_markdown,
                created_at=r.created_at,
                is_own=current is not None and current.id == r.author_user_id,
                hidden=hidden,
            )
        )

    can_reply = (
        current is not None
        and row.archived_at is None
        and row.hidden_at is None
        and _can_post(session, g.id, current)
    )

    return ThreadRead(
        id=row.id,
        title=row.title,
        excerpt=_excerpt(row.body_markdown),
        author=_author_blob(session, row.author_user_id, g.id),
        created_at=row.created_at,
        last_reply_at=row.last_reply_at,
        reply_count=row.reply_count,
        archived=row.archived_at is not None,
        hidden=row.hidden_at is not None,
        body_markdown=row.body_markdown,
        replies=reply_reads,
        can_reply=can_reply,
        is_own=is_own,
    )


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_own_thread(
    slug: str,
    thread_id: int,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    g = _group_by_slug(session, slug)
    row = session.get(GroupThread, thread_id)
    if row is None or row.group_id != g.id:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if row.author_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author can delete a thread.",
        )
    # Cascade replies.
    for r in session.exec(
        select(GroupThreadReply).where(GroupThreadReply.thread_id == row.id)
    ).all():
        session.delete(r)
    session.delete(row)
    session.commit()


@router.post("/{thread_id}/archive", status_code=204)
def archive_thread(
    slug: str,
    thread_id: int,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    g = _group_by_slug(session, slug)
    row = session.get(GroupThread, thread_id)
    if row is None or row.group_id != g.id:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if row.author_user_id != current.id and not _is_language_tutor(
        session, g.id, current.id
    ):
        raise HTTPException(status_code=403, detail="Not allowed.")
    if row.archived_at is None:
        row.archived_at = datetime.now(UTC)
        session.add(row)
        session.commit()


@router.post("/{thread_id}/hide", status_code=204)
def tutor_hide_thread(
    slug: str,
    thread_id: int,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    g = _group_by_slug(session, slug)
    if not _is_language_tutor(session, g.id, current.id):
        raise HTTPException(status_code=403, detail="Only tutors can hide threads.")
    row = session.get(GroupThread, thread_id)
    if row is None or row.group_id != g.id:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if row.hidden_at is None:
        row.hidden_at = datetime.now(UTC)
        row.hidden_by_user_id = current.id
        session.add(row)
        session.commit()


@router.post("/{thread_id}/unhide", status_code=204)
def tutor_unhide_thread(
    slug: str,
    thread_id: int,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    g = _group_by_slug(session, slug)
    if not _is_language_tutor(session, g.id, current.id):
        raise HTTPException(status_code=403, detail="Only tutors can unhide threads.")
    row = session.get(GroupThread, thread_id)
    if row is None or row.group_id != g.id:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if row.hidden_at is not None:
        row.hidden_at = None
        row.hidden_by_user_id = None
        session.add(row)
        session.commit()


# --- Replies ----------------------------------------------------------


@router.post(
    "/{thread_id}/replies",
    response_model=ReplyRead,
    status_code=status.HTTP_201_CREATED,
)
def post_reply(
    slug: str,
    thread_id: int,
    payload: ReplyCreate,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ReplyRead:
    g = _group_by_slug(session, slug)
    row = session.get(GroupThread, thread_id)
    if row is None or row.group_id != g.id:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if row.archived_at is not None:
        raise HTTPException(status_code=409, detail="Thread is archived.")
    if row.hidden_at is not None:
        raise HTTPException(status_code=404, detail="Thread not found.")
    if not _can_post(session, g.id, current):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Join the group before replying.",
        )
    now = datetime.now(UTC)
    reply = GroupThreadReply(
        thread_id=row.id,
        author_user_id=current.id,
        body_markdown=payload.body_markdown,
        created_at=now,
    )
    session.add(reply)
    row.reply_count = (row.reply_count or 0) + 1
    row.last_reply_at = now
    session.add(row)
    session.commit()
    session.refresh(reply)

    # Phase 4 — replier earns points (deduped per reply id).
    from ..services.engagement import record_activity

    record_activity(
        session,
        user=current,
        kind="thread_reply",
        group_ids=[g.id],
        dedupe_key=f"reply:{reply.id}",
    )
    return ReplyRead(
        id=reply.id,
        thread_id=reply.thread_id,
        author=_author_blob(session, current.id, g.id),
        body_markdown=reply.body_markdown,
        created_at=reply.created_at,
        is_own=True,
        hidden=False,
    )


@router.delete(
    "/{thread_id}/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_own_reply(
    slug: str,
    thread_id: int,
    reply_id: int,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    g = _group_by_slug(session, slug)
    thread = session.get(GroupThread, thread_id)
    if thread is None or thread.group_id != g.id:
        raise HTTPException(status_code=404, detail="Thread not found.")
    reply = session.get(GroupThreadReply, reply_id)
    if reply is None or reply.thread_id != thread.id:
        raise HTTPException(status_code=404, detail="Reply not found.")
    if reply.author_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed."
        )
    session.delete(reply)
    thread.reply_count = max(0, (thread.reply_count or 0) - 1)
    session.add(thread)
    session.commit()


@router.post("/{thread_id}/replies/{reply_id}/hide", status_code=204)
def tutor_hide_reply(
    slug: str,
    thread_id: int,
    reply_id: int,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    g = _group_by_slug(session, slug)
    if not _is_language_tutor(session, g.id, current.id):
        raise HTTPException(status_code=403, detail="Only tutors can hide replies.")
    reply = session.get(GroupThreadReply, reply_id)
    if reply is None or reply.thread_id != thread_id:
        raise HTTPException(status_code=404, detail="Reply not found.")
    if reply.hidden_at is None:
        reply.hidden_at = datetime.now(UTC)
        reply.hidden_by_user_id = current.id
        session.add(reply)
        session.commit()


@router.post("/{thread_id}/replies/{reply_id}/unhide", status_code=204)
def tutor_unhide_reply(
    slug: str,
    thread_id: int,
    reply_id: int,
    current: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    g = _group_by_slug(session, slug)
    if not _is_language_tutor(session, g.id, current.id):
        raise HTTPException(status_code=403, detail="Only tutors can unhide replies.")
    reply = session.get(GroupThreadReply, reply_id)
    if reply is None or reply.thread_id != thread_id:
        raise HTTPException(status_code=404, detail="Reply not found.")
    if reply.hidden_at is not None:
        reply.hidden_at = None
        reply.hidden_by_user_id = None
        session.add(reply)
        session.commit()
