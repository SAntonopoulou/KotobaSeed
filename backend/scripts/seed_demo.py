"""Seed the demo / staging DB with a believable cross-section of data.

Run as:
    docker compose exec backend python -m backend.scripts.seed_demo

What it creates:
    - 6 tutors (varied languages, themes, lesson packs, availability)
    - 15 students with varied profiles
    - ~30 bookings across the lifecycle (CONFIRMED, COMPLETED, NO_SHOW,
      PENDING_PAYMENT, REFUNDED) with reviews on completed lessons
    - 4 sample marketplace projects in various states
    - A handful of articles per tutor
    - Sample conversation threads — including a marketplace thread with
      an OFFER, a direct-DM with the trial-intro gate, and an archived
      one
    - A maintenance window scheduled 7 days out, so the demo shows our
      banner + scheduling UX

The script is **idempotent on first run only**. If it detects any of
its sentinel emails already exist (`*@kotobaseed-demo.example`), it
refuses to run so re-running on a populated DB doesn't double up.

The intent is the live demo at demo.kotobaseed.net — visitors browse
a populated platform and get a real feel for what they're signing up
for. Daily.co video isn't wired on staging (we'd embed a recorded
video on the site instead), so the classroom buttons exist but go to
a placeholder.
"""

from __future__ import annotations

import random
import sys
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from backend.database import engine
from backend.models import (
    Article,
    ArticleVisibility,
    Booking,
    BookingStatus,
    Conversation,
    ConversationStatus,
    GroupSession,
    LessonModule,
    LessonPack,
    Message,
    MessageType,
    ModulePurchase,
    PlacementTest,
    Pledge,
    PledgeStatus,
    Project,
    ProjectStatus,
    RecurringBookingPlan,
    Request,
    RequestStatus,
    SubscriptionTier,
    Testimonial,
    Tutor,
    TutorAccountStatus,
    TutorAvailability,
    TutorPlan,
    User,
    UserRole,
)
from backend.security import hash_password

# Deterministic RNG so re-runs produce the same demo data (if we ever
# allow re-running).
RNG = random.Random(20260607)


def _seed_sentinel(session: Session) -> bool:
    """True if our sentinel email already exists — abort to avoid double-seed."""
    existing = session.exec(
        select(User).where(User.email == "vasso@kotobaseed-demo.example")
    ).first()
    return existing is not None


# Curated demo tutor cohort. Names, themes, languages chosen to look
# real to a visiting tutor browsing for inspiration. Bios are short and
# specific.
TUTORS = [
    {
        "slug": "vasso",
        "display_name": "Vasso",
        "full_name": "Vasso Antonopoulou",
        "email": "vasso@kotobaseed-demo.example",
        "languages": "Greek, English",
        "bio": "Modern Greek tutor based in Athens. Conversational focus, A1–C1.",
        "theme": "aegean",
        "tier": "pro",
        "pack_minutes": [30, 60, 90],
        "trial_minutes": 20,
    },
    {
        "slug": "akiko",
        "display_name": "Akiko",
        "full_name": "Akiko Sato",
        "email": "akiko@kotobaseed-demo.example",
        "languages": "Japanese, English",
        "bio": "Japanese tutor, JLPT-aligned curriculum. N5 through N2.",
        "theme": "sakura",
        "tier": "business",
        "pack_minutes": [25, 50],
        "trial_minutes": 15,
    },
    {
        "slug": "maria",
        "display_name": "María",
        "full_name": "María Fernández",
        "email": "maria@kotobaseed-demo.example",
        "languages": "Spanish, Portuguese",
        "bio": "Native Madrileña. Latin American Spanish on request.",
        "theme": "sage",
        "tier": "plus",
        "pack_minutes": [45, 60],
        "trial_minutes": 30,
    },
    {
        "slug": "lucas",
        "display_name": "Lucas",
        "full_name": "Lucas Martin",
        "email": "lucas@kotobaseed-demo.example",
        "languages": "French",
        "bio": "Conversational French — DELF/DALF prep available.",
        "theme": "midnight",
        "tier": "free",
        "pack_minutes": [60],
        "trial_minutes": 0,
    },
    {
        "slug": "amelia",
        "display_name": "Amelia",
        "full_name": "Amelia Hughes",
        "email": "amelia@kotobaseed-demo.example",
        "languages": "English",
        "bio": "British English tutor — business communication + accent work.",
        "theme": "sage",
        "tier": "pro",
        "pack_minutes": [30, 60],
        "trial_minutes": 15,
    },
    {
        "slug": "felix",
        "display_name": "Felix",
        "full_name": "Felix Becker",
        "email": "felix@kotobaseed-demo.example",
        "languages": "German",
        "bio": "Berlin-based. Goethe-Institut A2–B2 exam coaching.",
        "theme": "midnight",
        "tier": "plus",
        "pack_minutes": [45, 90],
        "trial_minutes": 20,
    },
]


