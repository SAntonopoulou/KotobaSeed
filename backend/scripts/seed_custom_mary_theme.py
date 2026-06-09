"""Seed the `mary-meadow` custom theme + Mary's matching TutorPageSection
content.

Mary's theme inspiration:
  - Cottagecore + folklore-letter mood — sage + blush + cream + honey
  - DM Serif Display for headlines, Quicksand for body, Caveat for the
    handwritten wordmark + signatures
  - Subtle cat-and-garden motif used as quiet flourishes (paw-rest divider,
    "letter from your teacher" framing) — never on-the-nose
  - English + Greek both centred — Mary teaches both

Like Vasso's pack, the theme owns STRUCTURE (which variant treats each
section + palette + fonts + chrome). Mary owns CONTENT in her
TutorPageSection rows.

Idempotent on theme_key + on (tutor_id, section_type). Re-run to update
in place — useful when tuning copy.

    docker compose exec backend python -m backend.scripts.seed_custom_mary_theme
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

MARY_EMAIL = "sophiawillowood+mary@gmail.com"
THEME_KEY = "custom-mary"
THEME_NAME = "Mary's Meadow"


PALETTE = {
    # Warm rose — the primary "love letter" pink. Saturated enough to
    # carry brand identity without being candy-bright.
    "--brand": "#c66578",
    "--brand-hover": "#a84d60",
    # Honey accent — warm late-afternoon sun. Used for ribbons, links,
    # the wordmark.
    "--accent": "#d9a856",
    "--accent-hover": "#bd8a3a",
    # Cream background — paper of a handwritten letter.
    "--bg": "#faf3e7",
    # Surface — slightly cooler white so the cream backdrop reads as
    # something the cards sit ON, not blend into.
    "--surface": "#ffffff",
    # Forest-charcoal text — easy on cream, warm enough to feel cosy.
    "--fg": "#3a4733",
    "--fg-muted": "#6d7665",
    # Sage border — quiet leaf-stem green for hairlines + dividers.
    "--border": "#cdd6c4",
    # Lavender hint — used sparingly on the about + reviews sections to
    # add a folklore touch without taking over.
    "--lavender": "#b5a4d4",
    # Sage swatch for variant components that need a saturated foil.
    "--sage": "#93a88f",
}

FONTS = {
    "url": (
        "https://fonts.googleapis.com/css2"
        "?family=DM+Serif+Display:ital@0;1"
        "&family=Quicksand:wght@400;500;600;700"
        "&family=Caveat:wght@500;600;700"
        "&display=swap"
    ),
    "display": "DM Serif Display",
    "body": "Quicksand",
    "logo": "Caveat",
    "chrome": {
        "wordmark": {"l1": "Learn with", "l2": "Mary"},
        "tagline_top": "English + Greek, the cottagecore way",
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
                "Slow, warm, one-to-one lessons in English and Greek — "
                "for grown-ups who want to learn at a kind pace."
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
                        ["About Mary", "/#about"],
                        ["Lessons", "/#pricing"],
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


# Structure-only layout. Variant keys carry the `mary_` prefix — they are
# Mary's bespoke pack and are not available to any other tutor.
LAYOUT = [
    {"section_type": "hero_portrait", "variant_key": "mary_love_letter", "position": 0, "is_visible": True},
    {"section_type": "features_grid", "variant_key": "mary_postcard_stack", "position": 1, "is_visible": True},
    {"section_type": "levels_alphabet", "variant_key": "mary_garden_beds", "position": 2, "is_visible": True},
    {"section_type": "pricing_grid", "variant_key": "mary_tea_party", "position": 3, "is_visible": True},
    {"section_type": "about_portrait", "variant_key": "mary_letter_box", "position": 4, "is_visible": True},
    {"section_type": "reviews_grid", "variant_key": "mary_scrapbook", "position": 5, "is_visible": True},
]


MARY_CONTENT = {
    "hero_portrait": {
        "eyebrow": "1-to-1 English & Greek lessons",
        "headline_pre": "A letter for the learner",
        "headline_serif": "who's ready to begin.",
        "sub": (
            "Hi, I'm Mary. I teach English and Greek to grown-ups who want "
            "to actually understand the language, not just memorise lists. "
            "Bring your tea — we'll start at exactly your level and go at "
            "exactly your pace."
        ),
        "primary_cta_label": "Book a free trial",
        "secondary_cta_label": "Read the journal",
        "secondary_cta_href": "/articles",
        "languages_chip_label": "English · Ελληνικά",
        "signature": "— Mary",
        "stamp_label": "Slow lessons",
        "stamp_sub": "Real progress",
    },
    "features_grid": {
        "eyebrow": "How it works",
        "title_pre": "Three little postcards on ",
        "title_serif": "how we begin",
        "sub": (
            "No big classroom, no surprise quizzes. Just three small "
            "promises about how we'll work together."
        ),
        "steps": [
            {
                "n": "01",
                "icon": "calendar",
                "title": "We pick a steady time",
                "desc": (
                    "Same slot each week, or move it when life happens. "
                    "Lessons should fit your life, not the other way round."
                ),
            },
            {
                "n": "02",
                "icon": "heart",
                "title": "We start at exactly your level",
                "desc": (
                    "Whether you're at a, β, or somewhere quietly in "
                    "between — we begin where you actually are."
                ),
            },
            {
                "n": "03",
                "icon": "leaf",
                "title": "You speak from the very first lesson",
                "desc": (
                    "Reading and rules come, but real sentences come "
                    "first. You'll leave your trial with one good one."
                ),
            },
        ],
    },
    "levels_alphabet": {
        "eyebrow": "Find your level",
        "title_pre": "Three garden beds —",
        "title_serif": "begin in any of them",
        "sub": (
            "I teach English and Greek across all three levels. Pick the "
            "one that sounds like you today; we adjust together as we go."
        ),
        "levels": [
            {
                "g": "α",
                "name": "First seeds",
                "desc": "Brand new to the language — and that's the perfect place to start.",
                "items": [
                    "The Greek (or English) alphabet",
                    "Greetings, polite phrases, ordering coffee",
                    "Your first real sentences out loud",
                ],
            },
            {
                "g": "β",
                "name": "Growing season",
                "desc": "You know the basics; now you want to genuinely talk.",
                "items": [
                    "Past + future tenses, without the panic",
                    "Everyday conversations, slowly fluent",
                    "Reading short stories together",
                ],
            },
            {
                "g": "γ",
                "name": "Full bloom",
                "desc": "Nuance, humour, and the little flourishes of real fluency.",
                "items": [
                    "Idioms, jokes, and small talk",
                    "Confident opinions and gentle debate",
                    "Books, films, songs — the good stuff",
                ],
            },
        ],
    },
    "pricing_grid": {
        "eyebrow": "Lessons",
        "title": "Pick a lesson that feels right",
        "sub": (
            "Honest prices and no lock-in. Most learners start with a "
            "single trial and move to a weekly slot from there."
        ),
        "featured_ribbon": "✿ Most loved",
    },
    "about_portrait": {
        "eyebrow": "Meet your teacher",
        "headline_pre": "A letter from ",
        "headline_serif": "Mary",
        "signoff_template": "With warm regards,<br/><b>{firstName}</b>",
        "cta_label": "Book a first lesson",
    },
    "reviews_grid": {
        "eyebrow": "Quiet praise",
        "title_pre": "Notes from the ",
        "title_serif": "kitchen table",
        "sub": "Small kind words from learners who keep coming back.",
        "see_all_label": "Read every review",
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
    by_type: dict[str, TutorPageSection] = {
        r.section_type.value: r for r in existing_rows
    }

    now = datetime.now(UTC)

    for stype_str, content in MARY_CONTENT.items():
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
        mary = session.exec(
            select(User).where(User.email == MARY_EMAIL)
        ).first()
        if mary is None:
            log.error("User %s not found — onboard her first", MARY_EMAIL)
            return 2
        tutor = session.exec(
            select(Tutor).where(Tutor.user_id == mary.id)
        ).first()
        if tutor is None:
            log.error("Tutor row for %s not found", MARY_EMAIL)
            return 2

        theme = _upsert_theme(session, owner_user_id=mary.id)
        _upsert_page_sections(session, tutor_id=tutor.id)

        # Apply the custom theme to Mary's tutor row.
        tutor.active_theme_id = theme.id
        tutor.theme = THEME_KEY
        session.add(tutor)
        session.commit()

        print(f"Theme id: {theme.id}, key: {theme.theme_key}")
        print(f"TutorPageSection rows seeded for tutor {tutor.id} ({tutor.tutor_slug})")
        print(f"Mary's tutor.active_theme_id = {tutor.active_theme_id}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
