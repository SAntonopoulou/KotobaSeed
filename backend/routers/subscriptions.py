import datetime  # Import datetime module
import logging  # Import logging module
import os
import traceback  # Import traceback for detailed error logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database import get_session
from backend.deps import get_current_user
from backend.models import PriorityCredit, SubscriptionTier, User

logger = logging.getLogger(__name__)  # Initialize logger


class SubscriptionCreate(BaseModel):
    plan_id: str


router = APIRouter(
    prefix="/subscriptions",
    tags=["Subscriptions"],
)

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

# Use FRONTEND_URL for consistency with pledges router
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


# Per-plan trial windows. Plus is student-side and goes live immediately;
# Pro / Business kick off a 14-day trial so tutors can verify their
# Stripe Connect and feel the full feature set before being charged.
_TRIAL_DAYS = {"plus": 0, "pro": 14, "business": 14}


@router.post("/create-checkout-session")
async def create_checkout_session(
    plan_data: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
):
    """Legacy alias — the frontend now calls `/subscriptions/checkout`.
    Kept so older clients don't 404 mid-flight."""
    return await _create_checkout(
        plan=plan_data.plan_id, billing="monthly", current_user=current_user
    )


class CheckoutRequest(BaseModel):
    plan: str  # 'plus' | 'pro' | 'business'
    billing: str = "monthly"  # 'monthly' | 'annual'