STUDENTS = [
    ("alex", "Alex Park", "alex@kotobaseed-demo.example"),
    ("priya", "Priya Iyer", "priya@kotobaseed-demo.example"),
    ("mateo", "Mateo Rossi", "mateo@kotobaseed-demo.example"),
    ("noa", "Noa Cohen", "noa@kotobaseed-demo.example"),
    ("simo", "Simon Tremblay", "simo@kotobaseed-demo.example"),
    ("rinka", "Rinka Yamada", "rinka@kotobaseed-demo.example"),
    ("emma", "Emma Janssen", "emma@kotobaseed-demo.example"),
    ("kim", "Kim Joon", "kim@kotobaseed-demo.example"),
    ("teresa", "Teresa Silva", "teresa@kotobaseed-demo.example"),
    ("dimitri", "Dimitri Petrov", "dimitri@kotobaseed-demo.example"),
    ("yuki", "Yuki Tanaka", "yuki@kotobaseed-demo.example"),
    ("hannah", "Hannah Schmidt", "hannah@kotobaseed-demo.example"),
    ("zoe", "Zoe Williams", "zoe@kotobaseed-demo.example"),
    ("rafa", "Rafa Garcia", "rafa@kotobaseed-demo.example"),
    ("nia", "Nia Okafor", "nia@kotobaseed-demo.example"),
]


def _create_users(session: Session) -> tuple[list[User], list[User]]:
    """Return (tutor_users, student_users)."""
    tutors: list[User] = []
    students: list[User] = []
    pw = hash_password("demo-password")
    now = datetime.now(UTC)
    for t in TUTORS:
        u = User(
            email=t["email"],
            hashed_password=pw,
            full_name=t["full_name"],
            role=UserRole.TUTOR,
            languages=t["languages"],
            bio=t["bio"],
            subscription_tier=SubscriptionTier(t["tier"]),
            email_verified_at=now,
            gdpr_consent_at=now,
            timezone="Europe/Athens",
            created_at=now - timedelta(days=RNG.randint(30, 365)),
        )
        session.add(u)
        tutors.append(u)
    for _slug, name, email in STUDENTS:
        u = User(
            email=email,
            hashed_password=pw,
            full_name=name,
            role=UserRole.STUDENT,
            email_verified_at=now,
            gdpr_consent_at=now,
            timezone="Europe/Athens",
            created_at=now - timedelta(days=RNG.randint(5, 200)),
        )
        session.add(u)
        students.append(u)
    session.commit()
    for u in tutors + students:
        session.refresh(u)
    return tutors, students


def _create_tutors(session: Session, tutor_users: list[User]) -> list[Tutor]:
    out: list[Tutor] = []
    datetime.now(UTC)
    for user, defn in zip(tutor_users, TUTORS, strict=False):
        # TutorPlan is just STARTER/PRO — the granular FREE/PLUS/PRO/
        # BUSINESS live on User.subscription_tier (already set above).
        # Tutors on the paid tutoring tiers (Plus/Pro/Business) all get
        # the PRO billing model (flat fee, 0% application fee); only
        # FREE-tier sits on STARTER.
        plan = TutorPlan.STARTER if defn["tier"] == "free" else TutorPlan.PRO
        t = Tutor(
            user_id=user.id,
            tutor_slug=defn["slug"],
            display_name=defn["display_name"],
            plan=plan,
            account_status=TutorAccountStatus.ACTIVE,
            stripe_connect_account_id=f"acct_demo_{defn['slug']}",
            list_in_marketplace=True,
            theme=defn["theme"],
            offers_free_trial=defn["trial_minutes"] > 0,
            free_trial_minutes=defn["trial_minutes"] or 15,
            free_trial_limit_per_student=1,
            cancellation_cutoff_hours=48,
            min_booking_lead_minutes=120,
            created_at=user.created_at,
        )
        session.add(t)
        out.append(t)
    session.commit()
    for t in out:
        session.refresh(t)
    # Availability: open Mon–Fri 09:00–18:00 plus Sat morning. Trial-
    # eligible on the Sat morning slot only.
    for t in out:
        for weekday in range(5):  # Mon–Fri
            session.add(TutorAvailability(
                tutor_id=t.id, weekday=weekday,
                start_minute=9 * 60, end_minute=18 * 60,
                allow_trial=False,
            ))
        session.add(TutorAvailability(
            tutor_id=t.id, weekday=5,
            start_minute=9 * 60, end_minute=13 * 60,
            allow_trial=True,
        ))
    session.commit()
    return out


