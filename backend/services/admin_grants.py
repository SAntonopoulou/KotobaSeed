"""Admin grant lifecycle — activate, revoke, sweep.

Routing for the actual side-effects of a comp:

  TIER_UPGRADE
    activate: stash User.subscription_tier in grant.previous_tier, set
              new tier + subscription_expires_at = grant.expires_at
    revoke  : restore previous_tier, clear expires_at if no other grant
              still wants the upgrade

  MINUTE_PACK
    activate: insert a MinutePack row with the granted minutes; remember
              its id in side_effect_ids_json
    revoke  : if pack still has minutes_remaining = minutes_purchased
              (untouched) → delete it. Otherwise clamp minutes_remaining
              to 0 so already-consumed minutes stay consumed.

  LESSON_CREDIT
    activate: increment User-level "lesson_credits_balance" — for v1 we
              hold these as a JSON ledger entry inside the grant's
              payload + the user's profile. (Future iteration: separate
              LessonCredit table mirroring MinutePack.) For now this is
              advisory; bookings router checks grants directly.
    revoke  : delete the entry.

  DISCOUNT
    activate: create a Stripe Coupon + attach to the user's next invoice
              via subscription metadata. For v1 we mint the coupon and
              return its id; admin then shares it with the user manually
              or it auto-applies if we wire the next checkout to look it up.

The cron job `sweep_expired_grants` runs daily and flips ACTIVE rows
whose expires_at < now into EXPIRED, calling the revoke side-effect.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from ..models import (
    AdminGrant,
    AdminGrantKind,
    AdminGrantStatus,
    MinutePack,
    SubscriptionTier,
    Tutor,
    User,
)

log = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(UTC)


def _decode_payload(grant: AdminGrant) -> dict[str, Any]:
    try:
        d = json.loads(grant.payload_json or "{}")
    except (TypeError, ValueError):
        return {}
    return d if isinstance(d, dict) else {}


def _decode_side_effects(grant: AdminGrant) -> list[int]:
    try:
        d = json.loads(grant.side_effect_ids_json or "[]")
    except (TypeError, ValueError):
        return []
    return [int(x) for x in d if isinstance(x, (int, str)) and str(x).isdigit()]


def _set_side_effects(grant: AdminGrant, ids: list[int]) -> None:
    grant.side_effect_ids_json = json.dumps(sorted(set(ids)))


# --- TIER_UPGRADE -----------------------------------------------------


def _activate_tier_upgrade(
    session: Session, user: User, grant: AdminGrant
) -> None:
    payload = _decode_payload(grant)
    target = (payload.get("tier") or "").lower()
    tier_map = {
        "plus": SubscriptionTier.PLUS,
        "pro": SubscriptionTier.PRO,
        "business": SubscriptionTier.BUSINESS,
    }
    next_tier = tier_map.get(target)
    if next_tier is None:
        raise ValueError(f"Unknown tier '{target}' in TIER_UPGRADE grant.")

    if grant.previous_tier is None:
        grant.previous_tier = user.subscription_tier.value
    user.subscription_tier = next_tier
    # Set the expiry on the User so the defensive guard in
    # User.is_pro_subscriber() picks it up even if a webhook stalls.
    if grant.expires_at is not None:
        user.subscription_expires_at = grant.expires_at
    session.add(user)


def _revoke_tier_upgrade(
    session: Session, user: User, grant: AdminGrant
) -> None:
    if grant.previous_tier is None:
        # Defensive: roll back to FREE if we can't find the original.
        user.subscription_tier = SubscriptionTier.FREE
    else:
        try:
            user.subscription_tier = SubscriptionTier(grant.previous_tier)
        except ValueError:
            user.subscription_tier = SubscriptionTier.FREE
    # Clear the temp expiry so a paid sub running in parallel isn't
    # accidentally cut short.
    user.subscription_expires_at = None
    session.add(user)


# --- MINUTE_PACK ------------------------------------------------------


def _activate_minute_pack(
    session: Session, user: User, grant: AdminGrant
) -> None:
    payload = _decode_payload(grant)
    minutes = int(payload.get("minutes") or 0)
    if minutes <= 0:
        raise ValueError("MINUTE_PACK grant needs a positive 'minutes' value.")
    tutor = session.exec(select(Tutor).where(Tutor.user_id == user.id)).first()
    if tutor is None:
        raise ValueError("Target user doesn't have a tutor profile.")

    pack = MinutePack(
        tutor_id=tutor.id,
        minutes_purchased=minutes,
        minutes_remaining=minutes,
        price_cents=0,
        currency="eur",
        stripe_checkout_session_id=None,
        stripe_payment_intent_id=f"admin_grant:{grant.id}",
    )
    session.add(pack)
    session.flush()
    _set_side_effects(grant, _decode_side_effects(grant) + [pack.id])


def _revoke_minute_pack(
    session: Session, user: User, grant: AdminGrant
) -> None:
    for pack_id in _decode_side_effects(grant):
        pack = session.get(MinutePack, pack_id)
        if pack is None:
            continue
        if pack.minutes_remaining >= pack.minutes_purchased:
            # Untouched — delete cleanly.
            session.delete(pack)
        else:
            # Partially consumed — let used minutes stay used.
            pack.minutes_remaining = 0
            session.add(pack)


# --- LESSON_CREDIT (advisory in v1) -----------------------------------


def _activate_lesson_credit(
    session: Session, user: User, grant: AdminGrant
) -> None:
    # v1: no separate ledger. Bookings router queries active grants of
    # this kind directly via `count_active_lesson_credits`. Materialising
    # a sibling table is straightforward to add later if usage spikes.
    pass


def _revoke_lesson_credit(
    session: Session, user: User, grant: AdminGrant
) -> None:
    pass


# --- DISCOUNT (mint Stripe coupon) ------------------------------------


def _activate_discount(
    session: Session, user: User, grant: AdminGrant
) -> None:
    # v1 stops at recording the grant. The next subscription checkout
    # for this user can read active DISCOUNT grants and pass coupon
    # parameters into the Checkout Session. Auto-minting the coupon at
    # grant time would need Stripe state to outlive grant revocation —
    # safer to lazy-mint at checkout.
    pass


def _revoke_discount(
    session: Session, user: User, grant: AdminGrant
) -> None:
    pass


# --- public dispatch --------------------------------------------------


def activate_grant(session: Session, grant: AdminGrant) -> None:
    """Apply the grant's side effects. Caller commits."""
    user = session.get(User, grant.granted_to_user_id)
    if user is None:
        raise ValueError(f"AdminGrant #{grant.id}: target user missing.")
    handler = {
        AdminGrantKind.TIER_UPGRADE: _activate_tier_upgrade,
        AdminGrantKind.MINUTE_PACK: _activate_minute_pack,
        AdminGrantKind.LESSON_CREDIT: _activate_lesson_credit,
        AdminGrantKind.DISCOUNT: _activate_discount,
    }[grant.kind]
    handler(session, user, grant)
    grant.updated_at = _now()
    session.add(grant)


