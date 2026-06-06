"""Provision the Kotobaseed Stripe Products + Prices for tutor + student
subscription tiers.

Run once after wiring a live Stripe account, before flipping the platform
to live mode.

    cd backend && python -m scripts.setup_stripe_products

The script is idempotent — Products with a matching `name` are re-used
and Prices that already exist with matching unit_amount + currency are
not re-created. Print the resulting `*_PRICE_ID` env vars you should put
in your `.env`.
"""

from __future__ import annotations

import os
import sys

import stripe

# Tiered subscriptions. Edit cents to update — re-runs do NOT migrate
# existing subscribers; Stripe locks them at signup price.
TIERS: list[dict] = [
    {
        "env_var": "STRIPE_PLUS_PRICE_ID",
        "name": "Kotobaseed Plus",
        "amount_cents": 500,
        "currency": "eur",
        "interval": "month",
    },
    {
        "env_var": "STRIPE_PRO_PRICE_ID",
        "name": "Kotobaseed Pro",
        "amount_cents": 1500,
        "currency": "eur",
        "interval": "month",
    },
    {
        "env_var": "STRIPE_BUSINESS_PRICE_ID",
        "name": "Kotobaseed Business",
        "amount_cents": 4500,
        "currency": "eur",
        "interval": "month",
    },
]


def _api_key() -> str:
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        print("error: STRIPE_SECRET_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)
    return key


def _find_or_create_product(*, name: str) -> dict:
    api = _api_key()
    page = stripe.Product.list(api_key=api, limit=100, active=True)
    for product in page["data"]:
        if product["name"] == name:
            return product
    return stripe.Product.create(api_key=api, name=name)


def _find_or_create_price(*, product_id: str, amount_cents: int, currency: str, interval: str) -> dict:
    api = _api_key()
    page = stripe.Price.list(api_key=api, product=product_id, active=True, limit=100)
    for price in page["data"]:
        if (
            price.get("unit_amount") == amount_cents
            and price.get("currency") == currency
            and price.get("recurring", {}).get("interval") == interval
        ):
            return price
    return stripe.Price.create(
        api_key=api,
        product=product_id,
        unit_amount=amount_cents,
        currency=currency,
        recurring={"interval": interval},
    )


def main() -> None:
    print("Provisioning Stripe products + prices…\n")
    for tier in TIERS:
        product = _find_or_create_product(name=tier["name"])
        price = _find_or_create_price(
            product_id=product["id"],
            amount_cents=tier["amount_cents"],
            currency=tier["currency"],
            interval=tier["interval"],
        )
        print(
            f"  ✓ {tier['name']:24} {tier['amount_cents'] / 100:>6.2f} "
            f"{tier['currency'].upper()}/{tier['interval']}  → {price['id']}"
        )
        print(f"     {tier['env_var']}={price['id']}")
    print("\nAdd the above *_PRICE_ID lines to your .env then restart the backend.")


if __name__ == "__main__":
    main()
