"""Demo workspace lifecycle — seed + wipe.

When a user enters via /try, we mint the User row in the router and
then call `seed_workspace()` from a FastAPI BackgroundTask. The seed
is best-effort: any half-failure leaves the workspace incomplete but
usable, and the self-healing helpers below (`first_draft_article()`,
`primary_module()`) recover gracefully.

On `POST /demo/convert`, the router calls `wipe_workspace()` which
deletes only the rows we recorded in `User.demo_seed_ids_json`. The
user's own edits — any row whose `updated_at` differs from
`created_at` — are preserved by the wipe being explicit-id-only.

Phase 1 of the multi-phase plan ships TUTOR seed only. Creator + Student
seeds land in Phase 3.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from ..models import (
    Article,
    ArticleComment,
    ArticleRating,
    ArticleVisibility,
    Cohort,
    CohortSeat,
    LessonModule,
    LessonPack,
    Pledge,
    PledgeStatus,
    Project,
    ProjectStatus,
    TeacherFollower,
    Tutor,
    TutorAccountStatus,
    User,
)

log = logging.getLogger(__name__)

# Polished, self-referential showcase content. Real users edit these
# templates the moment they arrive — the tour's "tweak the title" step
# loads the seeded draft article.
TUTOR_SEED_BLUEPRINT = {
    "display_name": "Demo Tutor",
    "bio": (
        "I'm a Greek tutor with ten years of experience teaching adults. "
        "I write about idioms, accent work, and the little things textbooks "
        "skip. Try editing any of this — nothing goes live yet."
    ),
    "languages_taught": "Greek, English",
    "timezone": "UTC",
    "theme": "sage",
    "published_article": {
        "title": "Three idioms that make your Greek sound native",
        "summary": "Snippets you'll hear in any Athens café.",
        "body_markdown": (
            "# Three idioms that make your Greek sound native\n\n"
            "Native speakers slip these in without thinking. Memorise the literal "
            "meaning first, then the context. This is *your* article — edit it.\n\n"
            "## 1. *Πιάνει το νόημα*\n"
            "Literally \"catches the meaning\". Means \"gets it\". Used when "
            "someone finally clicks with an idea.\n\n"
            "## 2. *Δεν παίζεσαι*\n"
            "Literally \"you can't be played\". Means \"you're unstoppable\". "
            "Compliment after someone pulls off something impressive.\n\n"
            "## 3. *Πάμε γερά*\n"
            "Literally \"let's go strongly\". Means \"let's hit it\". A "
            "rallying cry before a meeting, a meal, a road trip."
        ),
    },
    "draft_article": {
        "title": "Why your verb endings keep eating themselves",
        "summary": "A draft you can edit during the tour.",
        "body_markdown": (
            "# Why your verb endings keep eating themselves\n\n"
            "Welcome — this is a draft article. The tour will ask you to "
            "tweak the title in a moment. Nothing goes live yet."
        ),
    },
    "module": {
        "title": "Greek alphabet boot camp",
        "summary": "Five sessions, fully written.",
        "description": "Self-paced — yours forever after purchase.",
        "price_cents": 1500,
    },
    "lesson_pack": {
        "name": "Single conversation lesson",
        "num_lessons": 1,
        "duration_minutes": 60,
        "price_cents": 2500,
        "currency": "eur",
        "description": "A 60-minute conversation lesson. Free 15-minute trial first.",
    },
}


def _slug_token() -> str:
    return secrets.token_hex(3)


def seed_workspace(session: Session, user: User) -> None:
    """Idempotent seed for the given user's demo role. Re-running is
    a no-op if already seeded (checked via `demo_workspace_seeded_at`).

    On failure, the function logs and returns without raising — entry
    must never block."""
    if user.demo_workspace_seeded_at is not None:
        return
    try:
        if user.demo_role == "tutor":
            _seed_tutor(session, user)
        elif user.demo_role == "student":
            _seed_student(session, user)
        user.demo_workspace_seeded_at = datetime.now(UTC)
        session.add(user)
        session.commit()
    except Exception:
        log.exception("demo seed failed for user_id=%s role=%s", user.id, user.demo_role)


def _seed_tutor(session: Session, user: User) -> None:
    """Tutor seed — 1 Tutor row + 2 articles + 1 module + 1 lesson pack."""
    bp = TUTOR_SEED_BLUEPRINT
    seeded: dict[str, list[int]] = {
        "tutor_id": [],
        "articles": [],
        "modules": [],
        "lesson_packs": [],
    }

    # Tutor row. Slug is random so concurrent demo entries don't collide.
    # `list_in_marketplace=False` keeps the per-visit demo trial tutor out
    # of the marketplace/discover surfaces — previously this used
    # `marketplace_listing_enabled=False` which is NOT a Tutor field, so
    # the kwarg was silently dropped and the model's default (True) kicked
    # in, leading to demo-trial tutors and their seeded modules surfacing
    # as duplicates on the demo site.
    tutor = Tutor(
        user_id=user.id,
        tutor_slug=f"demo-{_slug_token()}",
        display_name=bp["display_name"],
        bio=bp["bio"],
        languages_taught=bp["languages_taught"],
        theme=bp["theme"],
        account_status=TutorAccountStatus.ACTIVE,
        list_in_marketplace=False,
        cancellation_cutoff_hours=24,
    )
    session.add(tutor)
    session.commit()
    session.refresh(tutor)
    seeded["tutor_id"].append(tutor.id)

    # Bio + timezone on user
    if not user.bio:
        user.bio = bp["bio"]
    if not user.timezone:
        user.timezone = bp["timezone"]
    if not user.languages:
        user.languages = bp["languages_taught"]
    session.add(user)

    # Published article
    now = datetime.now(UTC)
    pub = bp["published_article"]
    pub_row = Article(
        tutor_id=tutor.id,
        author_user_id=user.id,
        slug=f"three-idioms-{_slug_token()}",
        title=pub["title"],
        summary=pub["summary"],
        body_markdown=pub["body_markdown"],
        visibility=ArticleVisibility.PUBLIC,
        is_published=True,
        published_at=now - timedelta(days=3),
    )
    session.add(pub_row)

    # Draft article (the one the tour step opens)
    drf = bp["draft_article"]
    drf_row = Article(
        tutor_id=tutor.id,
        author_user_id=user.id,
        slug=f"verb-endings-{_slug_token()}",
        title=drf["title"],
        summary=drf["summary"],
        body_markdown=drf["body_markdown"],
        visibility=ArticleVisibility.PUBLIC,
        is_published=False,
        published_at=None,
    )
    session.add(drf_row)
    session.commit()
    session.refresh(pub_row)
    session.refresh(drf_row)
    seeded["articles"].extend([pub_row.id, drf_row.id])

    # Module linking them
    mod = bp["module"]
    items = [
        {"kind": "article", "ref_id": pub_row.id, "preview": True},
        {"kind": "article", "ref_id": drf_row.id, "preview": False},
    ]
    mod_row = LessonModule(
        tutor_id=tutor.id,
        slug=f"greek-boot-camp-{_slug_token()}",
        title=mod["title"],
        summary=mod["summary"],
        description=mod["description"],
        items_json=json.dumps(items),
        price_cents=mod["price_cents"],
        currency="eur",
        is_published=True,
        published_at=now - timedelta(days=2),
    )
    session.add(mod_row)
    session.commit()
    session.refresh(mod_row)
    seeded["modules"].append(mod_row.id)

    # Lesson pack
    lp = bp["lesson_pack"]
    pack = LessonPack(
        tutor_id=tutor.id,
        name=lp["name"],
        description=lp["description"],
        num_lessons=lp["num_lessons"],
        duration_minutes=lp["duration_minutes"],
        price_cents=lp["price_cents"],
        currency=lp["currency"],
        is_active=True,
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    seeded["lesson_packs"].append(pack.id)

    # Stamp the seed manifest on the user so wipe can find it.
    user.demo_seed_ids_json = json.dumps(seeded)
    session.add(user)
    session.commit()


CREATOR_SEED_BLUEPRINT = {
    "funding_project": {
        "title": "Cooking with Yiayia — 10 episodes",
        "description": (
            "A short documentary series following a traditional Greek "
            "grandmother through ten recipes. Pre-launch funding. Backers "
            "get behind-the-scenes cuts and full transcripts."
        ),
        "language": "Greek",
        "level": "Intermediate",
        "funding_goal": 250000,    # €2,500 in cents
        "delivery_days": 60,
        "num_videos": 10,
        "price_per_video": 500,
    },
    "completed_project": {
        "title": "Walking tour of Plaka — captioned",
        "description": (
            "Already delivered. A 25-minute slow walking tour of the Plaka "
            "neighbourhood, captioned in Greek + English. Backers get the "
            "video plus a printable phrasebook."
        ),
        "language": "Greek",
        "level": "Beginner",
        "funding_goal": 80000,    # €800
        "current_funding": 92000,    # over-funded
        "delivery_days": 30,
    },
}


STUDENT_SEED_BLUEPRINT = {
    "rating": 5,
    "rating_comment": "Such a clear explanation — already using these in conversation.",
    "comment_body": "Loved this! The third one made me laugh.",
}


def _seed_creator(session: Session, user: User) -> None:
    """Creator seed — 1 FUNDING + 1 COMPLETED project with synthetic
    backers. Pledges use fake stripe ids so they never collide with
    real Connect payouts."""
    cp = CREATOR_SEED_BLUEPRINT
    seeded: dict[str, list[int]] = {
        "projects": [],
        "pledges": [],
    }
    now = datetime.now(UTC)

    # Active funding project
    funding = cp["funding_project"]
    fp = Project(
        title=funding["title"],
        description=funding["description"],
        language=funding["language"],
        level=funding["level"],
        funding_goal=funding["funding_goal"],
        current_funding=int(funding["funding_goal"] * 0.42),    # 42% of goal
        delivery_days=funding["delivery_days"],
        status=ProjectStatus.FUNDING,
        teacher_id=user.id,
        is_series=True,
        num_videos=funding["num_videos"],
        price_per_video=funding["price_per_video"],
    )
    session.add(fp)
    session.commit()
    session.refresh(fp)
    seeded["projects"].append(fp.id)

    # Synthetic backers — three pledges on the funding project.
    pledges: list[Pledge] = []
    for amount in (2500, 5000, 10000):
        p = Pledge(
            amount=amount,
            status=PledgeStatus.PENDING,
            checkout_session_id=f"demo_cs_{secrets.token_hex(8)}",
            payment_intent_id=f"demo_pi_{secrets.token_hex(8)}",
            user_id=user.id,
            project_id=fp.id,
        )
        session.add(p)
        pledges.append(p)
    session.commit()
    for p in pledges:
        session.refresh(p)
        seeded["pledges"].append(p.id)

    # Completed project
    completed = cp["completed_project"]
    cp_row = Project(
        title=completed["title"],
        description=completed["description"],
        language=completed["language"],
        level=completed["level"],
        funding_goal=completed["funding_goal"],
        current_funding=completed["current_funding"],
        delivery_days=completed["delivery_days"],
        status=ProjectStatus.COMPLETED,
        teacher_id=user.id,
        funded_at=now - timedelta(days=60),
        completed_at=now - timedelta(days=14),
    )
    session.add(cp_row)
    session.commit()
    session.refresh(cp_row)
    seeded["projects"].append(cp_row.id)

    user.demo_seed_ids_json = json.dumps(seeded)
    session.add(user)
    session.commit()


def _seed_student(session: Session, user: User) -> None:
    """Student seed — follow one tutor and leave one rating + comment on
    that tutor's most-recent public article. If no public tutor articles
    exist on the platform, the seed is a soft no-op (still marks the
    workspace seeded so we don't retry every entry)."""
    sb = STUDENT_SEED_BLUEPRINT
    seeded: dict[str, list[int]] = {
        "follower_pairs": [],
        "ratings": [],
        "comments": [],
    }

    # Find the most-recently-published public article from any tutor.
    article = session.exec(
        select(Article)
        .where(
            Article.is_published == True,    # noqa: E712
            Article.visibility == ArticleVisibility.PUBLIC,
        )
        .order_by(Article.published_at.desc())
    ).first()
    if article is None or article.tutor_id is None:
        user.demo_seed_ids_json = json.dumps(seeded)
        session.add(user)
        session.commit()
        return

    tutor = session.get(Tutor, article.tutor_id)
    if tutor is None or tutor.user_id is None:
        user.demo_seed_ids_json = json.dumps(seeded)
        session.add(user)
        session.commit()
        return

    # Follow the tutor (idempotent — primary key is the pair, so check
    # before insert).
    existing_follow = session.get(TeacherFollower, (tutor.user_id, user.id))
    if existing_follow is None:
        follow = TeacherFollower(teacher_id=tutor.user_id, student_id=user.id)
        session.add(follow)
        seeded["follower_pairs"].append([tutor.user_id, user.id])

    # Rating (stars + optional 280-char body)
    rating = ArticleRating(
        article_id=article.id,
        user_id=user.id,
        stars=sb["rating"],
        body=sb["rating_comment"],
    )
    session.add(rating)

    # Comment
    comment = ArticleComment(
        article_id=article.id,
        author_user_id=user.id,
        body_markdown=sb["comment_body"],
    )
    session.add(comment)

    session.commit()
    session.refresh(rating)
    session.refresh(comment)
    seeded["ratings"].append(rating.id)
    seeded["comments"].append(comment.id)

    user.demo_seed_ids_json = json.dumps(seeded)
    session.add(user)
    session.commit()


def wipe_workspace(session: Session, user: User) -> None:
    """Delete every row we seeded for this user. Caller has already
    confirmed conversion — the user's own creations are preserved."""
    try:
        manifest = json.loads(user.demo_seed_ids_json or "{}")
    except json.JSONDecodeError:
        manifest = {}
    if not isinstance(manifest, dict):
        return

    # Articles
    for aid in manifest.get("articles", []) or []:
        a = session.get(Article, aid)
        if a is not None:
            session.delete(a)

    # Modules
    for mid in manifest.get("modules", []) or []:
        m = session.get(LessonModule, mid)
        if m is not None:
            session.delete(m)

    # Lesson packs
    for pid in manifest.get("lesson_packs", []) or []:
        p = session.get(LessonPack, pid)
        if p is not None:
            session.delete(p)

    # Pledges before projects — Pledge has FK to Project.
    for pid in manifest.get("pledges", []) or []:
        p = session.get(Pledge, pid)
        if p is not None:
            session.delete(p)

    for pid in manifest.get("projects", []) or []:
        p = session.get(Project, pid)
        if p is not None:
            session.delete(p)

    # Student-side: ratings + comments + follower pairs.
    for rid in manifest.get("ratings", []) or []:
        r = session.get(ArticleRating, rid)
        if r is not None:
            session.delete(r)

    for cid in manifest.get("comments", []) or []:
        c = session.get(ArticleComment, cid)
        if c is not None:
            session.delete(c)

    for pair in manifest.get("follower_pairs", []) or []:
        if isinstance(pair, list) and len(pair) == 2:
            f = session.get(TeacherFollower, (pair[0], pair[1]))
            if f is not None:
                session.delete(f)

    # Cohort seats before cohorts — seats FK into cohort.
    for sid in manifest.get("cohort_seats", []) or []:
        s = session.get(CohortSeat, sid)
        if s is not None:
            session.delete(s)

    for cid in manifest.get("cohorts", []) or []:
        c = session.get(Cohort, cid)
        if c is not None:
            session.delete(c)

    # Don't delete the Tutor row on conversion — the tutor's site is
    # what they're keeping. Just clear the manifest.
    user.demo_seed_ids_json = "{}"
    session.add(user)
    session.commit()