def revoke_grant(
    session: Session, grant: AdminGrant, *, status_after: AdminGrantStatus
) -> None:
    """Undo the grant's side effects + flip status. Caller commits."""
    user = session.get(User, grant.granted_to_user_id)
    if user is None:
        log.warning("Revoking AdminGrant #%s but target user is gone.", grant.id)
    else:
        handler = {
            AdminGrantKind.TIER_UPGRADE: _revoke_tier_upgrade,
            AdminGrantKind.MINUTE_PACK: _revoke_minute_pack,
            AdminGrantKind.LESSON_CREDIT: _revoke_lesson_credit,
            AdminGrantKind.DISCOUNT: _revoke_discount,
        }[grant.kind]
        handler(session, user, grant)
    grant.status = status_after
    if status_after == AdminGrantStatus.REVOKED:
        grant.revoked_at = _now()
    elif status_after == AdminGrantStatus.EXPIRED:
        grant.expired_at = _now()
    grant.updated_at = _now()
    session.add(grant)


def sweep_expired_grants(session: Session) -> int:
    """Cron entry — auto-expire any time-gated grants whose window has
    closed. Returns the number of rows transitioned to EXPIRED."""
    now = _now()
    rows = session.exec(
        select(AdminGrant).where(
            AdminGrant.status == AdminGrantStatus.ACTIVE,
            AdminGrant.expires_at.is_not(None),
            AdminGrant.expires_at < now,
        )
    ).all()
    n = 0
    for grant in rows:
        revoke_grant(session, grant, status_after=AdminGrantStatus.EXPIRED)
        n += 1
    if n:
        session.commit()
        log.info("sweep_expired_grants: expired %d grant(s).", n)
    return n


