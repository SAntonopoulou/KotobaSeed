"""Engagement signals — record a point event in a group's leaderboard
and check if the user just earned a persistent SkillBadge.

The other endpoints (article read tracker, rating, comment, module
purchase webhook, lesson confirmed) call `record_activity()` after they
commit their own change. The helper looks up which language group(s)
the surface lives in (via the tutor's UserLanguageGroup links) and
writes one GroupActivityPoint per group, plus checks the badge ladder.

We split badge thresholds + point values per kind into small dicts at
the top of the file so non-engineer Sophia can tune them without
touching code logic.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlmodel import Session, func, select

from ..models import (
    Article,
    GroupActivityPoint,
    SkillBadge,
    Tutor,
    User,
    UserLanguageGroup,
)

# Points per event kind. Tune as we learn what drives quality engagement.
POINTS_BY_KIND: dict[str, int] = {
    "article_read":         1,
    "rating_left":          3,
    "comment_posted":       2,
    "thread_posted":        4,
    "thread_reply":         2,
    "module_purchased":     5,
    "lesson_completed":   10,
    "first_lesson_taken": 10,
}


# Badge ladder per kind. Each ladder step = (counter threshold, badge kind).
# When a user's lifetime count for `signal` crosses a threshold, they
# get the corresponding badge.
BADGE_LADDERS: dict[str, list[tuple[int, str]]] = {
    # Reader ladder — points are per-article-read events, lifetime.
    "article_read": [
        (1,   "first_article_read"),
        (10,  "reader_10"),
        (50,  "reader_50"),
        (200, "reader_200"),
    ],
    "module_purchased": [
        (1, "first_module"),
        (3, "module_3"),
        (10, "module_10"),
    ],
    "rating_left": [
        (1, "first_rating"),
        (25, "rating_25"),
    ],
    "lesson_completed": [
        (1, "first_lesson"),
        (10, "lesson_10"),
        (50, "lesson_50"),
    ],
    "thread_posted": [
        (1, "first_thread"),
        (10, "thread_10"),
    ],
}


def _year_month(now: datetime | None = None) -> str:
    return (now or datetime.now(UTC)).strftime("%Y-%m")


def _groups_for_tutor(session: Session, tutor_id: int | None) -> list[int]:
    """Look up which LanguageGroup(s) a tutor teaches (via
    UserLanguageGroup). Used to attribute activity to the right
    leaderboard buckets."""
    if tutor_id is None:
        return []
    tutor = session.get(Tutor, tutor_id)
    if tutor is None:
        return []
    rows = session.exec(
        select(UserLanguageGroup.group_id).where(
            UserLanguageGroup.user_id == tutor.user_id
        )
    ).all()
    return [int(r) for r in rows]


def _groups_for_article(session: Session, article: Article) -> list[int]:
    return _groups_for_tutor(session, article.tutor_id)


def record_activity(
    session: Session,
    *,
    user: User,
    kind: str,
    article: Article | None = None,
    tutor_id: int | None = None,
    group_ids: Iterable[int] | None = None,
    dedupe_key: str | None = None,
) -> None:
    """Append point events + check badge thresholds. Idempotent on
    dedupe_key within the same month.

    Caller passes either `article`, `tutor_id`, or `group_ids` to
    identify which language group(s) to attribute. If none yield a
    group, the activity is dropped silently — we don't want orphans in
    the leaderboard.
    """
    points = POINTS_BY_KIND.get(kind, 0)
    if points <= 0:
        # Unknown kind — record nothing.
        return

    bucket = _year_month()
    if group_ids is None:
        if article is not None:
            group_ids = _groups_for_article(session, article)
        else:
            group_ids = _groups_for_tutor(session, tutor_id)
    group_ids = list(group_ids or [])
    if not group_ids:
        return

    for group_id in group_ids:
        if dedupe_key is not None:
            already = session.exec(
                select(GroupActivityPoint).where(
                    GroupActivityPoint.group_id == group_id,
                    GroupActivityPoint.user_id == user.id,
                    GroupActivityPoint.kind == kind,
                    GroupActivityPoint.year_month == bucket,
                    GroupActivityPoint.dedupe_key == dedupe_key,
                )
            ).first()
            if already is not None:
                continue
        session.add(
            GroupActivityPoint(
                group_id=group_id,
                user_id=user.id,
                kind=kind,
                points=points,
                year_month=bucket,
                dedupe_key=dedupe_key,
            )
        )
    session.commit()

    _maybe_grant_badges(session, user=user, kind=kind, group_ids=group_ids)


def _maybe_grant_badges(
    session: Session,
    *,
    user: User,
    kind: str,
    group_ids: list[int],
) -> None:
    ladder = BADGE_LADDERS.get(kind)
    if not ladder:
        return
    # Lifetime count of this kind across all groups for this user.
    lifetime = int(
        session.exec(
            select(func.count(GroupActivityPoint.id)).where(
                GroupActivityPoint.user_id == user.id,
                GroupActivityPoint.kind == kind,
            )
        ).one()
        or 0
    )
    for threshold, badge_kind in ladder:
        if lifetime < threshold:
            continue
        # Group-scoped badges if there's a single group, else global (NULL).
        group_id = group_ids[0] if len(group_ids) == 1 else None
        existing = session.exec(
            select(SkillBadge).where(
                SkillBadge.user_id == user.id,
                SkillBadge.kind == badge_kind,
                SkillBadge.group_id == group_id,
            )
        ).first()
        if existing is not None:
            continue
        session.add(
            SkillBadge(
                user_id=user.id,
                kind=badge_kind,
                group_id=group_id,
                counter=lifetime,
            )
        )
    session.commit()


def leaderboard_for_group(
    session: Session,
    *,
    group_id: int,
    year_month: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Sum points per user for the year_month bucket. Returns top N
    rows shaped as {user_id, name, avatar_url, points, badge_count}."""
    bucket = year_month or _year_month()
    rows = session.exec(
        select(
            GroupActivityPoint.user_id,
            func.sum(GroupActivityPoint.points).label("points"),
        )
        .where(
            GroupActivityPoint.group_id == group_id,
            GroupActivityPoint.year_month == bucket,
        )
        .group_by(GroupActivityPoint.user_id)
        .order_by(func.sum(GroupActivityPoint.points).desc())
        .limit(limit)
    ).all()
    if not rows:
        return []
    user_ids = [int(r[0]) for r in rows]
    users = {
        u.id: u
        for u in session.exec(select(User).where(User.id.in_(user_ids))).all()
    }
    # Badge counts (group-specific OR global) for the leaderboard preview.
    badge_counts: dict[int, int] = {}
    for uid in user_ids:
        c = int(
            session.exec(
                select(func.count(SkillBadge.id)).where(
                    SkillBadge.user_id == uid
                )
            ).one()
            or 0
        )
        badge_counts[uid] = c

    out: list[dict] = []
    for user_id, pts in rows:
        u = users.get(int(user_id))
        out.append(
            {
                "user_id": int(user_id),
                "name": u.full_name if u else "Member",
                "avatar_url": u.avatar_url if u else None,
                "points": int(pts or 0),
                "badge_count": badge_counts.get(int(user_id), 0),
            }
        )
    return out


def badges_for_user(
    session: Session, *, user_id: int, group_id: int | None = None
) -> list[dict]:
    """Returns the user's earned badges. If group_id is supplied,
    filters to badges in that group OR global. Otherwise all badges."""
    q = select(SkillBadge).where(SkillBadge.user_id == user_id)
    if group_id is not None:
        q = q.where(
            (SkillBadge.group_id == group_id) | (SkillBadge.group_id.is_(None))
        )
    rows = session.exec(q.order_by(SkillBadge.earned_at.desc())).all()
    return [
        {
            "kind": b.kind,
            "group_id": b.group_id,
            "earned_at": b.earned_at.isoformat()
            if b.earned_at
            else None,
            "counter": b.counter,
        }
        for b in rows
    ]