def _create_lesson_packs(session: Session, tutors: list[Tutor]) -> list[LessonPack]:
    packs: list[LessonPack] = []
    for tutor, defn in zip(tutors, TUTORS, strict=False):
        # Trial pack (hidden from price list, used by trial book endpoint)
        if defn["trial_minutes"] > 0:
            session.add(LessonPack(
                tutor_id=tutor.id,
                name=f"{defn['trial_minutes']}-minute free trial",
                description="First lesson, get to know each other.",
                num_lessons=1,
                duration_minutes=defn["trial_minutes"],
                price_cents=0,
                currency="eur",
                is_active=True,
                is_trial=True,
            ))
        # Regular packs at different durations
        for mins in defn["pack_minutes"]:
            # Pricing: ~€0.40 per minute for entry, scaling down with length
            base = int(mins * 40 - (mins - 30) * 2)
            session.add(LessonPack(
                tutor_id=tutor.id,
                name=f"{mins}-minute lesson",
                description=f"Single {mins}-minute lesson — book a slot below.",
                num_lessons=1,
                duration_minutes=mins,
                price_cents=base,
                currency="eur",
                is_active=True,
            ))
            packs.append(session.exec(
                select(LessonPack)
                .where(LessonPack.tutor_id == tutor.id, LessonPack.duration_minutes == mins, LessonPack.is_trial == False)
            ).first() or packs[-1])
    session.commit()
    return packs


def _create_bookings(
    session: Session,
    tutors: list[Tutor],
    students: list[User],
) -> None:
    """30-ish bookings across the lifecycle for a realistic dashboard."""
    now = datetime.now(UTC)
    for _i in range(35):
        tutor = RNG.choice(tutors)
        student = RNG.choice(students)
        if tutor.user_id == student.id:
            continue
        # Pick a random non-trial pack
        pack = session.exec(
            select(LessonPack).where(
                LessonPack.tutor_id == tutor.id,
                LessonPack.is_trial == False,
                LessonPack.is_active == True,
            )
        ).first()
        if pack is None:
            continue
        # Distribute across the past 30d, today, and the next 30d
        offset_days = RNG.randint(-30, 30)
        scheduled = now + timedelta(days=offset_days, hours=RNG.choice([9, 10, 11, 14, 15, 16]))
        status = _pick_booking_status(offset_days)
        b = Booking(
            tutor_id=tutor.id,
            student_user_id=student.id,
            lesson_pack_id=pack.id,
            scheduled_at=scheduled,
            duration_minutes=pack.duration_minutes,
            price_cents=pack.price_cents,
            currency=pack.currency,
            platform_fee_cents=int(pack.price_cents * 0.05),
            status=status,
            paid_at=scheduled - timedelta(days=1) if status != BookingStatus.PENDING_PAYMENT else None,
            completed_at=scheduled + timedelta(minutes=pack.duration_minutes) if status == BookingStatus.COMPLETED else None,
        )
        session.add(b)
        session.commit()
        session.refresh(b)
    session.commit()


def _create_testimonials(session: Session, tutors: list[Tutor]) -> None:
    """Tutor-self-managed testimonials (the v1 review surface).

    These are what visitors see on tutor sites — written by the tutor
    based on real student feedback, not student-submitted (avoids the
    abuse vectors of public submission).
    """
    samples = [
        ("Sara M.", "Athens, Greece", "Great lesson, really patient and clear.", 5),
        ("Daniel K.", "Berlin, Germany", "Helped me through tricky grammar — booking another.", 5),
        ("Yuki T.", "Tokyo, Japan", "Friendly and well-prepared. Recommended.", 5),
        ("Camille R.", "Lyon, France", "Felt comfortable speaking from the first minute.", 4),
        ("Liam D.", "Dublin, Ireland", "Practical and warm — good fit for me.", 5),
    ]
    for tutor in tutors:
        # Each tutor gets 3 randomly-chosen testimonials
        for idx, (name, loc, body, rating) in enumerate(RNG.sample(samples, 3)):
            session.add(Testimonial(
                tutor_id=tutor.id,
                student_name=name,
                location=loc,
                body=body,
                rating=rating,
                display_order=idx * 10,
                is_published=True,
            ))
    session.commit()


