"""Article comments + ratings.

Both endpoints are gated by the same dwell + scroll thresholds as the
premium-read tracker — a reader has to have actually read the article
before they can rate or comment. Stops drive-by spam without forcing a
captcha.

Comments are opt-in per article: the tutor flips
`Article.comments_enabled = True` to surface them. Off by default.
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
    Article,
    ArticleComment,
    ArticleRating,
    PremiumArticleRead,
    Tutor,
    User,
)
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/articles", tags=["article-engagement"])

# Same anti-gaming thresholds the premium-read tracker uses. Documented
# in routers/articles.py — keep these in sync if you bump them.
ENGAGE_MIN_DWELL_SECONDS = 30
ENGAGE_MIN_SCROLL_PERCENT = 50


# --- Schemas ----------------------------------------------------------


class CommentRead(BaseModel):
    id: int
    article_id: int
    parent_id: int | None
    author_user_id: int
    author_name: str | None
    author_avatar_url: str | None
    body_markdown: str
    created_at: datetime
    hidden: bool
    is_own: bool = False
    is_tutor_response: bool = False


class CommentCreate(BaseModel):
    body_markdown: str = Field(min_length=1, max_length=4000)
    parent_id: int | None = None
    # Anti-spam — client reports its dwell + scroll. The server re-checks
    # too, just in case a determined commenter forges the numbers; we
    # also require a PremiumArticleRead row OR a fresh dwell.
    dwell_seconds: int = Field(ge=0, le=86_400)
    scroll_percent: int = Field(ge=0, le=100)


class CommentListResponse(BaseModel):
    enabled: bool
    items: list[CommentRead]


class RatingRead(BaseModel):
    avg: float | None
    count: int
    your_stars: int | None = None
    your_body: str | None = None


class RatingUpsert(BaseModel):
    stars: int = Field(ge=1, le=5)
    body: str | None = Field(default=None, max_length=280)
    dwell_seconds: int = Field(ge=0, le=86_400)
    scroll_percent: int = Field(ge=0, le=100)


# --- Helpers ----------------------------------------------------------


def _get_article(session: Session, tutor: Tutor, article_id: int) -> Article:
    a = session.get(Article, article_id)
    if (
        a is None
        or a.tutor_id != tutor.id
        or not a.is_published
        or a.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Article not found.")
    return a


def _engagement_gate_ok(
    session: Session,
    *,
    article_id: int,
    user_id: int,
    dwell: int,
    scroll: int,
) -> bool:
    """Allow comments/ratings if the client reports dwell + scroll past
    the thresholds, OR if there's already a PremiumArticleRead row for
    this user/article (meaning they passed the gate previously)."""
    if dwell >= ENGAGE_MIN_DWELL_SECONDS and scroll >= ENGAGE_MIN_SCROLL_PERCENT:
        return True
    prior = session.exec(
        select(PremiumArticleRead).where(
            PremiumArticleRead.article_id == article_id,
            PremiumArticleRead.student_user_id == user_id,
        )
    ).first()
    return prior is not None


def _author_blurb(user: User | None) -> tuple[str | None, str | None]:
    if user is None:
        return (None, None)
    return (user.full_name, user.avatar_url)


def _recompute_article_rating(session: Session, article: Article) -> None:
    """Recompute denormalised rating_avg + rating_count on the article.

    Called inside the same session after an insert/update/delete so the
    summary is always consistent with the rating rows."""
    rows = session.exec(
        select(ArticleRating).where(ArticleRating.article_id == article.id)
    ).all()
    if rows:
        article.rating_count = len(rows)
        article.rating_avg = round(sum(r.stars for r in rows) / len(rows), 2)
    else:
        article.rating_count = 0
        article.rating_avg = None
    session.add(article)


# --- Comments ---------------------------------------------------------


@router.get("/{article_id}/comments", response_model=CommentListResponse)
def list_comments(
    article_id: int,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> CommentListResponse:
    article = _get_article(session, tutor, article_id)
    if not article.comments_enabled:
        return CommentListResponse(enabled=False, items=[])

    is_owner = current is not None and current.id == tutor.user_id

    rows = session.exec(
        select(ArticleComment)
        .where(ArticleComment.article_id == article.id)
        .order_by(ArticleComment.created_at.asc())
    ).all()

    # Look up author display info in one go.
    author_ids = {r.author_user_id for r in rows}
    authors: dict[int, User] = {}
    if author_ids:
        for u in session.exec(select(User).where(User.id.in_(author_ids))).all():
            authors[u.id] = u

    items: list[CommentRead] = []
    for r in rows:
        # Hidden comments are visible to: the tutor, and the author of
        # the hidden comment. Everyone else doesn't see them at all.
        hidden = r.hidden_at is not None
        if hidden and not is_owner and not (
            current is not None and current.id == r.author_user_id
        ):
            continue
        author = authors.get(r.author_user_id)
        name, avatar = _author_blurb(author)
        items.append(
            CommentRead(
                id=r.id,
                article_id=r.article_id,
                parent_id=r.parent_id,
                author_user_id=r.author_user_id,
                author_name=name,
                author_avatar_url=avatar,
                body_markdown=r.body_markdown,
                created_at=r.created_at,
                hidden=hidden,
                is_own=current is not None and current.id == r.author_user_id,
                is_tutor_response=r.author_user_id == tutor.user_id,
            )
        )
    return CommentListResponse(enabled=True, items=items)


@router.post(
    "/{article_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
def post_comment(
    article_id: int,
    payload: CommentCreate,
    current: Annotated[User, Depends(get_current_user)],
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> CommentRead:
    article = _get_article(session, tutor, article_id)
    is_owner = current.id == tutor.user_id
    if not article.comments_enabled and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comments aren't enabled on this article.",
        )

    if not is_owner and not _engagement_gate_ok(
        session,
        article_id=article.id,
        user_id=current.id,
        dwell=payload.dwell_seconds,
        scroll=payload.scroll_percent,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Spend a little more time on the article before commenting.",
        )

    parent: ArticleComment | None = None
    if payload.parent_id is not None:
        parent = session.get(ArticleComment, payload.parent_id)
        if parent is None or parent.article_id != article.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent comment not found.",
            )
        # Don't allow nesting deeper than one level (replies to replies
        # collapse to a sibling reply of the top-level comment).
        if parent.parent_id is not None:
            payload.parent_id = parent.parent_id

    row = ArticleComment(
        article_id=article.id,
        author_user_id=current.id,
        parent_id=payload.parent_id,
        body_markdown=payload.body_markdown,
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    # Phase 4 — points per comment, deduped per comment id so deletes
    # + re-posts don't multiply the prize. Tutor self-replies don't get
    # points (would game the leaderboard for the tutor's own surface).
    if not is_owner:
        from ..services.engagement import record_activity

        record_activity(
            session,
            user=current,
            kind="comment_posted",
            article=article,
            dedupe_key=f"comment:{row.id}",
        )

    name, avatar = _author_blurb(current)
    return CommentRead(
        id=row.id,
        article_id=row.article_id,
        parent_id=row.parent_id,
        author_user_id=row.author_user_id,
        author_name=name,
        author_avatar_url=avatar,
        body_markdown=row.body_markdown,
        created_at=row.created_at,
        hidden=False,
        is_own=True,
        is_tutor_response=is_owner,
    )


@router.delete(
    "/{article_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_own_comment(
    article_id: int,
    comment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    article = _get_article(session, tutor, article_id)
    row = session.get(ArticleComment, comment_id)
    if row is None or row.article_id != article.id:
        raise HTTPException(status_code=404, detail="Comment not found.")
    if row.author_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comment.",
        )
    session.delete(row)
    session.commit()


@router.post("/{article_id}/comments/{comment_id}/hide", status_code=204)
def tutor_hide_comment(
    article_id: int,
    comment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Tutor-side moderation. Hides a comment without deleting the row
    (so it stays in audit). Idempotent."""
    article = _get_article(session, tutor, article_id)
    if current.id != tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the article's tutor can moderate.",
        )
    row = session.get(ArticleComment, comment_id)
    if row is None or row.article_id != article.id:
        raise HTTPException(status_code=404, detail="Comment not found.")
    if row.hidden_at is None:
        row.hidden_at = datetime.now(UTC)
        row.hidden_by_tutor = True
        session.add(row)
        session.commit()


