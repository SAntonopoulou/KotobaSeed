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


def _api_key() -> str:
    """Pull the key from settings on every call.

    Setting `stripe.api_key` at module-load is fragile under uvicorn
    `--reload` and multi-importer scenarios (e.g. pledges.py also touches
    the SDK), so we explicitly hand it to each call instead.
    """
    return settings.stripe_secret_key


def create_express_account(*, email: str, country: str | None = None) -> str:
    """Create a Stripe Connect Express account, return the new `acct_...` id."""
    account = stripe.Account.create(
        api_key=_api_key(),
        type="express",
        country=country or settings.default_connect_country,
        email=email,
        capabilities={
            "transfers": {"requested": True},
            "card_payments": {"requested": True},
        },
    )
    return account["id"]


def fetch_account(*, account_id: str) -> dict:
    """Pull the live Account from Stripe, returning a plain dict.

    Used by /onboarding/tutor/status to self-heal when an account.updated
    webhook didn't reach us. StripeObject overrides __getattr__ in a way
    that breaks `.get()`, so we extract just what we need into a real
    dict so callers can use dict idioms safely.
    """
    account = stripe.Account.retrieve(account_id, api_key=_api_key())
    return {
        "id": account.id,
        "charges_enabled": bool(account.charges_enabled),
        "payouts_enabled": bool(account.payouts_enabled),
        "details_submitted": bool(getattr(account, "details_submitted", False)),
    }


def create_onboarding_link(*, account_id: str) -> str:
    """Return a Stripe-hosted URL the tutor visits to do KYC.

    Stripe-issued AccountLinks expire quickly — refresh via this same
    function each time the user clicks "continue setup".
    """
    link = stripe.AccountLink.create(
        api_key=_api_key(),
        account=account_id,
        return_url=settings.connect_onboarding_return_url,
        refresh_url=settings.connect_onboarding_refresh_url,
        type="account_onboarding",
    )
    return link["url"]