def _pick_booking_status(offset_days: int) -> BookingStatus:
    if offset_days < -1:
        return RNG.choices(
            [BookingStatus.COMPLETED, BookingStatus.NO_SHOW, BookingStatus.CANCELLED],
            weights=[80, 10, 10],
        )[0]
    if offset_days < 0:
        return BookingStatus.COMPLETED
    if offset_days == 0:
        return BookingStatus.CONFIRMED
    return RNG.choices(
        [BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT],
        weights=[85, 15],
    )[0]


def _create_articles(session: Session, tutors: list[Tutor], tutor_users: list[User]) -> None:
    """Two-to-three articles per tutor at varied recency. Mix of public
    and subscriber-only so the marketplace shows the access tiers."""
    base_titles = {
        "vasso": [
            ("Three idioms that make your Greek sound native", "Snippets you'll hear in any Athens café."),
            ("Greek accent marks — the only rules worth memorising", "What the textbooks overcomplicate."),
            ("Από where? Greek prepositions in plain English", "A working map of the trickier prepositions."),
        ],
        "akiko": [
            ("JLPT N3 grammar in one weekend", "A focused crash through the key patterns."),
            ("Why N4 to N3 feels like a wall (and how to break it)", "The transition issues most students miss."),
            ("Casual Japanese for friends — politeness off-switch", "Plain forms that still feel right."),
        ],
        "maria": [
            ("Why Spanish subjunctive isn't scary", "A working framework, not a list of rules."),
            ("Por vs para in one diagram", "The shape behind the choice."),
            ("Latin American Spanish: what changes, what doesn't", "Practical heads-up before you travel."),
        ],
        "lucas": [
            ("DELF B2: writing the synthèse cleanly", "Examiner-side notes on what scores well."),
            ("French nasal vowels — finally hear the difference", "A drill that worked for my students."),
        ],
        "amelia": [
            ("Lose the 'foreign' English accent (without losing your voice)", "Practical drills you can do alone."),
            ("Business English emails that don't sound stiff", "Three templates and the logic behind them."),
            ("'Could vs would vs might' in one paragraph", "When each one actually means something."),
        ],
        "felix": [
            ("Mastering der/die/das without flashcards", "Pattern recognition over memorisation."),
            ("German cases in a single afternoon", "If you've been avoiding them — start here."),
            ("Goethe B2 Lesen: the question types decoded", "What the test is really measuring."),
        ],
    }
    visibilities = [
        ArticleVisibility.PUBLIC,
        ArticleVisibility.PUBLIC,
        ArticleVisibility.SUBSCRIBERS_ONLY,
    ]
    for tutor, user in zip(tutors, tutor_users, strict=False):
        for idx, (title, summary) in enumerate(base_titles.get(tutor.tutor_slug, [])):
            visibility = visibilities[idx] if idx < len(visibilities) else ArticleVisibility.PUBLIC
            preview_markdown: str | None = None
            if visibility == ArticleVisibility.SUBSCRIBERS_ONLY:
                # Hand-written hook shown to anonymous + non-subscriber
                # visitors so they can decide whether to subscribe.
                preview_markdown = (
                    f"### A taste of *{title}*\n\n"
                    f"{summary} What follows is the full breakdown — examples, "
                    "pattern, and a couple of common student mistakes I keep hearing in lessons.\n\n"
                    "Subscribers get every article like this one (about two a week), "
                    "plus the audio drills and the worksheet bundle. "
                    "It's the deepest part of what I do — and the part I most want you to see."
                )
            # Slugify: lowercase, ASCII-ish only. Strip diacritics so
            # "Από" becomes "apo" and the resulting URL is stable. The
            # router's public reader matches the slug verbatim, so any
            # non-ASCII left in the slug would silently 404.
            import unicodedata
            decomposed = unicodedata.normalize("NFKD", title.lower())
            ascii_title = "".join(
                c for c in decomposed if not unicodedata.combining(c)
            )
            cleaned = "".join(
                c if (c.isalnum() or c in "- ") else " " for c in ascii_title
            )
            slug = (
                "-".join(cleaned.split())[:60] + f"-{idx}"
            )[:120]
            session.add(Article(
                tutor_id=tutor.id,
                author_user_id=user.id,
                title=title,
                slug=slug,
                summary=summary,
                body_markdown=(
                    f"# {title}\n\n{summary}\n\n"
                    "## Introduction\n\nThis is a demo article for the Kotobaseed platform.\n\n"
                    "## Section 1\n\nReplace this body with your real article content. Markdown is supported "
                    "across headings, lists, links, images, and embedded video.\n\n"
                    "## Section 2\n\nThe published date drives ordering on the tutor's articles index. "
                    "Subscriber-only articles appear locked to non-subscribers with a 'Subscribe to read' CTA."
                ),
                preview_markdown=preview_markdown,
                visibility=visibility,
                is_published=True,
                published_at=datetime.now(UTC) - timedelta(days=RNG.randint(1, 90)),
            ))
    session.commit()


