"""Curated theme bundles for tutor public sites.

A theme is a key + display label + short description. The actual colour
values live in the frontend (frontend/src/themes.css) — backend's only job
is to validate the key tutors choose. Keys are kept in sync between this
module and the CSS class names by convention.

Free + Plus tutors stay on `sage` (the platform default). PATCHing the
theme requires Pro+, gated in routers/tutor_site.py.
"""

from __future__ import annotations

from typing import TypedDict


class ThemeDef(TypedDict):
    key: str
    label: str
    description: str


THEMES: list[ThemeDef] = [
    {
        "key": "sage",
        "label": "Sage",
        "description": "Warm green with honey-gold accents. The Kotobaseed default.",
    },
    {
        "key": "midnight",
        "label": "Midnight study",
        "description": "Deep navy with cream accents. Calm, scholarly.",
    },
    {
        "key": "sakura",
        "label": "Sakura",
        "description": "Soft pink with charcoal text. Gentle and inviting.",
    },
    {
        "key": "sunlight",
        "label": "Sunlight",
        "description": "Goldenrod with dark teal. Bright and energetic.",
    },
    {
        "key": "aegean",
        "label": "Aegean",
        "description": "Mediterranean blue and white. Coastal and crisp.",
    },
    {
        "key": "slate",
        "label": "Slate",
        "description": "Modern grey with electric blue. Clean and technical.",
    },
    # vasso-greek used to appear here as a showcase. It's now superseded by
    # the per-tutor `custom-vasso` v2 theme (owner-locked via owner_user_id
    # so only Vasso sees it in the picker). Bespoke palettes for paying
    # customers should NEVER appear in the universal catalogue.
]

# `vasso-greek` is still accepted as a valid theme key for back-compat —
# any existing tutor row on it keeps rendering correctly via the themed
# routes. New tutors can't pick it because it's not in THEMES.
THEME_KEYS: set[str] = {theme["key"] for theme in THEMES} | {"vasso-greek"}
DEFAULT_THEME: str = "sage"
