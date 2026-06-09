"""One-shot onboarding for Sophia Willowood — third showcase tutor.

Mirrors `onboard_dafni.py` but with the Inkwell theme (deep navy + bone
cream + coral, Playfair Display + Inter) and English-teaching content.

  - email = sophiawillowood@gmail.com
  - subdomain = sophia.kotobaseed.net
  - 6-month Pro grant (extendable; idempotent on re-run)
  - custom-sophia theme = inkwell pack

Idempotent on email + theme_key + (tutor_id, section_type). Re-running
updates copy in place.

    docker compose exec backend python -m backend.scripts.onboard_sophia
"""

from __future__ import annotations

import json
import logging
import secrets
import string
import sys
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from ..config import settings
from ..database import engine
from ..models import (
    AdminGrant,
    AdminGrantKind,
    AdminGrantStatus,
    CustomTheme,
    CustomThemeStatus,
    Tutor,
    TutorAccountStatus,
    TutorPageSection,
    TutorPageSectionType,
    User,
    UserRole,
)
from ..security import get_password_hash
from ..services.admin_grants import activate_grant

log = logging.getLogger(__name__)

SOPHIA_EMAIL = "sophiawillowood@gmail.com"
SOPHIA_SLUG = "sophia"
SOPHIA_DISPLAY_NAME = "Sophia"
SOPHIA_BIO = (
    "Private English lessons for adults — one-to-one, online, paced to "
    "the week you actually have. I work with learners from confident "
    "beginners up through advanced writers preparing for work, study, "
    "and life in English. Lessons combine real conversation, precise "
    "grammar, and the texture of how English is actually used."
)
SOPHIA_LANGUAGES = "English, Greek"
THEME_KEY = "custom-sophia"
THEME_NAME = "English with Sophia"


PALETTE = {
    "--brand": "#1c2540",          # navy-700 — primary
    "--brand-hover": "#161e3a",    # navy-800
    "--accent": "#e76b5c",         # coral-500
    "--accent-hover": "#d35347",   # coral-600
    "--bg": "#f5efe2",             # bone-100 — page bg
    "--surface": "#faf6ec",        # bone-050 — card / surface
    "--fg": "#2a2820",             # bone-900 — body text
    "--fg-muted": "#6b6253",       # bone-700
    "--border": "#e3ddca",         # bone-300
}

FONTS = {
    "url": (
        "https://fonts.googleapis.com/css2"
        "?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700"
        "&family=Inter:wght@400;500;600;700;800"
        "&display=swap"
    ),
    "display": "Playfair Display",
    "body": "Inter",
    "chrome": {
        "wordmark": {"l1": "English with Sophia", "l2": "Private lessons"},
        "nav": {
            "landing": [
                {"label": "How it works", "href": "#features"},
                {"label": "Levels", "href": "#levels"},
                {"label": "Lessons", "href": "#pricing"},
                {"label": "Journal", "href": "/articles"},
                {"label": "Reviews", "href": "/reviews"},
            ],
            "simple": [
                {"label": "Journal", "href": "/articles"},
                {"label": "Modules", "href": "/modules"},
            ],
        },
        "footer": {
            "tagline": (
                "Private English lessons for adults — online, one-to-one, "
                "paced to your week."
            ),
            "columns": [
                [
                    "Learn",
                    [
                        ["Journal", "/articles"],
                        ["Modules", "/modules"],
                        ["How lessons work", "/#features"],
                        ["Levels", "/#levels"],
                    ],
                ],
                [
                    "Teacher",
                    [
                        ["About Sophia", "/#about"],
                        ["Lessons", "/#pricing"],
                        ["Reviews", "/reviews"],
                    ],
                ],
                [
                    "Get in touch",
                    [
                        ["Sign in", "/login"],
                        ["Send first message", "/contact"],
                        ["Book a lesson", "/#pricing"],
                    ],
                ],
            ],
        },
    },
}


