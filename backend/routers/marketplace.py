"""Apex marketplace directory.

Cross-tenant browse so students discover tutors they wouldn't otherwise
have found. Lives at /marketplace/* and explicitly does NOT use the
CurrentTutor dep — these endpoints respond on the apex host (no tenant
resolved) and walk the Tutor table directly.

Listing rules:
- Tutor.account_status == ACTIVE (no pending KYC, no paused, no dormant)
- Tutor.list_in_marketplace is True (opt-out by tutor)
- Their User has a verified email and is_active (no abandoned signups)

Each tutor's headline single-lesson pack (is_default_single=True) is
pulled in to give the listing card a price + duration. Tutors who haven't
set one up yet still show but without the price chip.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..models import LessonPack, Tutor, TutorAccountStatus, User
from ..services.demo_isolation import exclude_cross_env_users

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


class MarketplaceTutorCard(BaseModel):
    tutor_slug: str
    display_name: str
    photo_url: str | None
    bio: str | None
    languages_taught: str | None
    # Headline single-lesson — nullable when the tutor hasn't set one up.
    single_lesson_price_cents: int | None
    single_lesson_duration_minutes: int | None
    single_lesson_currency: str | None
    offers_free_trial: bool
    free_trial_minutes: int | None
    # The full URL to their tutor site (subdomain or custom domain).
    site_url: str


def _tutor_site_url(tutor: Tutor) -> str:
    """Prefer verified custom_domain, fall back to subdomain. The frontend
    has its own `tutorSiteUrl` helper for client-side links; this is the
    server-side equivalent for the listing payload so the browser doesn't
    need to know about platform routing rules."""
    if tutor.custom_domain and tutor.custom_domain_verified_at is not None:
        # Custom domains always use https — DNS points at our TLS termination.
        return f"https://{tutor.custom_domain}"
    frontend = settings.frontend_url.rstrip("/")
    if "localhost" in frontend:
        # Dev: subdomain-on-localhost pattern.
        return f"http://{tutor.tutor_slug}.localhost:5173"
    if "://" in frontend:
        scheme, rest = frontend.split("://", 1)
        return f"{scheme}://{tutor.tutor_slug}.{rest}"
    return f"https://{tutor.tutor_slug}.{frontend}"


def _languages_match(languages_taught: str | None, filter_lang: str) -> bool:
    """Comma/pipe/semicolon-delimited free text → case-insensitive contains."""
    if not languages_taught:
        return False
    needle = filter_lang.strip().lower()
    if not needle:
        return True
    return needle in languages_taught.lower()


@router.get("/tutors", response_model=list[MarketplaceTutorCard])
def list_marketplace_tutors(
    session: Annotated[Session, Depends(get_session)],
    language: str | None = Query(None, max_length=80),
    max_price_cents: int | None = Query(None, ge=0, le=10_000_00),
    trial_only: bool = Query(False),
) -> list[MarketplaceTutorCard]:
    """Public — listing of opt-in active tutors with optional filters.

    Filters compose: language is a case-insensitive substring match against
    User.languages (free-text field). max_price_cents filters out tutors
    whose headline single-lesson exceeds the cap. trial_only keeps only
    tutors who offer a free trial. Tutors with no headline price set are
    still returned unless max_price_cents is given.
    """
    # Foundational demo/real split — production hides demo accounts'
    # tutors, staging hides real accounts' tutors. Without this filter
    # the marketplace listing would mix the two pools.
    tutor_stmt = (
        select(Tutor)
        .join(User, User.id == Tutor.user_id)
        .where(
            Tutor.account_status == TutorAccountStatus.ACTIVE,
            Tutor.list_in_marketplace == True,  # noqa: E712
        )
    )
    tutor_stmt = exclude_cross_env_users(tutor_stmt)
    tutors = list(session.exec(tutor_stmt).all())
    if not tutors:
        return []

    # Bulk-load related rows in two queries rather than N+1.
    user_ids = [t.user_id for t in tutors]
    users_by_id: dict[int, User] = {
        u.id: u
        for u in session.exec(
            select(User).where(User.id.in_(user_ids))
        ).all()
    }
    tutor_ids = [t.id for t in tutors]
    single_packs_by_tutor: dict[int, LessonPack] = {}
    for pack in session.exec(
        select(LessonPack).where(
            LessonPack.tutor_id.in_(tutor_ids),
            LessonPack.is_default_single == True,  # noqa: E712
            LessonPack.is_active == True,  # noqa: E712
        )
    ).all():
        single_packs_by_tutor[pack.tutor_id] = pack

    results: list[MarketplaceTutorCard] = []
    for tutor in tutors:
        user = users_by_id.get(tutor.user_id)
        # Skip tutors whose owner is deactivated or unverified — they
        # shouldn't surface even if their Tutor row is technically active.
        if user is None or not user.is_active or user.email_verified_at is None:
            continue
        if trial_only and not tutor.offers_free_trial:
            continue
        languages_taught = user.languages if user else None
        if language and not _languages_match(languages_taught, language):
            continue
        pack = single_packs_by_tutor.get(tutor.id)
        if max_price_cents is not None and pack is not None and pack.price_cents > max_price_cents:
            continue
        results.append(
            MarketplaceTutorCard(
                tutor_slug=tutor.tutor_slug,
                display_name=tutor.display_name,
                photo_url=user.avatar_url if user else None,
                bio=user.bio if user else None,
                languages_taught=languages_taught,
                single_lesson_price_cents=pack.price_cents if pack else None,
                single_lesson_duration_minutes=pack.duration_minutes if pack else None,
                single_lesson_currency=pack.currency if pack else None,
                offers_free_trial=tutor.offers_free_trial,
                free_trial_minutes=tutor.free_trial_minutes if tutor.offers_free_trial else None,
                site_url=_tutor_site_url(tutor),
            )
        )

    # Sort: tutors offering trials first (highest student-conversion signal),
    # then alphabetical by display name. Deterministic for now — paid
    # featuring/sponsorship slots can layer on later.
    results.sort(key=lambda r: (not r.offers_free_trial, r.display_name.lower()))
    return results


@router.get("/languages", response_model=list[str])
def list_marketplace_languages(
    session: Annotated[Session, Depends(get_session)],
) -> list[str]:
    """Distinct languages currently taught across the listed tutors —
    powers the language filter dropdown on the directory page. Case-
    insensitive dedup; preserves the spelling of the first occurrence."""
    seen_lower: set[str] = set()
    languages: list[str] = []
    lang_stmt = (
        select(User.languages)
        .join(Tutor, Tutor.user_id == User.id)
        .where(
            Tutor.account_status == TutorAccountStatus.ACTIVE,
            Tutor.list_in_marketplace == True,  # noqa: E712
            User.is_active == True,  # noqa: E712
            User.email_verified_at != None,  # noqa: E711
            User.languages != None,  # noqa: E711
        )
    )
    lang_stmt = exclude_cross_env_users(lang_stmt)
    rows = session.exec(lang_stmt).all()
    for raw in rows:
        if not raw:
            continue
        # Languages are stored as free-text; split on common separators.
        for piece in raw.replace(";", ",").replace("|", ",").split(","):
            name = piece.strip()
            if not name:
                continue
            key = name.lower()
            if key in seen_lower:
                continue
            seen_lower.add(key)
            languages.append(name)
    languages.sort(key=str.lower)
    return languages
