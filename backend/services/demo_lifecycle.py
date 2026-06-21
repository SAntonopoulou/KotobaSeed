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
    Booking,
    BookingStatus,
    Cohort,
    CohortSeat,
    HomeworkTemplate,
    LessonModule,
    LessonPack,
    ModulePurchase,
    Pledge,
    PledgeStatus,
    Project,
    ProjectStatus,
    TeacherFollower,
    Testimonial,
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
    # Three published articles + one draft, so the dashboard's content tab
    # already shows volume rather than a single starter post.
    "published_articles": [
        {
            "title": "Three idioms that make your Greek sound native",
            "summary": "Snippets you'll hear in any Athens café.",
            "days_ago": 3,
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
        {
            "title": "Stop translating in your head — start hearing in Greek",
            "summary": "The shadowing drill I use with every new student.",
            "days_ago": 11,
            "body_markdown": (
                "# Stop translating in your head — start hearing in Greek\n\n"
                "Most students get stuck because they're decoding word-by-word. "
                "Here's the 12-minute shadowing drill that fixes that — works for "
                "any level past A1.\n\n"
                "## What you need\n"
                "- A short clip (60-90s) of natural Greek\n"
                "- A quiet room\n"
                "- Three repetitions, no more\n\n"
                "## The drill\n"
                "1. Listen once, eyes closed, don't try to understand. Just absorb the rhythm.\n"
                "2. Listen again, this time mouthing along — half a beat behind.\n"
                "3. Speak it out loud at full volume on the third pass.\n\n"
                "Twelve minutes a day. Two weeks. You'll feel it."
            ),
        },
        {
            "title": "How I teach the Greek alphabet in 90 minutes",
            "summary": "Letter-by-letter pairing with English sounds. Free to copy.",
            "days_ago": 21,
            "body_markdown": (
                "# How I teach the Greek alphabet in 90 minutes\n\n"
                "I used to spend three lessons on the alphabet. Now I do it in one "
                "90-minute session. The trick: pair every Greek letter with a "
                "specific English-word sound so the student is *remembering*, not "
                "memorising.\n\n"
                "## The session structure\n"
                "- Minutes 0-15 — vowels only, with mirror work\n"
                "- Minutes 15-45 — the easy consonants (β γ δ ζ θ κ λ μ ν π ρ σ τ φ χ)\n"
                "- Minutes 45-65 — the trap consonants (ξ ψ ς)\n"
                "- Minutes 65-90 — read three lines of café signage\n\n"
                "By the end they can read their first menu. That's the moment "
                "they keep coming back."
            ),
        },
    ],
    "draft_article": {
        "title": "Why your verb endings keep eating themselves",
        "summary": "A draft you can edit during the tour.",
        "body_markdown": (
            "# Why your verb endings keep eating themselves\n\n"
            "Welcome — this is a draft article. The tour will ask you to "
            "tweak the title in a moment. Nothing goes live yet."
        ),
    },
    # Two modules with different price points so the dashboard shows
    # revenue across both a £15 entry-level pack and a £45 deep-dive.
    "modules": [
        {
            "title": "Greek alphabet boot camp",
            "summary": "Five sessions, fully written + audio.",
            "description": "Self-paced — yours forever after purchase.",
            "price_cents": 1500,
            "days_ago": 35,
            "n_purchases": 8,
        },
        {
            "title": "Idioms unlocked — sound like a local in 4 weeks",
            "summary": "30 idioms, audio drills, end-of-week recap calls.",
            "description": "Four-week guided programme. Includes group review calls.",
            "price_cents": 4500,
            "days_ago": 14,
            "n_purchases": 6,
        },
    ],
    # Two lesson packs — a trial + a paid single. Most demo tutors sell the
    # single; the trial conversion data is what gets shown in onboarding.
    "lesson_packs": [
        {
            "name": "15-minute trial",
            "num_lessons": 1,
            "duration_minutes": 15,
            "price_cents": 0,
            "currency": "eur",
            "description": "Free intro. See if we click.",
        },
        {
            "name": "Single conversation lesson",
            "num_lessons": 1,
            "duration_minutes": 60,
            "price_cents": 2500,
            "currency": "eur",
            "description": "A 60-minute conversation lesson. Free 15-minute trial first.",
        },
    ],
    # Three demo students — appear in the schedule + lesson plans + testimonials.
    # First names + last-initial keeps them recognisable without feeling fake.
    "students": [
        {
            "name": "Marina K.",
            "email_local": "marina-k",
            "level": "B1",
            "note": "Heritage speaker, wants to read modern Greek novels.",
        },
        {
            "name": "Daniel R.",
            "email_local": "daniel-r",
            "level": "A2",
            "note": "Moving to Athens in September for work. Conversational focus.",
        },
        {
            "name": "Hannah W.",
            "email_local": "hannah-w",
            "level": "A1",
            "note": "Started two months ago. Loves the alphabet boot camp.",
        },
    ],
    # 7 bookings spread across the coming two weeks so the dashboard
    # "Upcoming lessons" widget fills up. Days/hours are RELATIVE to now
    # at seed time so they always look upcoming, never historical.
    "bookings": [
        {"student_idx": 0, "days_ahead": 1, "hour": 17, "pack_idx": 1},
        {"student_idx": 1, "days_ahead": 1, "hour": 19, "pack_idx": 1},
        {"student_idx": 2, "days_ahead": 2, "hour": 16, "pack_idx": 1},
        {"student_idx": 0, "days_ahead": 4, "hour": 17, "pack_idx": 1},
        {"student_idx": 1, "days_ahead": 5, "hour": 19, "pack_idx": 1},
        {"student_idx": 2, "days_ahead": 8, "hour": 16, "pack_idx": 1},
        {"student_idx": 0, "days_ahead": 11, "hour": 17, "pack_idx": 1},
    ],
    # Testimonials shown on the public site — social proof out of the gate.
    "testimonials": [
        {
            "student_name": "Marina K.",
            "body": (
                "Six months in and I can finally read my grandmother's letters. "
                "Lessons are calm and structured, never a wall of grammar."
            ),
            "stars": 5,
            "display_order": 1,
        },
        {
            "student_name": "Daniel R.",
            "body": (
                "I've had three Greek tutors before. This is the first time the "
                "lessons feel built around my actual goals."
            ),
            "stars": 5,
            "display_order": 2,
        },
        {
            "student_name": "Hannah W.",
            "body": (
                "Best money I've spent on language learning. The homework "
                "templates make practising between lessons painless."
            ),
            "stars": 5,
            "display_order": 3,
        },
    ],
    # One reusable homework template — the kind they'd use after every
    # lesson. Auto-assigned so the demo dashboard's homework tab is alive.
    "homework_template": {
        "title": "Five sentences using today's idioms",
        "description": "Write five short sentences that use the idioms we covered. Audio reply welcome.",
        "questions": [
            {
                "type": "free_text",
                "prompt": "Write five sentences using the idioms from today's lesson. They can be silly — just make them feel natural.",
            },
            {
                "type": "free_text",
                "prompt": "Which idiom felt hardest to use? Why?",
            },
        ],
        "auto_assign_on_lesson_complete": True,
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
    """Tutor seed — a richer pre-built sandbox so a prospect lands on a
    dashboard that already feels like a real tutor's business.

    Creates: 1 Tutor + 3 published articles + 1 draft + 2 modules + 2
    lesson packs + 3 demo students + 7 upcoming bookings + 1 homework
    template + 3 testimonials + ~14 mock module purchases (revenue).
    All IDs are tracked in the seed manifest so the janitor's recursive
    FK cascade catches everything; mock-student User rows are explicitly
    listed so wipe_workspace can drop them.
    """
    bp = TUTOR_SEED_BLUEPRINT
    seeded: dict[str, list[int]] = {
        "tutor_id": [],
        "articles": [],
        "modules": [],
        "lesson_packs": [],
        "student_user_ids": [],
        "bookings": [],
        "module_purchases": [],
        "homework_templates": [],
        "testimonials": [],
    }
    now = datetime.now(UTC)

    # --- Tutor row -----------------------------------------------------
    # Slug is random so concurrent demo entries don't collide.
    # `list_in_marketplace=False` keeps the per-visit demo trial tutor
    # out of the marketplace/discover surfaces; the demo's own dashboard
    # shows everything regardless of this flag.
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

    # --- Published articles -------------------------------------------
    pub_rows: list[Article] = []
    for art in bp["published_articles"]:
        row = Article(
            tutor_id=tutor.id,
            author_user_id=user.id,
            slug=f"{_slugify(art['title'])}-{_slug_token()}",
            title=art["title"],
            summary=art["summary"],
            body_markdown=art["body_markdown"],
            visibility=ArticleVisibility.PUBLIC,
            is_published=True,
            published_at=now - timedelta(days=art["days_ago"]),
        )
        session.add(row)
        pub_rows.append(row)

    # --- Draft article (tour edits its title) -------------------------
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
    for row in pub_rows:
        session.refresh(row)
    session.refresh(drf_row)
    seeded["articles"].extend([r.id for r in pub_rows] + [drf_row.id])

    # --- Modules (link to published articles) -------------------------
    mod_rows: list[LessonModule] = []
    for mb in bp["modules"]:
        # Each module includes 2 articles: first as preview, second gated.
        picks = pub_rows[: 2] if len(pub_rows) >= 2 else pub_rows
        items = [
            {"kind": "article", "ref_id": picks[0].id, "preview": True},
        ]
        if len(picks) > 1:
            items.append(
                {"kind": "article", "ref_id": picks[1].id, "preview": False}
            )
        row = LessonModule(
            tutor_id=tutor.id,
            slug=f"{_slugify(mb['title'])}-{_slug_token()}",
            title=mb["title"],
            summary=mb["summary"],
            description=mb["description"],
            items_json=json.dumps(items),
            price_cents=mb["price_cents"],
            currency="eur",
            is_published=True,
            published_at=now - timedelta(days=mb["days_ago"]),
        )
        session.add(row)
        mod_rows.append(row)
    session.commit()
    for row in mod_rows:
        session.refresh(row)
    seeded["modules"].extend([r.id for r in mod_rows])

    # --- Lesson packs --------------------------------------------------
    pack_rows: list[LessonPack] = []
    for lp in bp["lesson_packs"]:
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
        pack_rows.append(pack)
    session.commit()
    for pack in pack_rows:
        session.refresh(pack)
    seeded["lesson_packs"].extend([p.id for p in pack_rows])

    # --- Mock demo students -------------------------------------------
    # Mark is_demo_account=True so the demo-isolation filter on prod
    # never surfaces them (prod hides demo content; staging shows it).
    # Stamping demo_workspace_seeded_at to NOW means the janitor's
    # retention check (created_at < cutoff) doesn't pull them until they
    # age into the soft-deleted pool via the parent's wipe.
    student_users: list[User] = []
    for idx, st in enumerate(bp["students"]):
        stu = User(
            email=f"{st['email_local']}-{tutor.tutor_slug}@demo.kotobaseed.local",
            full_name=st["name"],
            bio=st["note"],
            languages=bp["languages_taught"].split(",")[0].strip(),
            timezone=bp["timezone"],
            hashed_password="",
            is_demo_account=True,
            demo_role="student",
            demo_workspace_seeded_at=now,
            is_active=True,
            email_verified_at=now,
        )
        session.add(stu)
        student_users.append(stu)
    session.commit()
    for stu in student_users:
        session.refresh(stu)
    seeded["student_user_ids"].extend([s.id for s in student_users])

    # --- Bookings (CONFIRMED, upcoming) -------------------------------
    paid_pack = (
        pack_rows[1] if len(pack_rows) > 1 else pack_rows[0]
    )
    booking_rows: list[Booking] = []
    for bk in bp["bookings"]:
        if bk["student_idx"] >= len(student_users):
            continue
        scheduled_at = (
            now.replace(microsecond=0, second=0, minute=0)
            + timedelta(days=bk["days_ahead"])
        ).replace(hour=bk["hour"])
        row = Booking(
            tutor_id=tutor.id,
            student_user_id=student_users[bk["student_idx"]].id,
            lesson_pack_id=paid_pack.id,
            scheduled_at=scheduled_at,
            duration_minutes=paid_pack.duration_minutes,
            price_cents=paid_pack.price_cents,
            currency=paid_pack.currency,
            status=BookingStatus.CONFIRMED,
        )
        session.add(row)
        booking_rows.append(row)
    session.commit()
    for row in booking_rows:
        session.refresh(row)
    seeded["bookings"].extend([r.id for r in booking_rows])

    # --- Module purchases (mock revenue) ------------------------------
    # Spread purchases across students with a round-robin so the
    # dashboard's per-student revenue chart is non-trivial.
    purchase_rows: list[ModulePurchase] = []
    for mb_blueprint, mod_row in zip(bp["modules"], mod_rows):
        n = int(mb_blueprint.get("n_purchases", 0))
        for buy_idx in range(n):
            buyer = student_users[buy_idx % len(student_users)]
            # Composite-unique on (module_id, student_user_id) — skip
            # collisions silently rather than raise.
            existing = session.exec(
                select(ModulePurchase).where(
                    ModulePurchase.module_id == mod_row.id,
                    ModulePurchase.student_user_id == buyer.id,
                )
            ).first()
            if existing is not None:
                continue
            row = ModulePurchase(
                module_id=mod_row.id,
                tutor_id=tutor.id,
                student_user_id=buyer.id,
                amount_cents=mod_row.price_cents,
                currency=mod_row.currency,
            )
            session.add(row)
            purchase_rows.append(row)
    session.commit()
    for row in purchase_rows:
        session.refresh(row)
    seeded["module_purchases"].extend([r.id for r in purchase_rows])

    # --- Homework template --------------------------------------------
    ht_bp = bp["homework_template"]
    hw = HomeworkTemplate(
        tutor_id=tutor.id,
        title=ht_bp["title"],
        description=ht_bp["description"],
        questions_json=json.dumps(ht_bp["questions"]),
        auto_assign_on_lesson_complete=ht_bp[
            "auto_assign_on_lesson_complete"
        ],
        is_active=True,
    )
    session.add(hw)
    session.commit()
    session.refresh(hw)
    seeded["homework_templates"].append(hw.id)

    # --- Testimonials -------------------------------------------------
    test_rows: list[Testimonial] = []
    for ts in bp["testimonials"]:
        row = Testimonial(
            tutor_id=tutor.id,
            student_name=ts["student_name"],
            body=ts["body"],
            stars=ts["stars"],
            display_order=ts["display_order"],
        )
        session.add(row)
        test_rows.append(row)
    session.commit()
    for row in test_rows:
        session.refresh(row)
    seeded["testimonials"].extend([r.id for r in test_rows])

    # Stamp the seed manifest on the user so wipe can find it.
    user.demo_seed_ids_json = json.dumps(seeded)
    session.add(user)
    session.commit()


def _slugify(title: str) -> str:
    """Compact, ASCII-only slug fragment for seed-content slugs.
    Random `_slug_token()` is appended outside this helper to guarantee
    uniqueness across concurrent demo seeds."""
    import re
    s = title.lower()
    s = re.sub(r"[^a-z0-9\s-]+", "", s)
    s = re.sub(r"[\s-]+", "-", s).strip("-")
    return s[:40] or "untitled"


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

    # Module purchases (mock revenue) — FK to module + student. Delete
    # before the modules go (the recursive janitor cascade catches them
    # via tutor anyway, but during a conversion wipe we don't drop the
    # tutor, so explicit cleanup is needed).
    from ..models import Booking, HomeworkTemplate, ModulePurchase, Testimonial
    for pid in manifest.get("module_purchases", []) or []:
        row = session.get(ModulePurchase, pid)
        if row is not None:
            session.delete(row)

    # Bookings — mock upcoming lessons that referenced demo students.
    for bid in manifest.get("bookings", []) or []:
        row = session.get(Booking, bid)
        if row is not None:
            session.delete(row)

    # Homework templates seeded for showcase.
    for hid in manifest.get("homework_templates", []) or []:
        row = session.get(HomeworkTemplate, hid)
        if row is not None:
            session.delete(row)

    # Testimonials shown on the public site.
    for tid in manifest.get("testimonials", []) or []:
        row = session.get(Testimonial, tid)
        if row is not None:
            session.delete(row)

    # Mock demo students — these are independent User rows we created so
    # the dashboard had real names to show. Delete AFTER their bookings
    # + purchases above so FK constraints don't block. The recursive
    # janitor cascade on user.id sweeps anything we missed (lesson plans,
    # comments, ratings) without us listing them here.
    for uid in manifest.get("student_user_ids", []) or []:
        stu = session.get(User, uid)
        if stu is not None:
            session.delete(stu)

    session.commit()

    # Don't delete the Tutor row on conversion — the tutor's site is
    # what they're keeping. Just clear the manifest.
    user.demo_seed_ids_json = "{}"
    session.add(user)
    session.commit()