LAYOUT = [
    {"section_type": "hero_portrait", "variant_key": "sophia_inkwell_literary", "position": 0, "is_visible": True},
    {"section_type": "features_grid", "variant_key": "sophia_editorial_cards", "position": 1, "is_visible": True},
    {"section_type": "levels_alphabet", "variant_key": "sophia_deep_inkwell", "position": 2, "is_visible": True},
    {"section_type": "pricing_grid", "variant_key": "sophia_inkwell_trio", "position": 3, "is_visible": True},
    {"section_type": "about_portrait", "variant_key": "sophia_essay_dropcap", "position": 4, "is_visible": True},
    {"section_type": "reviews_grid", "variant_key": "sophia_inkwell_quotes", "position": 5, "is_visible": True},
]


# Sophia's starter copy. Neutral premier-tutor positioning. The editorial
# typography carries the personality; the words are factual.
SOPHIA_CONTENT = {
    "hero_portrait": {
        "eyebrow": "Private English lessons",
        "headline_tagline": "Welcome.",
        "headline": "English lessons, <em>made to fit your week</em>.",
        "sub": (
            "One-to-one lessons with a focus on real conversation, clear "
            "grammar, and the texture of how English is actually used."
        ),
        "primary_cta_label": "Send first message",
        "primary_cta_href": "/contact",
        "secondary_cta_label": "Book a lesson",
        "secondary_cta_href": "#pricing",
        "tertiary_cta_label": "Trial lesson",
        "float_level_letter": "A",
        "float_level_title": "All levels",
        "float_level_sub": "Beginner to advanced",
        "float_booking_title": "Booking now",
        "float_booking_sub": "weekly slots open",
    },
    "features_grid": {
        "eyebrow": "How lessons work",
        "title": "From first message to first lesson",
        "sub": "Three steps to get started.",
        "steps": [
            {
                "n": "i.",
                "title": "Tell me about you",
                "desc": (
                    "A short message about where you are with English and "
                    "what you'd like to be able to do next. No level test, "
                    "no homework."
                ),
            },
            {
                "n": "ii.",
                "title": "Pick a weekly slot",
                "desc": (
                    "We find a time that fits your calendar. Most students "
                    "keep the same weekly slot and book a few weeks ahead."
                ),
            },
            {
                "n": "iii.",
                "title": "Your first lesson",
                "desc": (
                    "We meet on video, talk through your goals, and start "
                    "with a conversation you can carry into the rest of "
                    "your day."
                ),
            },
        ],
    },
    "levels_alphabet": {
        "eyebrow": "Where you start",
        "title": "Three places to begin",
        "sub": (
            "Most students arrive somewhere in one of these three places. "
            "Wherever you are is fine — every plan is one-to-one."
        ),
        "levels": [
            {
                "g": "A",
                "name": "Beginner",
                "desc": (
                    "You can manage greetings and basic exchanges, and "
                    "want a structured route into the language."
                ),
                "items": [
                    "Sounds and pronunciation",
                    "Greetings and introductions",
                    "Everyday vocabulary",
                    "Numbers, dates, and times",
                ],
            },
            {
                "g": "B",
                "name": "Intermediate",
                "desc": (
                    "You can hold a short conversation when the other "
                    "person is patient. Tenses still feel uncertain and "
                    "you want a clearer map."
                ),
                "items": [
                    "Past, present, and future tenses",
                    "Telling stories about your day",
                    "Reading short articles with support",
                    "Asking for clarification confidently",
                ],
            },
            {
                "g": "C",
                "name": "Advanced",
                "desc": (
                    "You follow conversations, read at length, and want "
                    "the texture of fluent English — idiom, register, and "
                    "rhythm in writing and speech."
                ),
                "items": [
                    "Idiom and register",
                    "Discussion and debate",
                    "Reading literature and journalism",
                    "Writing essays with feedback",
                ],
            },
        ],
    },
    "pricing_grid": {
        "eyebrow": "Lessons",
        "title": "Ways to study",
        "sub": (
            "Single lesson, weekly membership, or lesson packs. Choose "
            "what fits your week."
        ),
    },
    "about_portrait": {
        "eyebrow": "About",
        "title": "Hello.",
        # Bio fills from tutor.bio at render time — long-form essay.
    },
    "reviews_grid": {
        "eyebrow": "Reviews",
        "title": "What students say",
        "sub": "From learners across the world.",
    },
}


