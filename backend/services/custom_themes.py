"""CustomTheme service — pricing, application, and team-leave restore.

Pricing math, the theme-application side effect (rewriting all affected
tutors' TutorPageSection rows + active_theme_id), and the
"restore-personally-owned-theme-on-team-leave" helper consumed by
backend/services/team_protection.py.

Prices are stored in cents and snapshotted on the CustomThemeOrder at
order creation time, so a tutor's later subscription tier change can't
change what they owe on an existing commission.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from sqlmodel import Session, select

from ..models import (
    CustomTheme,
    CustomThemeOrder,
    CustomThemePackage,
    CustomThemeStatus,
    SubscriptionTier,
    Tutor,
    TutorPageSection,
    TutorPageSectionType,
    TutorTeam,
    User,
)

log = logging.getLogger(__name__)


# --- pricing ----------------------------------------------------------


# Base prices in cents per package.
_BASE_PRICE_CENTS = {
    CustomThemePackage.STANDARD: 149_900,  # €1,499
    CustomThemePackage.PREMIUM: 249_900,   # €2,499
}

# Per-tier discount as percent off the base price.
_TIER_DISCOUNT_PCT = {
    SubscriptionTier.FREE: 0,
    SubscriptionTier.PLUS: 0,
    SubscriptionTier.PRO: 30,
    SubscriptionTier.BUSINESS: 40,
}


def price_for(
    package: CustomThemePackage, tier: SubscriptionTier
) -> tuple[int, int, int]:
    """Return (total_cents, deposit_cents, discount_percent) for the
    package + tier combination. Deposit is always exactly half of the
    total. Splits round to the nearest cent so deposit + final == total.
    """
    base = _BASE_PRICE_CENTS[package]
    pct = _TIER_DISCOUNT_PCT.get(tier, 0)
    discounted = int(round(base * (100 - pct) / 100))
    deposit = discounted // 2  # half, rounded down
    return discounted, deposit, pct


# --- payload utilities ------------------------------------------------


def _decode_design(theme: CustomTheme) -> list[dict]:
    try:
        d = json.loads(theme.design_payload_json or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(d, list):
        return []
    return d


def _encode_design(sections: list[dict]) -> str:
    return json.dumps(sections)


# --- theme application -----------------------------------------------


def _replace_sections_for_tutor(
    session: Session, tutor: Tutor, sections: list[dict]
) -> None:
    """Wipe + recreate all TutorPageSection rows for a single tutor from
    the design payload. Used by both the personal-apply and team-apply
    paths."""
    existing = session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == tutor.id)
    ).all()
    for row in existing:
        session.delete(row)
    now = datetime.now(UTC)
    for idx, blob in enumerate(sections):
        if not isinstance(blob, dict):
            continue
        section_type_raw = blob.get("section_type")
        if section_type_raw is None:
            continue
        try:
            section_type = TutorPageSectionType(section_type_raw)
        except ValueError:
            continue
        content = blob.get("content")
        content_json = json.dumps(content) if isinstance(content, dict) else None
        section = TutorPageSection(
            tutor_id=tutor.id,
            section_type=section_type,
            position=int(blob.get("position", idx)),
            is_visible=bool(blob.get("is_visible", True)),
            content_json=content_json,
            created_at=now,
            updated_at=now,
        )
        session.add(section)


def apply_theme(
    *,
    session: Session,
    theme: CustomTheme,
    commit: bool = False,
) -> list[int]:
    """Write the theme's layout onto every affected tutor. Returns the
    list of tutor ids that were updated.

    - Personal theme (owner_user_id set): one tutor (the owner's Tutor row)
    - Team theme (owner_team_id set): every Tutor row in that team
    """
    sections = _decode_design(theme)
    targets: list[Tutor] = []

    if theme.owner_team_id is not None:
        rows = session.exec(
            select(Tutor).where(Tutor.team_id == theme.owner_team_id)
        ).all()
        targets.extend(rows)
    elif theme.owner_user_id is not None:
        tutor = session.exec(
            select(Tutor).where(Tutor.user_id == theme.owner_user_id)
        ).first()
        if tutor is not None:
            targets.append(tutor)

    updated: list[int] = []
    now = datetime.now(UTC)
    for tutor in targets:
        _replace_sections_for_tutor(session, tutor, sections)
        tutor.active_theme_id = theme.id
        tutor.updated_at = now
        session.add(tutor)
        updated.append(tutor.id)

    if updated:
        theme.status = CustomThemeStatus.READY
        theme.updated_at = now
        session.add(theme)

    if commit:
        session.commit()
    return updated


# --- team-leave restore ----------------------------------------------


def find_personal_theme_for(
    session: Session, user_id: int
) -> CustomTheme | None:
    """Return the user's most recent READY personally-owned theme, if any."""
    return session.exec(
        select(CustomTheme)
        .where(
            CustomTheme.owner_user_id == user_id,
            CustomTheme.status == CustomThemeStatus.READY,
        )
        .order_by(CustomTheme.updated_at.desc())
    ).first()


def restore_or_default_for_tutor(
    session: Session,
    tutor: Tutor,
    *,
    commit: bool = False,
) -> str:
    """Called when a tutor leaves a team. If the tutor has a READY
    personal CustomTheme of their own, apply it. Otherwise wipe their
    TutorPageSection rows so the platform default renders.

    Returns 'personal' or 'default' for the caller's audit log.
    """
    personal = find_personal_theme_for(session, tutor.user_id)
    if personal is not None:
        sections = _decode_design(personal)
        _replace_sections_for_tutor(session, tutor, sections)
        tutor.active_theme_id = personal.id
        tutor.updated_at = datetime.now(UTC)
        session.add(tutor)
        if commit:
            session.commit()
        return "personal"

    # Default-theme fallback — wipe rows + clear active_theme_id.
    existing = session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == tutor.id)
    ).all()
    for row in existing:
        session.delete(row)
    tutor.active_theme_id = None
    tutor.updated_at = datetime.now(UTC)
    session.add(tutor)
    if commit:
        session.commit()
    return "default"
