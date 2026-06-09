"""One-shot onboarding for Dafni — second showcase tutor + custom theme.

Mirrors `onboard_vasso.py` but with:
  - email = santonopoulou93+dafni@gmail.com (a +alias on Sophia's box
    until Dafni hands over her own email later)
  - subdomain = dafni.kotobaseed.net
  - 6-month Pro grant (extendable later via the admin grants UI)
  - custom-dafni theme = warm botanical pack (Fraunces + Inter,
    terracotta + sage + cream, six Dafni-only variant keys)
  - Dafni's TutorPageSection rows seeded with starter copy

Idempotent on email + theme_key + (tutor_id, section_type). Re-running
updates in place.

    docker compose exec backend python -m backend.scripts.onboard_dafni
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

DAFNI_EMAIL = "santonopoulou93+dafni@gmail.com"
DAFNI_SLUG = "dafni"
DAFNI_DISPLAY_NAME = "Dafni"
DAFNI_BIO = (
    "Private Greek lessons for adults — one to one, online, paced to the "
    "week you actually have. I work with learners from absolute beginners "
    "to readers of Greek journalism and literature. Lessons combine real "
    "conversation, structured grammar, and the cultural detail that makes "
    "Greek finally click."
)
DAFNI_LANGUAGES = "Greek, English"
THEME_KEY = "custom-dafni"
THEME_NAME = "Greek with Dafni"


PALETTE = {
    "--brand": "#b45f4a",          # terracotta-600
    "--brand-hover": "#934931",    # terracotta-700
    "--accent": "#6b8f71",         # sage-600
    "--accent-hover": "#4f6b56",   # sage-700
    "--bg": "#f5eee3",             # cream-100
    "--surface": "#faf5ec",        # cream-050
    "--fg": "#2d2823",             # cream-900 (deep coffee)
    "--fg-muted": "#6b5f52",       # cream-700
    "--border": "#e5d6bd",         # cream-300
}

FONTS = {
    "url": (
        "https://fonts.googleapis.com/css2"
        "?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700"
        "&family=Inter:wght@400;500;600;700;800"
        "&display=swap"
    ),
    "display": "Fraunces",
    "body": "Inter",
    "chrome": {
        "wordmark": {"l1": "Greek with Dafni", "l2": "Private Greek lessons"},
        "nav": {
            "landing": [
                {"label": "How it works", "href": "#how"},
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
                "Private Greek lessons for adults — online, one-to-one, paced "
                "to your week."
            ),
            "columns": [
                [
                    "Learn",
                    [
                        ["Journal", "/articles"],
                        ["Modules", "/modules"],
                        ["How it works", "/#how"],
                        ["Levels", "/#levels"],
                    ],
                ],
                [
                    "Teacher",
                    [
                        ["About Dafni", "/#about"],
                        ["Lessons", "/#pricing"],
                        ["Reviews", "/reviews"],
                    ],
                ],
                [
                    "Get in touch",
                    [
                        ["Sign in", "/login"],
                        ["Book a lesson", "/#pricing"],
                    ],
                ],
            ],
        },
    },
}


LAYOUT = [
    {"section_type": "hero_portrait", "variant_key": "dafni_editorial_warm", "position": 0, "is_visible": True},
    {"section_type": "features_grid", "variant_key": "dafni_leaf_dividers", "position": 1, "is_visible": True},
    {"section_type": "levels_alphabet", "variant_key": "dafni_leaf_pillars", "position": 2, "is_visible": True},
    {"section_type": "pricing_grid", "variant_key": "dafni_single_column_list", "position": 3, "is_visible": True},
    {"section_type": "about_portrait", "variant_key": "dafni_long_form_dropcap", "position": 4, "is_visible": True},
    {"section_type": "reviews_grid", "variant_key": "dafni_quiet_quotes", "position": 5, "is_visible": True},
]


# Dafni's starter copy. Neutral premier-tutor positioning — no fictional
# backstory, no "kindness/gently/wish I'd been taught" voice. The warm
# editorial *typography* carries the personality; the words are factual
# so any premier teacher could ship this template.
DAFNI_CONTENT = {
    "hero_portrait": {
        "eyebrow": "Private Greek lessons",
        "headline_greek": "Καλώς ήρθες.",
        "headline": "Greek lessons, <em>online and made for your week</em>.",
        "sub": (
            "One-to-one lessons with a focus on real conversation, clear "
            "grammar, and the cultural detail that makes Greek click."
        ),
        "primary_cta_label": "Send first message",
        "primary_cta_href": "/contact",
        "secondary_cta_label": "Book a lesson",
        "secondary_cta_href": "#pricing",
        "tertiary_cta_label": "Trial lesson",
        "float_level_letter": "Α",
        "float_level_title": "All levels",
        "float_level_sub": "Beginner to advanced",
        "float_booking_title": "Booking now",
        "float_booking_sub": "weekly slots open",
    },
    "features_grid": {
        "eyebrow": "How it works",
        "title": "From first message to first lesson",
        "sub": "Three steps to get started.",
        "steps": [
            {
                "n": "i.",
                "title": "Tell me about you",
                "desc": (
                    "A short message about what you can already say in Greek "
                    "and what you'd like to be able to say next. No level "
                    "test, no homework."
                ),
            },
            {
                "n": "ii.",
                "title": "Pick a weekly slot",
                "desc": (
                    "We find a time that fits your calendar and the Athens "
                    "timezone we both work in. Most students keep the same "
                    "weekly slot."
                ),
            },
            {
                "n": "iii.",
                "title": "Your first lesson",
                "desc": (
                    "We meet on video, talk through your goals, and start "
                    "with a small Greek conversation you can carry into the "
                    "rest of your day."
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
                "name": "Beginner",
                "desc": (
                    "You know the alphabet or close to it, can manage a few "
                    "greetings, and want a structured route into the language."
                ),
                "items": [
                    "Alphabet and pronunciation",
                    "Greetings and introductions",
                    "Café and shop Greek",
                    "Numbers, dates, and prices",
                ],
            },
            {
                "name": "Intermediate",
                "desc": (
                    "You can hold a short conversation when the other person "
                    "is patient. Tenses still feel uncertain and you want a "
                    "clearer map."
                ),
                "items": [
                    "Past, present, and future tenses",
                    "Telling short stories about your day",
                    "Reading short articles with support",
                    "Asking for clarification confidently",
                ],
            },
            {
                "name": "Advanced",
                "desc": (
                    "You follow conversations, read articles slowly, and want "
                    "the texture of fluent Greek — idiom, register, and the "
                    "rhythm of speech."
                ),
                "items": [
                    "Idioms and registers",
                    "Discussion and debate",
                    "Greek cinema, journalism, and literature",
                    "Writing essays with feedback",
                ],
            },
        ],
    },
    "pricing_grid": {
        "eyebrow": "Lessons",
        "title": "Ways to study",
        "sub": (
            "Single trial lesson, weekly subscriptions, or lesson packs. "
            "Choose what fits your week."
        ),
    },
    "about_portrait": {
        "eyebrow": "About",
        # Bio fills from tutor.bio at render time — long-form essay. The
        # signoff is the only theme-driven copy here.
        "signoff_template": "— {firstName}",
        "cta_label": "Send a first message",
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
        select(User).where(User.email == DAFNI_EMAIL)
    ).first()
    if existing is not None:
        log.warning(
            "User %s already exists (id=%s) — reusing", DAFNI_EMAIL, existing.id
        )
        tutor = session.exec(
            select(Tutor).where(Tutor.user_id == existing.id)
        ).first()
        if tutor is None:
            tutor = Tutor(
                user_id=existing.id,
                tutor_slug=DAFNI_SLUG,
                display_name=DAFNI_DISPLAY_NAME,
                bio=DAFNI_BIO,
                languages_taught=DAFNI_LANGUAGES,
                theme="custom-dafni",
                account_status=TutorAccountStatus.ACTIVE,
                marketplace_listing_enabled=True,
                cancellation_cutoff_hours=24,
            )
            session.add(tutor)
            session.commit()
            session.refresh(tutor)
        else:
            # Refresh theme + display so re-runs land. Bio lives on User.
            tutor.theme = "custom-dafni"
            tutor.display_name = DAFNI_DISPLAY_NAME
            session.add(tutor)
            session.commit()
            session.refresh(tutor)
        existing.bio = DAFNI_BIO
        existing.languages = DAFNI_LANGUAGES
        existing.full_name = DAFNI_DISPLAY_NAME
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing, tutor, None

    now = datetime.now(UTC)
    password = _gen_password()
    user = User(
        email=DAFNI_EMAIL,
        hashed_password=get_password_hash(password),
        full_name=DAFNI_DISPLAY_NAME,
        role=UserRole.CREATOR,
        is_active=True,
        email_verified_at=now,
        gdpr_consent_at=now,
        timezone="Europe/Athens",
        bio=DAFNI_BIO,
        languages=DAFNI_LANGUAGES,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    tutor = Tutor(
        user_id=user.id,
        tutor_slug=DAFNI_SLUG,
        display_name=DAFNI_DISPLAY_NAME,
        bio=DAFNI_BIO,
        languages_taught=DAFNI_LANGUAGES,
        theme="custom-dafni",
        account_status=TutorAccountStatus.ACTIVE,
        marketplace_listing_enabled=True,
        cancellation_cutoff_hours=24,
    )
    session.add(tutor)
    session.commit()
    session.refresh(tutor)
    return user, tutor, password


def _upsert_pro_grant(session: Session, user: User, admin: User) -> AdminGrant:
    """6-month Pro grant. If an active TIER_UPGRADE grant for Dafni
    already exists, EXTEND it by 6 months from `max(now, expires_at)`
    so re-running adds time rather than overwriting."""
    now = datetime.now(UTC)
    six_months = timedelta(days=183)  # ~6 months
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
        # Re-activate to make sure tier + expires_at on user are correct.
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
        reason="Beta tester — 6 months complimentary Pro for Dafni",
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

    for stype_str, content in DAFNI_CONTENT.items():
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
    # Capture plain values inside the session so the print block at the
    # bottom doesn't trip over SQLAlchemy's detached-instance check.
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
    print(" Dafni onboarded.")
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