def _create_marketplace_projects(
    session: Session, tutor_users: list[User], students: list[User],
) -> list[Project]:
    """Marketplace projects across the full lifecycle — DRAFT, FUNDING,
    SUCCESSFUL, COMPLETED, CANCELLED — with pledges + backers on the
    funded ones. Demonstrates the marketplace surface end-to-end."""
    blueprint = [
        ("Greek for travellers, 10-part series", "Survival phrases plus the cultural why behind them.", "Greek", "A1", 5000, ProjectStatus.FUNDING),
        ("JLPT N4 kanji drill packs", "Spaced-repetition cards with example sentences.", "Japanese", "A2", 7500, ProjectStatus.FUNDING),
        ("Spanish telenovela analysis", "Episode breakdowns with subtitle transcripts.", "Spanish", "B1", 6500, ProjectStatus.SUCCESSFUL),
        ("German fairy tales, line-by-line", "Original Grimm with vocabulary footnotes.", "German", "B2", 8000, ProjectStatus.COMPLETED),
        ("French chanson breakdowns", "Lyrics and grammar for ten classic songs.", "French", "B1", 4500, ProjectStatus.CANCELLED),
        ("Business English email collection", "Real-world templates from Fortune 500 archives.", "English", "B2", 5500, ProjectStatus.FUNDING),
        ("Conversational Greek for emigrants", "Get past 'kalimera' fast.", "Greek", "A2", 6000, ProjectStatus.DRAFT),
    ]
    out: list[Project] = []
    for (user, (title, descr, lang, level, goal, st)) in zip(
        list(tutor_users) * 2, blueprint, strict=False
    ):
        p = Project(
            title=title,
            description=descr,
            language=lang,
            level=level,
            funding_goal=goal,
            teacher_id=user.id,
            status=st,
            created_at=datetime.now(UTC) - timedelta(days=RNG.randint(5, 90)),
        )
        session.add(p)
        session.commit()
        session.refresh(p)
        out.append(p)
        # Fund the active/successful/completed projects with believable
        # pledges. CANCELLED + DRAFT skip this.
        if st in (ProjectStatus.FUNDING, ProjectStatus.SUCCESSFUL, ProjectStatus.COMPLETED):
            funded = goal if st != ProjectStatus.FUNDING else int(goal * RNG.uniform(0.35, 0.85))
            remaining = funded
            n_backers = RNG.randint(3, 8)
            for i in range(n_backers):
                # Last backer takes the rest so the math lines up
                amt = remaining if i == n_backers - 1 else max(
                    500, int(remaining / (n_backers - i) * RNG.uniform(0.5, 1.8))
                )
                amt = min(amt, remaining)
                if amt <= 0:
                    break
                remaining -= amt
                pledger = RNG.choice(students)
                session.add(Pledge(
                    user_id=pledger.id,
                    project_id=p.id,
                    amount=amt,
                    status=PledgeStatus.CAPTURED,
                    payment_intent_id=f"pi_demo_{p.id}_{i}",
                ))
            session.commit()
    return out


def _create_marketplace_requests(
    session: Session, students: list[User], tutor_users: list[User]
) -> None:
    """Student-posted marketplace requests in varied states."""
    blueprint = [
        ("Conversational Japanese practice, weekly", "Looking for a tutor for casual N3-level conversation.", "Japanese", "B1", 3000, RequestStatus.OPEN),
        ("Greek grammar drills, A2 → B1", "Specific focus on case endings.", "Greek", "A2", 4500, RequestStatus.OPEN),
        ("Business English coaching for interviews", "Coming up on a leadership role.", "English", "C1", 6000, RequestStatus.ACCEPTED),
        ("Spanish exam prep, DELE B2", "Test in three weeks, want focused weekly help.", "Spanish", "B2", 5500, RequestStatus.NEGOTIATING),
        ("French pronunciation only", "I read fine but my accent is killing me.", "French", "B1", 2500, RequestStatus.OPEN),
    ]
    for student, (title, descr, lang, level, budget, st) in zip(
        students[:5], blueprint, strict=False
    ):
        target = RNG.choice(tutor_users) if st != RequestStatus.OPEN else None
        session.add(Request(
            user_id=student.id,
            title=title,
            description=descr,
            language=lang,
            level=level,
            budget=budget,
            target_teacher_id=target.id if target else None,
            status=st,
            created_at=datetime.now(UTC) - timedelta(days=RNG.randint(1, 21)),
        ))
    session.commit()


