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
    """Create a Stripe Connect Express account, return the new `acct_...` id.

    Payout schedule is set to a rolling 14-day delay so we have a buffer
    against chargebacks before money leaves the platform. Tutors see this
    in their Stripe dashboard; we set it on creation so they can't
    accidentally switch it back. The value is read from
    `settings.connect_payout_delay_days` so we can tune it without a deploy.
    """
    # Test-mode short-circuit: when the backend is booted with
    # ENVIRONMENT=test (Playwright + pytest fixtures), we don't talk to
    # the real Stripe API. A deterministic fake account id is enough to
    # exercise every downstream path that just needs *some* id.
    # Belt-and-suspenders: refuse to use the deterministic stub if a
    # real Stripe key looks configured. A leaked ENVIRONMENT=test in
    # prod would otherwise silently mint fake "acct_test_*" ids that
    # the rest of the system treats as real.
    if settings.environment == "test":
        key = (settings.stripe_secret_key or "").strip()
        if key.startswith("sk_live_"):
            raise RuntimeError(
                "Refusing to use Stripe test stub: a live secret key is configured."
            )
        import secrets
        return f"acct_test_{secrets.token_hex(8)}"
    delay = settings.connect_payout_delay_days
    payout_schedule: dict | None = None
    if delay > 0:
        payout_schedule = {
            "interval": "daily",
            "delay_days": delay,
        }
    create_kwargs: dict = {
        "api_key": _api_key(),
        "type": "express",
        "country": country or settings.default_connect_country,
        "email": email,
        "capabilities": {
            "transfers": {"requested": True},
            "card_payments": {"requested": True},
        },
    }
    if payout_schedule is not None:
        create_kwargs["settings"] = {"payouts": {"schedule": payout_schedule}}
    account = stripe.Account.create(**create_kwargs)
    return account["id"]


def apply_payout_schedule(*, account_id: str) -> None:
    """Re-apply the configured payout delay to an existing Connect account.

    Useful for legacy accounts created before the platform-default delay
    was introduced. Safe to call repeatedly — Stripe accepts idempotent
    schedule updates."""
    delay = settings.connect_payout_delay_days
    if delay <= 0:
        return
    try:
        stripe.Account.modify(
            account_id,
            api_key=_api_key(),
            settings={
                "payouts": {
                    "schedule": {"interval": "daily", "delay_days": delay}
                }
            },
        )
    except Exception:
        log.exception(
            "Failed to apply payout schedule to Connect account %s", account_id
        )


def fetch_account(*, account_id: str) -> dict:
    """Pull the live Account from Stripe, returning a plain dict.

    Used by /onboarding/tutor/status to self-heal when an account.updated
    webhook didn't reach us. StripeObject overrides __getattr__ in a way
    that breaks `.get()`, so we extract just what we need into a real
    dict so callers can use dict idioms safely.
    """
    # Belt-and-suspenders: refuse to use the deterministic stub if a
    # real Stripe key looks configured. A leaked ENVIRONMENT=test in
    # prod would otherwise silently mint fake "acct_test_*" ids that
    # the rest of the system treats as real.
    if settings.environment == "test":
        key = (settings.stripe_secret_key or "").strip()
        if key.startswith("sk_live_"):
            raise RuntimeError(
                "Refusing to use Stripe test stub: a live secret key is configured."
            )
        # Test-mode tutors are auto-verified so Playwright specs can move
        # straight from signup to booking without orchestrating webhooks.
        return {
            "id": account_id,
            "charges_enabled": True,
            "payouts_enabled": True,
            "details_submitted": True,
        }
    account = stripe.Account.retrieve(account_id, api_key=_api_key())
    return {
        "id": account.id,
        "charges_enabled": bool(account.charges_enabled),
        "payouts_enabled": bool(account.payouts_enabled),
        "details_submitted": bool(getattr(account, "details_submitted", False)),
    }


def create_onboarding_link(*, account_id: str, locale: str | None = None) -> str:
    """Return a Stripe-hosted URL the tutor visits to do KYC.

    Stripe-issued AccountLinks expire quickly — refresh via this same
    function each time the user clicks "continue setup".

    ``locale`` controls the language of Stripe's hosted onboarding page.
    Without it Stripe falls back to the connected account's country,
    which is why Sophia's partner saw the page in Greek even when she
    spoke English. Pass an ISO-639 code like ``"en"``; Stripe ignores
    anything it doesn't recognise.
    """
    # Belt-and-suspenders: refuse to use the deterministic stub if a
    # real Stripe key looks configured. A leaked ENVIRONMENT=test in
    # prod would otherwise silently mint fake "acct_test_*" ids that
    # the rest of the system treats as real.
    if settings.environment == "test":
        key = (settings.stripe_secret_key or "").strip()
        if key.startswith("sk_live_"):
            raise RuntimeError(
                "Refusing to use Stripe test stub: a live secret key is configured."
            )
        return f"https://stripe.test/onboarding/{account_id}"
    kwargs: dict = {
        "api_key": _api_key(),
        "account": account_id,
        "return_url": settings.connect_onboarding_return_url,
        "refresh_url": settings.connect_onboarding_refresh_url,
        "type": "account_onboarding",
    }
    if locale:
        kwargs["collection_options"] = {"future_requirements": "include", "fields": "currently_due"}
        # Stripe spells the field `locale` on AccountLink; passing the
        # 2-letter code is enough for the hosted page.
        kwargs["locale"] = locale[:5]
    link = stripe.AccountLink.create(**kwargs)
    return link["url"]
