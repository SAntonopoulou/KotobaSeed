"""Seed the `custom-vasso` v2 theme + Vasso's matching TutorPageSection
rows.

The theme owns STRUCTURE: section order + which variant treats each
section + palette + fonts. The TUTOR owns CONTENT: every editable
field lives in their TutorPageSection rows, which they manage through
the existing page-builder UI.

So this script writes:

  CustomTheme   `custom-vasso`
    palette_json    — Aegean + honey + sand
    fonts_json      — Commissioner + Manrope + Syne
    design_payload  — [{section_type, variant_key, position}, ...]
                      (NO content; that's per-tutor now)

  TutorPageSection rows for Vasso's tutor:
    one row per section type with the bespoke copy in content_json

Idempotent on theme_key + on (tutor_id, section_type). Re-running
updates in place.

    docker compose exec backend python -m backend.scripts.seed_custom_vasso_theme
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

from sqlmodel import Session, select

from ..database import engine
from ..models import (
    CustomTheme,
    CustomThemeStatus,
    Tutor,
    TutorPageSection,
    TutorPageSectionType,
    User,
)

log = logging.getLogger(__name__)

VASSO_EMAIL = "santonopoulou93@gmail.com"
THEME_KEY = "custom-vasso"
THEME_NAME = "Greek with Vasso"


PALETTE = {
    "--brand": "#0a4f8a",
    "--brand-hover": "#0c3a5e",
    "--accent": "#e8b84b",
    "--accent-hover": "#c99a2e",
    "--bg": "#f4f1e8",
    "--surface": "#ffffff",
    "--fg": "#082942",
    "--fg-muted": "#4a5a6b",
    "--border": "#e7e0cf",
}

FONTS = {
    "url": (
        "https://fonts.googleapis.com/css2"
        "?family=Commissioner:wght@400;500;600;700;800"
        "&family=Manrope:wght@400;500;600;700;800"
        "&family=Syne:wght@600;700;800"
        "&display=swap"
    ),
    "display": "Commissioner",
    "body": "Manrope",
    "logo": "Syne",
    # Chrome — header + footer branding consumed by VassoLayout. Theme
    # owns this for now (Vasso's brand wordmark is part of her theme,
    # not her tutor profile); a future iteration can let the tutor
    # override l1/l2 via tutor settings.
    "chrome": {
        "wordmark": {"l1": "Learn Greek", "l2": "with Vasso"},
        "nav": {
            "landing": [
                {"label": "How it works", "href": "#how"},
                {"label": "Levels", "href": "#levels"},
                {"label": "Pricing", "href": "#pricing"},
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
                "Warm, one-to-one Greek lessons with a teacher who is cheering "
                "you on — from your first γεια σου onward."
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
                        ["About Vasso", "/#about"],
                        ["Pricing", "/#pricing"],
                        ["Reviews", "/reviews"],
                    ],
                ],
                [
                    "Support",
                    [
                        ["Sign in", "/login"],
                        ["Book a lesson", "/#pricing"],
                    ],
                ],
            ],
        },
    },
}


# Theme layout — structure only, no copy. Variant keys carry the
# customer prefix per the per-customer-pack policy. Vasso's variants
# live under `vasso_*` and aren't accessible to anyone else.
LAYOUT = [
    {"section_type": "hero_portrait", "variant_key": "vasso_gold_ring", "position": 0, "is_visible": True},
    {"section_type": "features_grid", "variant_key": "vasso_numbered_cards", "position": 1, "is_visible": True},
    {"section_type": "levels_alphabet", "variant_key": "vasso_glyph_aegean", "position": 2, "is_visible": True},
    {"section_type": "pricing_grid", "variant_key": "vasso_gold_ribbon", "position": 3, "is_visible": True},
    {"section_type": "about_portrait", "variant_key": "vasso_testimonial_quote", "position": 4, "is_visible": True},
    {"section_type": "reviews_grid", "variant_key": "vasso_avatar_cards", "position": 5, "is_visible": True},
]


# Vasso's content. Each key is a TutorPageSectionType value; the dict is
# the content blob that becomes the matching TutorPageSection.content_json.
VASSO_CONTENT = {
    "hero_portrait": {
        "eyebrow": "1-on-1 Greek lessons",
        "headline_greek": "Μάθε ελληνικά",
        "headline_rest": "— learn Greek, the joyful way.",
        "sub": (
            "Real lessons with a real teacher who is cheering you on. "
            "Start at α, and reach your first conversations sooner than "
            "you would think."
        ),
        "primary_cta_label": "Start a free trial",
        "secondary_cta_label": "Browse the journal",
        "secondary_cta_href": "/articles",
        "proof_avatars": ["#7fb5e6", "#e8b84b", "#7e944f", "#dc6a3f"],
        "proof_line": "Loved by <b>students from twenty countries</b>",
        "proof_sub": "Athens, Sydney, New York, and elsewhere",
        "float_alpha_title": "Start at alpha",
        "float_alpha_sub": "No Greek needed",
        "float_live_title": "Lesson live",
    },
    "features_grid": {
        "eyebrow": "How it works",
        "title_pre": "Three small steps to your first ",
        "title_gr": "γεια σου",
        "sub": (
            "Learning a language should feel like a warm welcome, not "
            "an exam. Here is how we begin together."
        ),
        "steps": [
            {
                "n": "01",
                "icon": "calendar_check",
                "title": "Book a time that suits you",
                "desc": (
                    "Pick a slot that fits your week. Reschedule any time "
                    "— life happens, and that is okay."
                ),
            },
            {
                "n": "02",
                "icon": "heart",
                "title": "Meet your teacher, one to one",
                "desc": (
                    "No big classes, no pressure. Just you and a patient "
                    "teacher who learns how you learn."
                ),
            },
            {
                "n": "03",
                "icon": "sparkles",
                "title": "Speak from day one",
                "desc": (
                    "You will say real Greek out loud in your very first "
                    "lesson. Reading the αλφάβητο comes fast."
                ),
            },
        ],
    },
    "levels_alphabet": {
        "eyebrow": "Find your level",
        "title": "Everyone starts at alpha",
        "sub": (
            "Wherever you are today, there is a clear, gentle path "
            "forward — at exactly your pace."
        ),
        "levels": [
            {
                "g": "α",
                "name": "Beginner",
                "desc": "You are starting from zero — and that is the perfect place to be.",
                "items": [
                    "The Greek alphabet",
                    "Greetings and introductions",
                    "Ordering a coffee in Greek",
                ],
            },
            {
                "g": "β",
                "name": "Intermediate",
                "desc": "You know the basics and want to truly talk.",
                "items": [
                    "Past and future tenses",
                    "Everyday conversations",
                    "Reading short stories",
                ],
            },
            {
                "g": "γ",
                "name": "Advanced",
                "desc": "Polish, nuance, and real fluency.",
                "items": [
                    "Idioms and humour",
                    "Debating and opinions",
                    "Greek news and cinema",
                ],
            },
        ],
    },
    "pricing_grid": {
        "eyebrow": "Simple pricing",
        "title": "Lessons that fit your life",
        "sub": "No lock-in, no hidden fees. Just good teaching at a fair price.",
        "featured_ribbon": "★ Most loved",
    },
    "about_portrait": {
        "eyebrow": "Meet your teacher",
        "signoff_template": "— <b>{firstName}</b>, your teacher",
        "cta_label": "Book your first lesson",
    },
    "reviews_grid": {
        "eyebrow": "Loved by learners",
        "title_pre": "From first ",
        "title_gr": "γεια σου",
        "title_post": " to real conversations",
        "sub": "A few words from students around the world.",
        "see_all_label": "See all reviews",
    },
}


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
        log.info("Updated theme custom-vasso id=%s (structure-only payload)", existing.id)
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
    log.info("Created theme custom-vasso id=%s (structure-only payload)", row.id)
    return row


def _upsert_page_sections(session: Session, tutor_id: int) -> None:
    """Idempotent — one row per section_type for the tutor. Position
    matches the theme layout so the page builder shows them in the
    same order the public site does."""
    type_to_pos = {item["section_type"]: item["position"] for item in LAYOUT}

    existing_rows = session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == tutor_id)
    ).all()
    by_type: dict[str, TutorPageSection] = {}
    for r in existing_rows:
        by_type[r.section_type.value] = r

    now = datetime.now(UTC)

    for stype_str, content in VASSO_CONTENT.items():
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
        vasso = session.exec(
            select(User).where(User.email == VASSO_EMAIL)
        ).first()
        if vasso is None:
            log.error("User %s not found — onboard her first", VASSO_EMAIL)
            return 2
        tutor = session.exec(
            select(Tutor).where(Tutor.user_id == vasso.id)
        ).first()
        if tutor is None:
            log.error("Tutor row for %s not found", VASSO_EMAIL)
            return 2

        theme = _upsert_theme(session, owner_user_id=vasso.id)
        _upsert_page_sections(session, tutor_id=tutor.id)

        print(f"Theme id: {theme.id}, key: {theme.theme_key}")
        print(f"TutorPageSection rows seeded for tutor {tutor.id} ({tutor.tutor_slug})")
        return 0


if __name__ == "__main__":
    sys.exit(main())
