"""One-shot onboarding for Vasso's showcase tutor account.

Creates:
  * User row with the provided email, a freshly generated password, the
    creator role, GDPR consent + email verification stamped so she
    doesn't have to walk a verification flow.
  * Tutor row at slug ``vasso`` with the seeded display name + bio.
  * AdminGrant of kind TIER_UPGRADE → Pro, expiring 365 days from now.
    The grant is activated immediately so her subscription_tier flips
    to PRO and subscription_expires_at gets set.

Idempotent on email: if the email already exists, no changes are made
and the script prints a hint that the account is already there.

Hard-coded defaults are at the top — edit them if you need a different
slug or display name before running.

    docker compose exec backend python -m backend.scripts.onboard_vasso

The generated password is printed once; nothing else surfaces it.
"""

from __future__ import annotations

import argparse
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
    Tutor,
    TutorAccountStatus,
    User,
    UserRole,
)
from ..security import get_password_hash
from ..services.admin_grants import activate_grant

log = logging.getLogger(__name__)

VASSO_EMAIL = "santonopoulou93@gmail.com"
VASSO_SLUG = "vasso"
VASSO_DISPLAY_NAME = "Vasso"
VASSO_BIO = (
    "Greek tutor and creator behind Greek with Vasso. I work with adult "
    "learners on speaking fluently, accent and pronunciation, and the "
    "everyday Greek you won't find in a textbook."
)
VASSO_LANGUAGES = "Greek, English"
VASSO_THEME = "vasso-greek"


def _gen_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _find_admin(session: Session) -> User:
    admin = session.exec(
        select(User).where(User.email == settings.admin_email)
    ).first()
    if admin is None:
        raise RuntimeError(
            f"Admin user {settings.admin_email!r} not found — wipe was too aggressive?"
        )
    return admin


def onboard(session: Session, dry_run: bool = False) -> dict:
    existing = session.exec(
        select(User).where(User.email == VASSO_EMAIL)
    ).first()
    if existing is not None:
        log.warning(
            "User %s already exists (id=%s) — script is idempotent, doing nothing",
            VASSO_EMAIL,
            existing.id,
        )
        return {"created": False, "user_id": existing.id}

    admin = _find_admin(session)
    now = datetime.now(UTC)
    expires = now + timedelta(days=365)
    password = _gen_password()

    user = User(
        email=VASSO_EMAIL,
        hashed_password=get_password_hash(password),
        full_name=VASSO_DISPLAY_NAME,
        role=UserRole.TUTOR,
        is_active=True,
        email_verified_at=now,
        gdpr_consent_at=now,
        timezone="Europe/Athens",
        bio=VASSO_BIO,
        languages=VASSO_LANGUAGES,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Tutor row at the fixed slug so we can flip greekwithvasso.com at it
    # later. ACTIVE status so the marketplace listing eligibility logic
    # treats her as live.
    tutor = Tutor(
        user_id=user.id,
        tutor_slug=VASSO_SLUG,
        display_name=VASSO_DISPLAY_NAME,
        bio=VASSO_BIO,
        languages_taught=VASSO_LANGUAGES,
        theme=VASSO_THEME,
        account_status=TutorAccountStatus.ACTIVE,
        marketplace_listing_enabled=True,
        cancellation_cutoff_hours=24,
    )
    session.add(tutor)
    session.commit()
    session.refresh(tutor)

    # AdminGrant — TIER_UPGRADE → Pro for 1 year. Activated immediately
    # so subscription_tier flips now (and the cron sweep won't try to
    # re-activate). Revocation cleanly restores FREE when the year ends.
    grant = AdminGrant(
        granted_to_user_id=user.id,
        granted_by_user_id=admin.id,
        kind=AdminGrantKind.TIER_UPGRADE,
        payload_json=json.dumps({"tier": "pro"}),
        expires_at=expires,
        status=AdminGrantStatus.ACTIVE,
        reason="Founder showcase — 1-year complimentary Pro for the launch case study tutor",
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
        "password": password,
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
            print("Would create user:", VASSO_EMAIL)
            print("Would set tier: pro for 365 days")
            return 0
        result = onboard(session)

    print()
    print("=" * 60)
    if result.get("created"):
        print(" Vasso onboarded.")
        print("=" * 60)
        print(f"  Tenant URL : https://{result['tutor_slug']}.kotobaseed.net/")
        print(f"  Login email: {VASSO_EMAIL}")
        print(f"  Password   : {result['password']}")
        print(f"  Pro until  : {result['expires_at']}")
        print(f"  Tier       : {result['subscription_tier']}")
        print("=" * 60)
        print(" Share the password securely (1Password / signal). It is")
        print(" only printed here — there is no retrieval path.")
        print("=" * 60)
    else:
        print(" Already onboarded.")
        print("=" * 60)
        print(f"  user_id: {result['user_id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
