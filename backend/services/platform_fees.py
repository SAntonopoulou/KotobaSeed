"""Platform fee calculation for tutor revenue events.

Two separate schedules:
- Live lessons (bookings): 5% / 5% / 0% / 0% — only Pro and Business
  break free. Lower fee because Stripe Connect already takes a cut and
  we have no hosting cost.
- Static content (lesson modules, premium homework): 10% / 7% / 5% / 0%
  — stepped so each tier has a clear upgrade incentive, and because we
  pay ongoing hosting + storage costs for whatever they sell. Business
  pays nothing as part of their school-tier package.

Both are computed as a percentage of the gross amount the student paid;
the rest flows to the tutor's Connect account via Stripe's Application
Fee mechanism.
"""

from __future__ import annotations

from ..models import SubscriptionTier, User

# Static-content (modules, premium homework) fees per tier.
_CONTENT_FEE_RATE: dict[SubscriptionTier, float] = {
    SubscriptionTier.FREE: 0.10,
    SubscriptionTier.PLUS: 0.07,
    SubscriptionTier.PRO: 0.05,
    SubscriptionTier.BUSINESS: 0.0,
}


def content_platform_fee(tutor_user: User, amount_cents: int) -> int:
    """Return the platform fee (in cents) for a content sale by this tutor.

    Bands: Free 10%, Plus 7%, Pro 5%, Business 0%. Unknown tier (should
    never happen because the SubscriptionTier enum is exhaustive) defaults
    to the Free rate so we never undercharge.
    """
    rate = _CONTENT_FEE_RATE.get(tutor_user.subscription_tier, 0.10)
    return round(amount_cents * rate)


def lesson_platform_fee(tutor_user: User, amount_cents: int) -> int:
    """Return the platform fee for a live lesson by this tutor.

    Bands: Free 5%, Plus 5%, Pro 0%, Business 0%. Mirrors the existing
    `_platform_fee_for` helper in tutor_site.py — kept here so callers
    don't need to know about that internal name.
    """
    if tutor_user.subscription_tier in (SubscriptionTier.PRO, SubscriptionTier.BUSINESS):
        return 0
    return round(amount_cents * 0.05)
