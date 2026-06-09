"""One-shot onboarding for Mary's premier-tutor showcase account.

Creates:
  * User row with the provided email, the supplied password, the TUTOR
    role, GDPR consent + email verification stamped so she doesn't have
    to walk a verification flow.
  * Tutor row at slug ``mary`` with the seeded display name + bio.
  * AdminGrant of kind TIER_UPGRADE → Pro, expiring 365 days from now,
    activated immediately. Status ACTIVE so the admin panel can pause /
    extend / revoke it like any other grant. The cron sweep will revert
    cleanly to FREE when the year ends if Sophia doesn't extend.

Idempotent on email: if the user already exists, no changes are made
and the script prints a hint that the account is already there.

    docker compose exec backend python -m backend.scripts.onboard_mary
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from ..config import settings
from ..database import engine
from ..models import (
    AdminGrant,
    AdminGrantKind,
    AdminGrantStatus,
    Tutor,
    TutorAccountStatus,
    User,
    UserRole,
)
from ..security import get_password_hash
from ..services.admin_grants import activate_grant

log = logging.getLogger(__name__)

MARY_EMAIL = "sophiawillowood+mary@gmail.com"
MARY_PASSWORD = "ilovecats"
MARY_SLUG = "mary"
MARY_DISPLAY_NAME = "Mary"
MARY_BIO = (
    "Bilingual English and Greek tutor with a soft spot for stories, "
    "cats, and slow afternoons. I work with adult learners who want "
    "warm one-to-one lessons and a real human pace — no big classrooms, "
    "no shouted vocabulary lists, just steady weekly progress and a "
    "teacher who notices what you actually need."
)
MARY_LANGUAGES = "English, Greek"
MARY_THEME = "custom-mary"


def _find_admin(session: Session) -> User:
    admin = session.exec(
        select(User).where(User.email == settings.admin_email)
    ).first()
    if admin is None:
        raise RuntimeError(
            f"Admin user {settings.admin_email!r} not found"
        )
    return admin


def onboard(session: Session, dry_run: bool = False) -> dict:
    existing = session.exec(
        select(User).where(User.email == MARY_EMAIL)
    ).first()
    if existing is not None:
        log.warning(
            "User %s already exists (id=%s) — script is idempotent, doing nothing",
            MARY_EMAIL,
            existing.id,
        )
        return {"created": False, "user_id": existing.id}

    admin = _find_admin(session)
    now = datetime.now(UTC)
    expires = now + timedelta(days=365)

    user = User(
        email=MARY_EMAIL,
        hashed_password=get_password_hash(MARY_PASSWORD),
        full_name=MARY_DISPLAY_NAME,
        role=UserRole.TUTOR,
        is_active=True,
        email_verified_at=now,
        gdpr_consent_at=now,
        timezone="Europe/Athens",
        bio=MARY_BIO,
        languages=MARY_LANGUAGES,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    tutor = Tutor(
        user_id=user.id,
        tutor_slug=MARY_SLUG,
        display_name=MARY_DISPLAY_NAME,
        bio=MARY_BIO,
        languages_taught=MARY_LANGUAGES,
        theme=MARY_THEME,
        account_status=TutorAccountStatus.ACTIVE,
        marketplace_listing_enabled=True,
        cancellation_cutoff_hours=24,
    )
    session.add(tutor)
    session.commit()
    session.refresh(tutor)

    grant = AdminGrant(
        granted_to_user_id=user.id,
        granted_by_user_id=admin.id,
        kind=AdminGrantKind.TIER_UPGRADE,
        payload_json=json.dumps({"tier": "pro"}),
        expires_at=expires,
        status=AdminGrantStatus.ACTIVE,
        reason="Premier tutor showcase — 1-year complimentary Pro for the launch case study tutor (Mary).",
    )
    session.add(grant)
    session.commit()
    session.refresh(grant)
    activate_grant(session, grant)
    session.commit()
    session.refresh(user)

    log.info("Created user_id=%s tutor_id=%s grant_id=%s", user.id, tutor.id, grant.id)
    return {
        "created": True,
        "user_id": user.id,
        "tutor_id": tutor.id,
        "tutor_slug": tutor.tutor_slug,
        "grant_id": grant.id,
        "expires_at": expires.isoformat(),
        "subscription_tier": user.subscription_tier.value,
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with Session(engine) as session:
        if args.dry_run:
            print("Would create user:", MARY_EMAIL)
            print("Would set tier: pro for 365 days")
            return 0
        result = onboard(session)

    print()
    print("=" * 60)
    if result.get("created"):
        print(" Mary onboarded.")
        print("=" * 60)
        print(f"  Tenant URL : https://{result['tutor_slug']}.kotobaseed.net/")
        print(f"  Login email: {MARY_EMAIL}")
        print("  Password   : (as supplied at signup)")
        print(f"  Pro until  : {result['expires_at']}")
        print(f"  Tier       : {result['subscription_tier']}")
        print(f"  Grant id   : {result['grant_id']}")
        print("=" * 60)
        print(" The AdminGrant is visible in /admin/grants — pause,")
        print(" extend or revoke it from there whenever you need to.")
        print("=" * 60)
    else:
        print(" Already onboarded.")
        print("=" * 60)
        print(f"  user_id: {result['user_id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
