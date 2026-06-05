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


@router.post("/create-checkout-session")
async def create_checkout_session(
    plan_data: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Creates a Stripe Checkout Session for a recurring subscription.
    """
    try:
        price_ids = {
            "plus": os.environ.get("STRIPE_PLUS_PRICE_ID"),
            "premium": os.environ.get("STRIPE_PREMIUM_PRICE_ID"),
            "pro": os.environ.get("STRIPE_PRO_PRICE_ID"),
        }
        price_id = price_ids.get(plan_data.plan_id)

        if not price_id:
            raise HTTPException(status_code=400, detail="Invalid plan ID.")

        session_params = {
            "line_items": [{"price": price_id, "quantity": 1}],
            "mode": "subscription",
            "success_url": f"{FRONTEND_URL}/dashboard?subscription=success",
            "cancel_url": f"{FRONTEND_URL}/pricing?subscription=cancelled",
            "client_reference_id": str(current_user.id),
        }

        if current_user.stripe_customer_id:
            session_params["customer"] = current_user.stripe_customer_id
        else:
            pass

        checkout_session = stripe.checkout.Session.create(**session_params)
        return {"url": checkout_session.url}
    except Exception as e:
        logger.error(f"Error creating checkout session: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from None


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
                    elif plan_id == os.environ.get("STRIPE_PREMIUM_PRICE_ID"):
                        user.subscription_tier = SubscriptionTier.PREMIUM
                        credit = PriorityCredit(user_id=user.id)
                        session.add(credit)
                        logger.info(
                            f"User {user.id}: Added PriorityCredit for Premium subscription."
                        )
                    elif plan_id == os.environ.get("STRIPE_PRO_PRICE_ID"):
                        user.subscription_tier = SubscriptionTier.PRO

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

        elif event["type"] == "customer.subscription.deleted":
            logger.info(
                f"customer.subscription.deleted event received for customer {event['data']['object']['customer']}"
            )
            subscription = event["data"]["object"]
            user = session.exec(
                select(User).where(User.stripe_customer_id == subscription["customer"])
            ).first()
            if user:
                user.subscription_tier = SubscriptionTier.NONE
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