def _create_lesson_modules(
    session: Session, tutors: list[Tutor], students: list[User]
) -> None:
    """Each tutor on PRO billing gets 2 published modules. Half get a
    handful of student purchases so the modules surface shows revenue."""
    import json
    template = [
        ("Greek alphabet boot camp", "Five sessions, fully written + audio.", 1500),
        ("JLPT N3 grammar drills", "20 question sets with answer keys.", 2500),
        ("Spanish subjunctive mastery", "Pattern-by-pattern walkthrough.", 1800),
        ("English vowels you've never heard", "Listening + repetition drills.", 1200),
        ("German cases finally", "Four hours of explanation + practice.", 2200),
    ]
    for tutor in tutors:
        if tutor.plan != TutorPlan.PRO:
            continue
        # Pull this tutor's real articles so module items reference rows
        # that actually exist — otherwise the storefront expansion
        # silently drops items with no body to show.
        tutor_articles = session.exec(
            select(Article).where(Article.tutor_id == tutor.id)
        ).all()
        if len(tutor_articles) < 2:
            # Tutor has fewer articles than module slots want — skip
            # rather than seed a half-broken module.
            continue
        for idx, (title, summary, price) in enumerate(RNG.sample(template, 2)):
            # Two-item modules: first item is a free preview, second is
            # gated behind the purchase. Showcases the gate working on
            # both sides for prospects on demo.kotobaseed.net.
            picked = RNG.sample(tutor_articles, 2)
            items = [
                {"kind": "article", "ref_id": picked[0].id, "preview": True},
                {"kind": "article", "ref_id": picked[1].id, "preview": False},
            ]
            module = LessonModule(
                tutor_id=tutor.id,
                slug=f"{tutor.tutor_slug}-{title.lower().replace(' ', '-')[:30]}-{idx}",
                title=title,
                summary=summary,
                description=summary + " Self-paced — yours forever after purchase.",
                items_json=json.dumps(items),
                price_cents=price,
                currency="eur",
                is_published=True,
                published_at=datetime.now(UTC) - timedelta(days=RNG.randint(7, 60)),
            )
            session.add(module)
            session.commit()
            session.refresh(module)
            # Some students buy it
            n_buyers = RNG.randint(0, 4)
            for buyer in RNG.sample(students, min(n_buyers, len(students))):
                session.add(ModulePurchase(
                    module_id=module.id,
                    tutor_id=tutor.id,
                    student_user_id=buyer.id,
                    amount_cents=price,
                    platform_fee_cents=int(price * 0.05),
                ))
    session.commit()


def _create_placement_tests(session: Session, tutors: list[Tutor]) -> None:
    """Three of the six tutors offer a placement test. JSON shape mirrors
    the homework engine so the real UI works against this data."""
    import json
    sample_questions = [
        {
            "id": "q1",
            "kind": "mc_single",
            "prompt": "Which sentence is correct?",
            "options": ["I goes to school", "I go to school", "I going to school", "I gone to school"],
            "correct_index": 1,
            "points": 1,
        },
        {
            "id": "q2",
            "kind": "fill_blank",
            "prompt": "Yesterday I _____ to the cinema.",
            "answer": "went",
            "points": 1,
        },
        {
            "id": "q3",
            "kind": "mc_multi",
            "prompt": "Which of these are past tense?",
            "options": ["ran", "running", "ate", "eats"],
            "correct_indices": [0, 2],
            "points": 1,
        },
    ]
    bands = [
        {"min_percent": 0, "label": "A1 starter"},
        {"min_percent": 40, "label": "A2 elementary"},
        {"min_percent": 65, "label": "B1 intermediate"},
        {"min_percent": 85, "label": "B2 upper-intermediate"},
    ]
    for tutor in RNG.sample(tutors, 3):
        session.add(PlacementTest(
            tutor_id=tutor.id,
            title=f"{tutor.display_name}'s placement test",
            description="Find your level before booking. Takes about 8 minutes.",
            level_bands_json=json.dumps(bands),
            questions_json=json.dumps(sample_questions),
            is_active=True,
        ))
    session.commit()


