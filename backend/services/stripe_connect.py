"""Stripe Connect Express helpers.

Thin wrappers around `stripe.Account.create` + `stripe.AccountLink.create`.
Each tutor gets a separate Connect Express account they own; the platform
takes a cut via Application Fees on tutor-to-student payments.

Keep this module skinny — orchestration (transactional create-User-then-
create-Account-then-create-Tutor) lives in the onboarding router so it can
roll back DB state cleanly when Stripe fails.
"""

from __future__ import annotations

import logging

import stripe

from ..config import settings

log = logging.getLogger(__name__)

stripe.api_key = settings.stripe_secret_key


def create_express_account(*, email: str, country: str | None = None) -> str:
    """Create a Stripe Connect Express account, return the new `acct_...` id.

    Capabilities: `transfers` (receive payouts), `card_payments` (accept
    cards via Connect Checkout). Business profile is left blank — the
    tutor completes it during Stripe-hosted KYC.
    """
    account = stripe.Account.create(
        type="express",
        country=country or settings.default_connect_country,
        email=email,
        capabilities={
            "transfers": {"requested": True},
            "card_payments": {"requested": True},
        },
    )
    return account["id"]


def create_onboarding_link(*, account_id: str) -> str:
    """Return a single-use Stripe-hosted URL the tutor visits to do KYC.

    Stripe-issued AccountLinks expire quickly — refresh via this same
    function each time the user clicks "continue setup".
    """
    link = stripe.AccountLink.create(
        account=account_id,
        return_url=settings.connect_onboarding_return_url,
        refresh_url=settings.connect_onboarding_refresh_url,
        type="account_onboarding",
    )
    return link["url"]