@router.post("/checkout")
async def create_checkout(
    payload: CheckoutRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout Session for one of the platform tiers.

    Supports monthly / annual billing and applies the per-plan trial
    window. Card-on-file is required for the trial (Stripe Checkout
    enforces this when `mode=subscription` and `payment_method_collection`
    is left at its default 'always').
    """
    return await _create_checkout(
        plan=payload.plan, billing=payload.billing, current_user=current_user
    )


async def _create_checkout(*, plan: str, billing: str, current_user: User) -> dict:
    plan_key = (plan or "").lower()
    if plan_key not in ("plus", "pro", "business"):
        raise HTTPException(status_code=400, detail="Invalid plan.")
    if billing not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="Invalid billing cadence.")

    env_key = (
        f"STRIPE_{plan_key.upper()}_PRICE_ID"
        if billing == "monthly"
        else f"STRIPE_{plan_key.upper()}_ANNUAL_PRICE_ID"
    )
    price_id = os.environ.get(env_key)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{plan_key.title()} {billing} pricing isn't configured. "
                "Contact support."
            ),
        )

    session_params: dict = {
        "line_items": [{"price": price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": f"{FRONTEND_URL}/dashboard?subscription=success",
        "cancel_url": f"{FRONTEND_URL}/pricing?subscription=cancelled",
        "client_reference_id": str(current_user.id),
        # The metadata reaches our webhook on customer.subscription.created.
        "subscription_data": {
            "metadata": {
                "plan": plan_key,
                "billing": billing,
                "user_id": str(current_user.id),
            },
        },
    }

    # Admin DISCOUNT comp — attach the user's unused discount coupon if any.
    try:
        from sqlmodel import Session as _Sess

        from .. import database as _db
        from ..services import admin_grants as _ag
        with _Sess(_db.engine) as _s:
            grant = _ag.find_unused_discount_grant(_s, current_user.id)
            if grant is not None:
                coupon_id = _ag.mint_or_get_stripe_coupon_for_discount(grant)
                if coupon_id:
                    session_params["discounts"] = [{"coupon": coupon_id}]
                    session_params["subscription_data"]["metadata"][
                        "admin_grant_id"
                    ] = str(grant.id)
                    _s.add(grant)
                    _s.commit()
                    logger.info(
                        "Attached admin discount grant #%s coupon=%s for user %s",
                        grant.id,
                        coupon_id,
                        current_user.id,
                    )
    except Exception:
        logger.exception(
            "Discount grant lookup failed for user %s — proceeding without it.",
            current_user.id,
        )

    trial_days = _TRIAL_DAYS.get(plan_key, 0)
    if trial_days > 0:
        session_params["subscription_data"]["trial_period_days"] = trial_days
        # Force a payment method even though the first charge is delayed.
        session_params["payment_method_collection"] = "always"

    if current_user.stripe_customer_id:
        session_params["customer"] = current_user.stripe_customer_id
    else:
        session_params["customer_email"] = current_user.email

    try:
        checkout_session = stripe.checkout.Session.create(**session_params)
    except Exception as e:
        logger.error("Error creating checkout session: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from None
    return {"url": checkout_session.url, "checkout_url": checkout_session.url}


@router.post("/stripe-webhook")
async def stripe_webhook(request: Request, session: Session = Depends(get_session)):
    """
    Listens for events from Stripe.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    event = None

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, os.environ.get("STRIPE_SUBSCRIPTIONS_WEBHOOK_SECRET")
        )
    except ValueError:
        logger.error(f"Invalid payload: {payload.decode()}")
        raise HTTPException(status_code=400, detail="Invalid payload") from None
    except stripe.error.SignatureVerificationError:
        logger.error(f"Invalid signature: {sig_header}")
        raise HTTPException(status_code=400, detail="Invalid signature") from None
    except Exception as e:
        logger.error(f"Error constructing Stripe event: {e}\nPayload: {payload.decode()}")
        raise HTTPException(status_code=400, detail="Error processing webhook") from None

    # Handle the event
    try:
        if event["type"] == "checkout.session.completed":
            checkout_session = event["data"]["object"]
            client_reference_id = checkout_session.get("client_reference_id")
            customer_id = checkout_session.get("customer")

            if client_reference_id and customer_id:
                user = session.get(User, int(client_reference_id))
                if user:
                    if not user.stripe_customer_id:
                        user.stripe_customer_id = customer_id
                        session.add(user)
                        session.commit()
                        logger.info(f"User {user.id}: Stripe customer ID {customer_id} saved.")
                    else:
                        logger.info(
                            f"User {user.id}: Stripe customer ID already set to {user.stripe_customer_id}."
                        )
                else:
                    logger.warning(
                        f"checkout.session.completed: User not found for client_reference_id {client_reference_id}"
                    )
            else:
                logger.warning(
                    f"checkout.session.completed: Missing client_reference_id or customer_id. Payload: {checkout_session}"
                )

        elif event["type"] == "invoice.payment_succeeded":
            invoice = event["data"]["object"]
            customer_id = invoice.get("customer")
            if customer_id:
                user = session.exec(
                    select(User).where(User.stripe_customer_id == customer_id)
                ).first()
                if user:
                    subscription_id = None

                    # Attempt to get from invoice.parent.subscription_details.subscription
                    parent_obj = invoice.get("parent")
                    if parent_obj:
                        subscription_details_obj = parent_obj.get("subscription_details")
                        if subscription_details_obj:
                            subscription_id = subscription_details_obj.get("subscription")
                            if subscription_id:
                                logger.info(
                                    f"Found subscription ID from invoice.parent.subscription_details.subscription: {subscription_id}"
                                )

                    # Fallback: iterate through invoice lines if not found directly
                    if not subscription_id:
                        lines_data = invoice.get("lines", {}).get("data")
                        if lines_data:
                            for line in lines_data:
                                line_parent_obj = line.get("parent")
                                if line_parent_obj:
                                    line_subscription_details_obj = line_parent_obj.get(
                                        "subscription_item_details"
                                    )
                                    if line_subscription_details_obj:
                                        subscription_id = line_subscription_details_obj.get(
                                            "subscription"
                                        )
                                        if subscription_id:
                                            logger.info(
                                                f"Found subscription ID from invoice line.parent.subscription_item_details.subscription: {subscription_id}"
                                            )
                                            break

                    if not subscription_id:
                        logger.error(
                            f"invoice.payment_succeeded: Could not find subscription ID in invoice. Invoice ID: {invoice.id}"
                        )
                        raise HTTPException(
                            status_code=500, detail="Subscription ID not found in invoice."
                        )

                    subscription = stripe.Subscription.retrieve(subscription_id)
                    plan_id = subscription.plan.id

                    if plan_id == os.environ.get("STRIPE_PLUS_PRICE_ID"):
                        user.subscription_tier = SubscriptionTier.PLUS
                        # Plus now owns the monthly priority credit grant.
                        credit = PriorityCredit(user_id=user.id)
                        session.add(credit)
                        logger.info(
                            f"User {user.id}: Added PriorityCredit for Plus subscription."
                        )
                    elif plan_id == os.environ.get("STRIPE_PRO_PRICE_ID"):
                        user.subscription_tier = SubscriptionTier.PRO
                    elif plan_id == os.environ.get("STRIPE_BUSINESS_PRICE_ID"):
                        user.subscription_tier = SubscriptionTier.BUSINESS
                        # Auto-provision the TutorTeam on first Business
                        # activation so the owner can invite seats right
                        # away. The helper is idempotent — repeat events
                        # don't create duplicate teams.
                        from ..services import teams as _teams
                        _teams.ensure_team_for_owner(session, user)

                    current_period_end = None
                    if subscription.get("items") and subscription.get("items").get("data"):
                        items_data = subscription.get("items").get("data")
                        if items_data and len(items_data) > 0:
                            current_period_end = items_data[0].get("current_period_end")

                    if current_period_end:
                        user.subscription_expires_at = datetime.datetime.fromtimestamp(
                            current_period_end, tz=datetime.UTC
                        )
                    else:
                        logger.warning(
                            f"Subscription object {subscription_id} is missing 'current_period_end' in its items."
                        )

                    session.add(user)
                    session.commit()
                    logger.info(
                        f"User {user.id}: Subscription updated to {user.subscription_tier.value}, expires {user.subscription_expires_at}."
                    )
                else:
                    logger.warning(
                        f"invoice.payment_succeeded: User not found for Stripe customer ID {customer_id}"
                    )
            else:
                logger.warning(
                    f"invoice.payment_succeeded: Missing customer_id. Payload: {invoice}"
                )

        elif event["type"] in (
            "customer.subscription.created",
            "customer.subscription.updated",
        ):
            # Trial + active state needs to flip the user's tier IMMEDIATELY
            # so they can use the features they're paying (or trialing) for.
            # The invoice.payment_succeeded handler above keeps running for
            # post-trial billing — this is the trial-start + cancellation
            # mid-cycle path. We deliberately only ACT on terminal-ish
            # status values so we don't churn the tier on every transient
            # past_due retry.
            sub_obj = event["data"]["object"]
            customer_id = sub_obj.get("customer")
            sub_status = sub_obj.get("status")
            user = session.exec(
                select(User).where(User.stripe_customer_id == customer_id)
            ).first()
            if user is None:
                logger.warning(
                    f"customer.subscription.{event['type']}: user not found for {customer_id}"
                )
            else:
                # Resolve the tier from the plan id on the first item.
                items = (sub_obj.get("items") or {}).get("data") or []
                plan_id = None
                current_period_end = None
                if items:
                    plan_id = (items[0].get("price") or {}).get("id")
                    current_period_end = items[0].get("current_period_end")
                tier: SubscriptionTier | None = None
                if plan_id in (
                    os.environ.get("STRIPE_PLUS_PRICE_ID"),
                    os.environ.get("STRIPE_PLUS_ANNUAL_PRICE_ID"),
                ):
                    tier = SubscriptionTier.PLUS
                elif plan_id in (
                    os.environ.get("STRIPE_PRO_PRICE_ID"),
                    os.environ.get("STRIPE_PRO_ANNUAL_PRICE_ID"),
                ):
                    tier = SubscriptionTier.PRO
                elif plan_id in (
                    os.environ.get("STRIPE_BUSINESS_PRICE_ID"),
                    os.environ.get("STRIPE_BUSINESS_ANNUAL_PRICE_ID"),
                ):
                    tier = SubscriptionTier.BUSINESS

                if sub_status in ("trialing", "active") and tier is not None:
                    user.subscription_tier = tier
                    if current_period_end:
                        user.subscription_expires_at = (
                            datetime.datetime.fromtimestamp(
                                current_period_end, tz=datetime.UTC
                            )
                        )
                    # Mirror the Business auto-provision path from the
                    # invoice handler so trialing Business owners get a
                    # team they can invite into during day 1.
                    if tier == SubscriptionTier.BUSINESS:
                        from ..services import teams as _teams
                        _teams.ensure_team_for_owner(session, user)
                    # If this subscription was checked out with an admin
                    # DISCOUNT grant attached, flip the grant to CONSUMED
                    # so the same coupon can't be re-used.
                    grant_id_meta = (sub_obj.get("metadata") or {}).get(
                        "admin_grant_id"
                    )
                    if grant_id_meta:
                        try:
                            from ..models import AdminGrant as _AG
                            from ..services import admin_grants as _ag
                            grant_row = session.get(_AG, int(grant_id_meta))
                            if grant_row is not None:
                                _ag.mark_discount_used(session, grant_row)
                        except (TypeError, ValueError):
                            pass
                    session.add(user)
                    session.commit()
                    logger.info(
                        f"User {user.id}: tier→{tier.value} via subscription.{event['type']} (status={sub_status})"
                    )
                elif sub_status in ("canceled", "incomplete_expired", "unpaid"):
                    user.subscription_tier = SubscriptionTier.FREE
                    user.subscription_expires_at = None
                    session.add(user)
                    session.commit()
                    logger.info(
                        f"User {user.id}: tier→FREE via subscription.{event['type']} (status={sub_status})"
                    )
                else:
                    logger.info(
                        f"User {user.id}: subscription.{event['type']} status={sub_status}, no tier change."
                    )

        elif event["type"] == "customer.subscription.deleted":
            logger.info(
                f"customer.subscription.deleted event received for customer {event['data']['object']['customer']}"
            )
            subscription = event["data"]["object"]
            user = session.exec(
                select(User).where(User.stripe_customer_id == subscription["customer"])
            ).first()
            if user:
                user.subscription_tier = SubscriptionTier.FREE
                user.subscription_expires_at = None
                session.add(user)
                session.commit()
                logger.info(f"User {user.id}: Subscription downgraded to NONE.")
            else:
                logger.warning(
                    f"customer.subscription.deleted: User not found for Stripe customer ID {subscription['customer']}"
                )
        else:
            logger.info(f"Unhandled event type: {event['type']}")
    except Exception as e:
        logger.error(
            f"Error processing Stripe webhook event '{event['type']}': {e}\n{traceback.format_exc()}"
        )
        session.rollback()
        raise HTTPException(status_code=500, detail="Error processing webhook event") from None

    return {"status": "success"}


@router.get("/customer-portal")
async def customer_portal(current_user: User = Depends(get_current_user)):
    """
    Creates and returns a URL for a Stripe Billing Portal session.
    """
    try:
        if not current_user.stripe_customer_id:
            raise HTTPException(status_code=400, detail="User does not have a Stripe customer ID.")

        portal_session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=f"{FRONTEND_URL}/settings?tab=subscription",
        )
        return {"url": portal_session.url}
    except Exception as e:
        logger.error(f"Error creating customer portal session for user {current_user.id}: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from None