def _create_group_sessions(
    session: Session, tutors: list[Tutor]
) -> None:
    """Past + upcoming group sessions on each tutor's first lesson pack."""
    now = datetime.now(UTC)
    for tutor in tutors[:3]:
        pack = session.exec(
            select(LessonPack).where(
                LessonPack.tutor_id == tutor.id,
                LessonPack.is_trial == False,
                LessonPack.is_active == True,
            )
        ).first()
        if pack is None:
            continue
        # Upcoming group session
        upcoming_at = now + timedelta(days=RNG.randint(3, 14), hours=RNG.choice([10, 16]))
        session.add(GroupSession(
            tutor_id=tutor.id,
            lesson_pack_id=pack.id,
            scheduled_at=upcoming_at,
            duration_minutes=pack.duration_minutes,
            threshold_eval_at=upcoming_at - timedelta(hours=24),
            notes="Conversational practice — open to everyone at this level.",
        ))
        # Past delivered session
        past_at = now - timedelta(days=RNG.randint(7, 30), hours=RNG.choice([10, 16]))
        session.add(GroupSession(
            tutor_id=tutor.id,
            lesson_pack_id=pack.id,
            scheduled_at=past_at,
            duration_minutes=pack.duration_minutes,
            threshold_eval_at=past_at - timedelta(hours=24),
            min_evaluated_at=past_at - timedelta(hours=24),
            delivered_at=past_at + timedelta(minutes=pack.duration_minutes),
        ))
    session.commit()


def _create_recurring_plans(
    session: Session, tutors: list[Tutor], students: list[User]
) -> None:
    """Three students on standing weekly slots — the recurring surface
    needs at least one active plan visible to demo properly."""
    for i in range(3):
        tutor = tutors[i]
        student = students[i]
        pack = session.exec(
            select(LessonPack).where(
                LessonPack.tutor_id == tutor.id,
                LessonPack.is_trial == False,
                LessonPack.is_active == True,
            )
        ).first()
        if pack is None:
            continue
        session.add(RecurringBookingPlan(
            tutor_id=tutor.id,
            student_user_id=student.id,
            lesson_pack_id=pack.id,
            day_of_week=RNG.randint(0, 4),  # Mon-Fri
            start_minute=RNG.choice([10 * 60, 14 * 60, 16 * 60]),
            duration_minutes=pack.duration_minutes,
            price_cents=pack.price_cents,
            currency=pack.currency,
            # Plan starts a few weeks ago so child bookings can be
            # back-dated realistically.
            start_date=datetime.now(UTC) - timedelta(weeks=RNG.randint(2, 8)),
        ))
    session.commit()


def _create_conversations(session: Session, tutors: list[Tutor], students: list[User]) -> None:
    """Sample inbox content — direct DM (student-initiated, awaiting tutor reply),
    direct DM (tutor responded), and an archived thread."""
    now = datetime.now(UTC)
    s1, s2, s3 = students[:3]
    t1 = tutors[0]
    t2 = tutors[1]
    # Direct DM, student initiated, awaiting tutor
    c1 = Conversation(
        request_id=None,
        teacher_id=t1.user_id,
        student_id=s1.id,
        status=ConversationStatus.OPEN,
        student_initiated=True,
        updated_at=now - timedelta(hours=2),
    )
    session.add(c1)
    session.commit()
    session.refresh(c1)
    session.add(Message(
        conversation_id=c1.id, sender_id=s1.id,
        content="Hi! I'd like to start with conversational Greek — I lived in Athens briefly and want to pick it back up.",
        message_type=MessageType.TEXT,
    ))
    # Direct DM, tutor replied
    c2 = Conversation(
        request_id=None,
        teacher_id=t2.user_id,
        student_id=s2.id,
        status=ConversationStatus.OPEN,
        student_initiated=True,
        tutor_first_responded_at=now - timedelta(hours=6),
        updated_at=now - timedelta(hours=4),
    )
    session.add(c2)
    session.commit()
    session.refresh(c2)
    session.add(Message(
        conversation_id=c2.id, sender_id=s2.id,
        content="JLPT N3 prep — about 4 months out. Do you have a schedule for that level?",
        message_type=MessageType.TEXT,
        created_at=now - timedelta(hours=8),
    ))
    session.add(Message(
        conversation_id=c2.id, sender_id=t2.user_id,
        content="Yes — N3 is roughly two 90-minute sessions a week. We'll cover grammar, listening, kanji.",
        message_type=MessageType.TEXT,
        created_at=now - timedelta(hours=6),
    ))
    session.add(Message(
        conversation_id=c2.id, sender_id=s2.id,
        content="Sounds good. Let me book a trial first.",
        message_type=MessageType.TEXT,
        created_at=now - timedelta(hours=4),
    ))
    # Archived (closed) thread
    c3 = Conversation(
        request_id=None,
        teacher_id=tutors[2].user_id,
        student_id=s3.id,
        status=ConversationStatus.CLOSED,
        student_initiated=True,
        tutor_first_responded_at=now - timedelta(days=20),
        updated_at=now - timedelta(days=15),
    )
    session.add(c3)
    session.commit()
    session.refresh(c3)
    session.add(Message(
        conversation_id=c3.id, sender_id=s3.id,
        content="Thanks for the lessons! Pausing for the summer.",
        message_type=MessageType.TEXT,
        created_at=now - timedelta(days=15),
    ))
    session.commit()