@router.post("/{article_id}/comments/{comment_id}/unhide", status_code=204)
def tutor_unhide_comment(
    article_id: int,
    comment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Reverse a soft-hide."""
    article = _get_article(session, tutor, article_id)
    if current.id != tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the article's tutor can moderate.",
        )
    row = session.get(ArticleComment, comment_id)
    if row is None or row.article_id != article.id:
        raise HTTPException(status_code=404, detail="Comment not found.")
    if row.hidden_at is not None:
        row.hidden_at = None
        row.hidden_by_tutor = False
        session.add(row)
        session.commit()


# --- Ratings ----------------------------------------------------------


@router.get("/{article_id}/ratings", response_model=RatingRead)
def read_ratings_summary(
    article_id: int,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> RatingRead:
    article = _get_article(session, tutor, article_id)
    your_stars: int | None = None
    your_body: str | None = None
    if current is not None:
        mine = session.exec(
            select(ArticleRating).where(
                ArticleRating.article_id == article.id,
                ArticleRating.user_id == current.id,
            )
        ).first()
        if mine is not None:
            your_stars = mine.stars
            your_body = mine.body
    return RatingRead(
        avg=article.rating_avg,
        count=article.rating_count,
        your_stars=your_stars,
        your_body=your_body,
    )


@router.post("/{article_id}/rate", response_model=RatingRead)
def upsert_rating(
    article_id: int,
    payload: RatingUpsert,
    current: Annotated[User, Depends(get_current_user)],
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> RatingRead:
    article = _get_article(session, tutor, article_id)
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't rate your own article.",
        )
    if not _engagement_gate_ok(
        session,
        article_id=article.id,
        user_id=current.id,
        dwell=payload.dwell_seconds,
        scroll=payload.scroll_percent,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Spend a little more time on the article before rating.",
        )
    existing = session.exec(
        select(ArticleRating).where(
            ArticleRating.article_id == article.id,
            ArticleRating.user_id == current.id,
        )
    ).first()
    now = datetime.now(UTC)
    if existing is None:
        existing = ArticleRating(
            article_id=article.id,
            user_id=current.id,
            stars=payload.stars,
            body=payload.body,
            created_at=now,
            updated_at=now,
        )
    else:
        existing.stars = payload.stars
        existing.body = payload.body
        existing.updated_at = now
    session.add(existing)
    session.commit()
    _recompute_article_rating(session, article)
    session.commit()
    # Phase 4 — award points (deduped on (article, user, month) so a
    # rating change doesn't multiply the prize).
    from ..services.engagement import record_activity

    record_activity(
        session,
        user=current,
        kind="rating_left",
        article=article,
        dedupe_key=f"rating:{article.id}",
    )
    return RatingRead(
        avg=article.rating_avg,
        count=article.rating_count,
        your_stars=existing.stars,
        your_body=existing.body,
    )


@router.delete("/{article_id}/rate", response_model=RatingRead)
def delete_rating(
    article_id: int,
    current: Annotated[User, Depends(get_current_user)],
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> RatingRead:
    article = _get_article(session, tutor, article_id)
    existing = session.exec(
        select(ArticleRating).where(
            ArticleRating.article_id == article.id,
            ArticleRating.user_id == current.id,
        )
    ).first()
    if existing is not None:
        session.delete(existing)
        session.commit()
    _recompute_article_rating(session, article)
    session.commit()
    return RatingRead(
        avg=article.rating_avg, count=article.rating_count
    )
