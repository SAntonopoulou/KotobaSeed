"""Single source of truth: Tutor.stripe_connect_account_id.

A tutor's Stripe Connect account powers two flows:

- **Tutor site (tenant subdomain)** — direct bookings, lesson packs,
  subscriptions. Reads `Tutor.stripe_connect_account_id`.
- **Marketplace (apex)** — CompInput-era project pledges. Historically
  reads the User's `stripe_account_id` + `charges_enabled` flags.

Until this sync existed the two could drift: a tutor finished Connect
onboarding (Tutor row updated), then tried to take a marketplace pledge
(User row still blank) and the pledge failed. This helper mirrors the
Tutor row into the User row whenever the Connect state changes, so a
tutor who's verified anywhere is verified everywhere.

The mirror is one-way (Tutor → User). The legacy User-side path stays
working for any pure-marketplace teacher who never created a Tutor row.
"""

from __future__ import annotations

from sqlmodel import Session

from ..models import Tutor, User


def sync_tutor_to_user(
    tutor: Tutor,
    session: Session,
    *,
    charges_enabled: bool | None = None,
    payouts_enabled: bool | None = None,
    commit: bool = False,
) -> User | None:
    """Mirror the tutor's Connect identifiers (and optionally capability
    flags) onto the owning User. No-op if the User doesn't exist or
    already matches.

    Pass `charges_enabled` / `payouts_enabled` from the webhook payload to
    keep the User's gate flags in sync; omit them when we only know the
    account id (signup time).
    """
    user = session.get(User, tutor.user_id)
    if user is None:
        return None

    dirty = False
    if tutor.stripe_connect_account_id and user.stripe_account_id != tutor.stripe_connect_account_id:
        user.stripe_account_id = tutor.stripe_connect_account_id
        dirty = True
    if charges_enabled is not None and user.charges_enabled != charges_enabled:
        user.charges_enabled = charges_enabled
        dirty = True
    if payouts_enabled is not None and user.payouts_enabled != payouts_enabled:
        user.payouts_enabled = payouts_enabled
        dirty = True

    if dirty:
        session.add(user)
        if commit:
            session.commit()
    return user