def _wipe_demo_data(session: Session) -> None:
    """Delete every row tied to a `*@kotobaseed-demo.example` user.

    Used by the --reset flag so we can re-seed cleanly after a schema
    change without dropping the whole database. Cascades follow the
    foreign-key fan-out: bookings, articles, modules, conversations,
    projects, the lot. Admin + platform_setting rows are untouched.
    """
    demo_users = session.exec(
        select(User).where(User.email.like("%@kotobaseed-demo.example"))
    ).all()
    if not demo_users:
        return
    demo_ids = {u.id for u in demo_users}
    print(f"Wiping {len(demo_ids)} demo users + their data…")
    # The DB has cascade rules on most relations; the explicit delete
    # below covers the few that don't.
    from backend.models import (
        Booking,
        ModulePurchase,
        Notification,
        Pledge,
        Tutor,
    )

    for model, fk in [
        (Booking, "student_user_id"),
        (ModulePurchase, "student_user_id"),
        (Pledge, "user_id"),
        (Notification, "user_id"),
    ]:
        for row in session.exec(
            select(model).where(getattr(model, fk).in_(demo_ids))
        ).all():
            session.delete(row)
    # Bookings on the tutor side — the tutor's own bookings cascade
    # through Tutor delete, but we wipe explicitly first so the cascade
    # isn't on the critical path if it's misconfigured anywhere.
    demo_tutor_ids = {
        t.id
        for t in session.exec(
            select(Tutor).where(Tutor.user_id.in_(demo_ids))
        ).all()
    }
    if demo_tutor_ids:
        for b in session.exec(
            select(Booking).where(Booking.tutor_id.in_(demo_tutor_ids))
        ).all():
            session.delete(b)
    # Tutors → cascades to Articles, LessonModule, etc.
    for tutor in session.exec(
        select(Tutor).where(Tutor.user_id.in_(demo_ids))
    ).all():
        session.delete(tutor)
    for u in demo_users:
        session.delete(u)
    session.commit()


def main() -> int:
    reset = "--reset" in sys.argv
    with Session(engine) as session:
        if reset:
            _wipe_demo_data(session)
        if _seed_sentinel(session):
            print("Demo data already seeded (vasso@kotobaseed-demo.example exists). Aborting.")
            print("Pass --reset to wipe demo data first.")
            return 1
        print("Seeding tutors + students…")
        tutor_users, students = _create_users(session)
        print("Seeding Tutor rows + availability…")
        tutors = _create_tutors(session, tutor_users)
        print("Seeding lesson packs…")
        _create_lesson_packs(session, tutors)
        print("Seeding bookings…")
        _create_bookings(session, tutors, students)
        print("Seeding testimonials…")
        _create_testimonials(session, tutors)
        print("Seeding articles…")
        _create_articles(session, tutors, tutor_users)
        print("Seeding lesson modules + purchases…")
        _create_lesson_modules(session, tutors, students)
        print("Seeding placement tests…")
        _create_placement_tests(session, tutors)
        print("Seeding group sessions…")
        _create_group_sessions(session, tutors)
        print("Seeding recurring plans…")
        _create_recurring_plans(session, tutors, students)
        print("Seeding marketplace projects + pledges…")
        _create_marketplace_projects(session, tutor_users, students)
        print("Seeding marketplace requests…")
        _create_marketplace_requests(session, students, tutor_users)
        print("Seeding conversations…")
        _create_conversations(session, tutors, students)
        print("Done.")
        print()
        print("Login as a tutor (password for all demo accounts):  demo-password")
        for t in TUTORS:
            print(f"  {t['email']}  →  https://{t['slug']}.demo.kotobaseed.net")
        print()
        print("Login as a student:")
        for _slug, name, email in STUDENTS[:3]:
            print(f"  {email}  ({name})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