def count_active_lesson_credits(session: Session, user_id: int) -> int:
    """Sum of unused free-lesson counts across the user's active
    LESSON_CREDIT grants. Used by the booking router to waive Stripe
    checkout when the student is on a contracted comp."""
    rows = session.exec(
        select(AdminGrant).where(
            AdminGrant.granted_to_user_id == user_id,
            AdminGrant.kind == AdminGrantKind.LESSON_CREDIT,
            AdminGrant.status == AdminGrantStatus.ACTIVE,
        )
    ).all()
    total = 0
    for r in rows:
        d = _decode_payload(r)
        total += int(d.get("count") or 0)
    return total


def consume_lesson_credit(
    session: Session,
    *,
    user_id: int,
    lesson_minutes: int,
) -> AdminGrant | None:
    """Decrement one lesson credit from the oldest active grant that
    permits a lesson of `lesson_minutes`. Returns the grant we drew from,
    or None if no eligible grant exists.

    If the grant's payload sets `max_lesson_minutes`, the duration must
    fit inside that ceiling — protects a "free trial credit" from being
    burned on a 3-hour intensive.

    When a grant's count reaches 0 it's flipped to CONSUMED automatically.
    Caller is expected to commit the surrounding transaction.
    """
    rows = session.exec(
        select(AdminGrant)
        .where(
            AdminGrant.granted_to_user_id == user_id,
            AdminGrant.kind == AdminGrantKind.LESSON_CREDIT,
            AdminGrant.status == AdminGrantStatus.ACTIVE,
        )
        .order_by(AdminGrant.created_at.asc())
    ).all()
    for grant in rows:
        d = _decode_payload(grant)
        cap = int(d.get("max_lesson_minutes") or 0)
        if cap and lesson_minutes > cap:
            continue
        count = int(d.get("count") or 0)
        if count < 1:
            continue
        d["count"] = count - 1
        grant.payload_json = json.dumps(d)
        if d["count"] <= 0:
            grant.status = AdminGrantStatus.CONSUMED
            grant.expired_at = _now()
        grant.updated_at = _now()
        session.add(grant)
        return grant
    return None


def find_unused_discount_grant(
    session: Session, user_id: int
) -> AdminGrant | None:
    """Return the oldest ACTIVE DISCOUNT grant for this user that hasn't
    yet had a Stripe coupon minted against it."""
    rows = session.exec(
        select(AdminGrant)
        .where(
            AdminGrant.granted_to_user_id == user_id,
            AdminGrant.kind == AdminGrantKind.DISCOUNT,
            AdminGrant.status == AdminGrantStatus.ACTIVE,
        )
        .order_by(AdminGrant.created_at.asc())
    ).all()
    for grant in rows:
        try:
            ids = json.loads(grant.side_effect_ids_json or "[]")
        except (TypeError, ValueError):
            ids = []
        if not ids:
            return grant
    return None


def mint_or_get_stripe_coupon_for_discount(
    grant: AdminGrant,
) -> str | None:
    """Mint a single-redemption Stripe Coupon from this grant's payload
    if we haven't yet, and stash the coupon id in side_effect_ids_json.
    Returns the coupon id (str) or None if the payload is malformed.
    """
    import os

    import stripe

    try:
        decoded = json.loads(grant.side_effect_ids_json or "[]")
        for item in decoded:
            if isinstance(item, str) and item:
                return item
    except (TypeError, ValueError):
        pass

    payload = _decode_payload(grant)
    api_key = os.environ.get("STRIPE_SECRET_KEY")
    if not api_key:
        log.error("Cannot mint discount coupon — STRIPE_SECRET_KEY not set.")
        return None

    params: dict = {
        "duration": "once",
        "max_redemptions": 1,
        "metadata": {"admin_grant_id": str(grant.id)},
    }
    if isinstance(payload.get("percent_off"), (int, float)):
        params["percent_off"] = float(payload["percent_off"])
    elif (
        isinstance(payload.get("amount_off_cents"), int)
        and payload.get("currency") in ("eur", "usd")
    ):
        params["amount_off"] = int(payload["amount_off_cents"])
        params["currency"] = payload["currency"]
    else:
        log.error("Discount grant #%s payload malformed.", grant.id)
        return None

    try:
        coupon = stripe.Coupon.create(api_key=api_key, **params)
    except Exception:
        log.exception("Stripe coupon mint failed for grant #%s", grant.id)
        return None

    grant.side_effect_ids_json = json.dumps([coupon.id])
    grant.updated_at = _now()
    return coupon.id


def mark_discount_used(session: Session, grant: AdminGrant) -> None:
    """Flip a DISCOUNT grant to CONSUMED after the Stripe coupon has been
    redeemed. Caller commits."""
    grant.status = AdminGrantStatus.CONSUMED
    grant.expired_at = _now()
    grant.updated_at = _now()
    session.add(grant)
