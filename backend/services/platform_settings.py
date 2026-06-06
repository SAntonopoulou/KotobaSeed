"""Platform settings store — typed accessors over the PlatformSetting table.

Settings are stored as JSON strings keyed by string. Reads cache nothing —
SQLite is fast enough for this and writes go through admin endpoints that
don't happen often. The accessors here typecheck JSON for callers so
routers don't have to.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from ..models import PlatformSetting

log = logging.getLogger(__name__)


# Known social network keys — the footer reads these. Adding a new social
# network is: register the key here, add an icon in the frontend Footer.
SOCIAL_KEYS = (
    "social.instagram",
    "social.tiktok",
    "social.x",
    "social.bluesky",
    "social.facebook",
    "social.youtube",
    "social.linkedin",
)

# Other keys the platform reads from settings.
SETTING_SUPPORT_EMAIL = "platform.support_email"
SETTING_FOOTER_TAGLINE = "platform.footer_tagline"


def get_setting(session: Session, key: str) -> Any | None:
    row = session.exec(
        select(PlatformSetting).where(PlatformSetting.key == key)
    ).first()
    if row is None or row.value_json is None:
        return None
    try:
        return json.loads(row.value_json)
    except (TypeError, ValueError):
        log.warning("Setting %s has invalid JSON, returning None.", key)
        return None


def set_setting(
    session: Session,
    key: str,
    value: Any,
    *,
    updated_by_user_id: int | None = None,
) -> None:
    encoded = json.dumps(value) if value is not None else "null"
    row = session.exec(
        select(PlatformSetting).where(PlatformSetting.key == key)
    ).first()
    if row is None:
        row = PlatformSetting(
            key=key,
            value_json=encoded,
            updated_at=datetime.now(UTC),
            updated_by_user_id=updated_by_user_id,
        )
    else:
        row.value_json = encoded
        row.updated_at = datetime.now(UTC)
        row.updated_by_user_id = updated_by_user_id
    session.add(row)
    session.commit()


def get_social_links(session: Session) -> dict[str, str]:
    """Return the curated social link map for the public footer.

    Empty strings + nulls are filtered so the frontend can simply iterate
    the dict and render one icon per non-blank entry.
    """
    out: dict[str, str] = {}
    for key in SOCIAL_KEYS:
        value = get_setting(session, key)
        if isinstance(value, str) and value.strip():
            # The dict key shown to the frontend is the suffix after `social.`
            short = key.split(".", 1)[1]
            out[short] = value.strip()
    return out