def _gen_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _find_admin(session: Session) -> User:
    admin = session.exec(
        select(User).where(User.email == settings.admin_email)
    ).first()
    if admin is None:
        raise RuntimeError(
            f"Admin user {settings.admin_email!r} not found — onboarding can't grant Pro."
        )
    return admin


def _upsert_user_and_tutor(
    session: Session, admin: User
) -> tuple[User, Tutor, str | None]:
    """Idempotent on email. Returns (user, tutor, freshly_generated_password)
    where the password is only set when we just created the user."""
    existing = session.exec(
        select(User).where(User.email == SOPHIA_EMAIL)
    ).first()
    if existing is not None:
        log.warning(
            "User %s already exists (id=%s) — reusing", SOPHIA_EMAIL, existing.id
        )
        tutor = session.exec(
            select(Tutor).where(Tutor.user_id == existing.id)
        ).first()
        if tutor is None:
            tutor = Tutor(
                user_id=existing.id,
                tutor_slug=SOPHIA_SLUG,
                display_name=SOPHIA_DISPLAY_NAME,
                bio=SOPHIA_BIO,
                languages_taught=SOPHIA_LANGUAGES,
                theme=THEME_KEY,
                account_status=TutorAccountStatus.ACTIVE,
                marketplace_listing_enabled=True,
                cancellation_cutoff_hours=24,
            )
            session.add(tutor)
            session.commit()
            session.refresh(tutor)
        else:
            tutor.theme = THEME_KEY
            tutor.display_name = SOPHIA_DISPLAY_NAME
            session.add(tutor)
            session.commit()
            session.refresh(tutor)
        existing.bio = SOPHIA_BIO
        existing.languages = SOPHIA_LANGUAGES
        existing.full_name = SOPHIA_DISPLAY_NAME
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing, tutor, None

    now = datetime.now(UTC)
    password = _gen_password()
    user = User(
        email=SOPHIA_EMAIL,
        hashed_password=get_password_hash(password),
        full_name=SOPHIA_DISPLAY_NAME,
        role=UserRole.TUTOR,
        is_active=True,
        email_verified_at=now,
        gdpr_consent_at=now,
        timezone="Europe/Athens",
        bio=SOPHIA_BIO,
        languages=SOPHIA_LANGUAGES,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    tutor = Tutor(
        user_id=user.id,
        tutor_slug=SOPHIA_SLUG,
        display_name=SOPHIA_DISPLAY_NAME,
        bio=SOPHIA_BIO,
        languages_taught=SOPHIA_LANGUAGES,
        theme=THEME_KEY,
        account_status=TutorAccountStatus.ACTIVE,
        marketplace_listing_enabled=True,
        cancellation_cutoff_hours=24,
    )
    session.add(tutor)
    session.commit()
    session.refresh(tutor)
    return user, tutor, password


def _upsert_pro_grant(session: Session, user: User, admin: User) -> AdminGrant:
    """6-month Pro grant. Idempotent — extends existing grant on re-run."""
    now = datetime.now(UTC)
    six_months = timedelta(days=183)
    existing = session.exec(
        select(AdminGrant)
        .where(
            AdminGrant.granted_to_user_id == user.id,
            AdminGrant.kind == AdminGrantKind.TIER_UPGRADE,
            AdminGrant.status == AdminGrantStatus.ACTIVE,
        )
        .order_by(AdminGrant.created_at.desc())
    ).first()
    if existing is not None:
        base = existing.expires_at or now
        if base is not None and base.tzinfo is None:
            base = base.replace(tzinfo=UTC)
        base = base if base > now else now
        existing.expires_at = base + six_months
        existing.updated_at = now
        existing.reason = (
            (existing.reason or "")
            + f" · extended by 6 months on {now.date().isoformat()}"
        )
        session.add(existing)
        session.commit()
        session.refresh(existing)
        activate_grant(session, existing)
        session.commit()
        return existing

    grant = AdminGrant(
        granted_to_user_id=user.id,
        granted_by_user_id=admin.id,
        kind=AdminGrantKind.TIER_UPGRADE,
        payload_json=json.dumps({"tier": "pro"}),
        expires_at=now + six_months,
        status=AdminGrantStatus.ACTIVE,
        reason="Platform owner — 6 months complimentary Pro for Sophia Willowood",
    )
    session.add(grant)
    session.commit()
    session.refresh(grant)
    activate_grant(session, grant)
    session.commit()
    return grant


def _upsert_theme(session: Session, owner_user_id: int) -> CustomTheme:
    payload_json = json.dumps(LAYOUT)
    palette_json = json.dumps(PALETTE)
    fonts_json = json.dumps(FONTS)

    existing = session.exec(
        select(CustomTheme).where(CustomTheme.theme_key == THEME_KEY)
    ).first()
    if existing is not None:
        existing.name = THEME_NAME
        existing.palette_json = palette_json
        existing.fonts_json = fonts_json
        existing.design_payload_json = payload_json
        existing.owner_user_id = owner_user_id
        existing.is_public_catalogue = False
        existing.updated_at = datetime.now(UTC)
        session.add(existing)
        session.commit()
        session.refresh(existing)
        log.info("Updated theme %s id=%s", THEME_KEY, existing.id)
        return existing

    row = CustomTheme(
        owner_user_id=owner_user_id,
        name=THEME_NAME,
        theme_key=THEME_KEY,
        palette_json=palette_json,
        fonts_json=fonts_json,
        design_payload_json=payload_json,
        is_public_catalogue=False,
        status=CustomThemeStatus.READY,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    log.info("Created theme %s id=%s", THEME_KEY, row.id)
    return row


def _upsert_page_sections(session: Session, tutor_id: int) -> None:
    type_to_pos = {item["section_type"]: item["position"] for item in LAYOUT}

    existing_rows = session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == tutor_id)
    ).all()
    by_type: dict[str, TutorPageSection] = {}
    for r in existing_rows:
        by_type[r.section_type.value] = r

    now = datetime.now(UTC)

    for stype_str, content in SOPHIA_CONTENT.items():
        try:
            stype = TutorPageSectionType(stype_str)
        except ValueError:
            log.error("Unknown section_type %s — skipping", stype_str)
            continue

        position = type_to_pos.get(stype_str, 100)
        content_json = json.dumps(content)
        row = by_type.get(stype_str)
        if row is None:
            row = TutorPageSection(
                tutor_id=tutor_id,
                section_type=stype,
                position=position,
                is_visible=True,
                content_json=content_json,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            log.info("Created TutorPageSection %s for tutor %s", stype_str, tutor_id)
        else:
            row.content_json = content_json
            row.position = position
            row.is_visible = True
            row.updated_at = now
            session.add(row)
            log.info("Updated TutorPageSection %s for tutor %s", stype_str, tutor_id)

    session.commit()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    with Session(engine) as session:
        admin = _find_admin(session)
        user, tutor, password = _upsert_user_and_tutor(session, admin)
        grant = _upsert_pro_grant(session, user, admin)
        theme = _upsert_theme(session, owner_user_id=user.id)
        _upsert_page_sections(session, tutor_id=tutor.id)
        captured = {
            "email": user.email,
            "tutor_slug": tutor.tutor_slug,
            "expires_at": grant.expires_at.isoformat() if grant.expires_at else None,
            "theme_key": theme.theme_key,
            "theme_id": theme.id,
            "password": password,
        }

    print()
    print("=" * 64)
    print(" Sophia Willowood onboarded.")
    print("=" * 64)
    print(f"  Tenant URL : https://{captured['tutor_slug']}.kotobaseed.net/")
    print(f"  Login email: {captured['email']}")
    if captured["password"]:
        print(f"  Password   : {captured['password']}")
        print("  ↑ share securely; not retrievable.")
    else:
        print("  Password   : (existing user; password unchanged)")
    print(f"  Pro until  : {captured['expires_at'] or 'no expiry'}")
    print(f"  Theme      : {captured['theme_key']}  (id={captured['theme_id']})")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    sys.exit(main())
