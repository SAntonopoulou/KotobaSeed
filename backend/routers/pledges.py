import logging
import os
import traceback
from datetime import UTC, datetime

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import Notification, Pledge, PledgeStatus, Project, ProjectRating, ProjectStatus, User
from ..security import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

stripe.api_key = STRIPE_SECRET_KEY
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

router = APIRouter(prefix="/pledges", tags=["pledges"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PledgeRequest(BaseModel):
    project_id: int
    amount: int


class PledgeRead(BaseModel):
    id: int
    amount: int
    status: PledgeStatus
    created_at: datetime
    project_id: int
    project_title: str
    project_status: ProjectStatus
    has_rated: bool = False

    model_config = ConfigDict(from_attributes=True)


class PublicPledgeHistory(BaseModel):
    project_id: int
    project_title: str
    created_at: datetime


@router.post("/", status_code=201)
def create_pledge_checkout_session(
    pledge_in: PledgeRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Phase 1: Create a PENDING pledge and a Stripe Checkout Session.
    """
    project = session.get(Project, pledge_in.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != ProjectStatus.FUNDING:
        raise HTTPException(status_code=400, detail="Project is not active for funding")

    # Create a pending pledge record
    pending_pledge = Pledge(
        user_id=current_user.id,
        project_id=project.id,
        amount=pledge_in.amount,
        status=PledgeStatus.PENDING,
    )
    session.add(pending_pledge)
    session.commit()
    session.refresh(pending_pledge)

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {
                            "name": f"Pledge for '{project.title}'",
                        },
                        "unit_amount": pledge_in.amount,
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=f"{FRONTEND_URL}/student/dashboard?payment=success",
            cancel_url=f"{FRONTEND_URL}/projects/{project.id}?payment=cancelled",
            client_reference_id=str(pending_pledge.id),
        )

        pending_pledge.checkout_session_id = checkout_session.id
        session.add(pending_pledge)
        session.commit()

        return {"checkout_url": checkout_session.url}
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error during checkout session creation: {e}")
        session.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from None


@router.get("/me", response_model=list[PledgeRead])
def list_my_pledges(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    statement = (
        select(Pledge)
        .where(Pledge.user_id == current_user.id)
        .options(selectinload(Pledge.project))
        .order_by(Pledge.created_at.desc())
    )
    pledges = session.exec(statement).all()

    results = []
    for p in pledges:
        project_title = p.project.title if p.project else "Unknown Project"
        project_status = p.project.status if p.project else ProjectStatus.CANCELLED

        has_rated = False
        if p.project and p.project.status == ProjectStatus.COMPLETED:
            rating_exists = session.exec(
                select(ProjectRating)
                .where(ProjectRating.project_id == p.project_id)
                .where(ProjectRating.user_id == current_user.id)
            ).first()
            if rating_exists:
                has_rated = True

        results.append(
            PledgeRead(
                id=p.id,
                amount=p.amount,
                status=p.status,
                created_at=p.created_at,
                project_id=p.project_id,
                project_title=project_title,
                project_status=project_status,
                has_rated=has_rated,
            )
        )
    return results


@router.get("/user/{user_id}", response_model=list[PublicPledgeHistory])
def get_user_pledges(user_id: int, session: Session = Depends(get_session)):
    statement = (
        select(Pledge)
        .where(Pledge.user_id == user_id)
        .options(selectinload(Pledge.project))
        .order_by(Pledge.created_at.desc())
    )
    pledges = session.exec(statement).all()

    results = []
    for p in pledges:
        if p.project:
            results.append(
                PublicPledgeHistory(
                    project_id=p.project.id, project_title=p.project.title, created_at=p.created_at
                )
            )
    return results


def handle_checkout_session_completed(session: Session, data_object: dict):
    metadata = data_object.get("metadata", {})
    if metadata.get("type") == "tip":
        try:
            teacher_id = int(metadata["teacher_id"])
            project_id = int(metadata["project_id"])
            amount = data_object.get("amount_total", 0)

            project = session.get(Project, project_id)
            if project:
                project.total_tipped_amount += amount
                session.add(project)

                notification = Notification(
                    user_id=teacher_id,
                    message=f"You received a tip of €{amount / 100:.2f} for your project '{project.title}'!",
                    link=f"/projects/{project_id}",
                )
                session.add(notification)
                session.commit()
        except (KeyError, ValueError, TypeError) as e:
            logger.error(
                f"Error processing tip webhook: Missing or invalid metadata. {e}\n{traceback.format_exc()}"
            )
            session.rollback()
    else:
        client_reference_id = data_object.get("client_reference_id")
        if not client_reference_id:
            logger.error(
                "Webhook error: checkout.session.completed event is missing 'client_reference_id' for a pledge."
            )
            return

        try:
            pledge_id = int(client_reference_id)
            pledge = session.get(Pledge, pledge_id)
            if not pledge or pledge.status != PledgeStatus.PENDING:
                status_val = pledge.status if pledge else "Not Found"
                logger.warning(
                    f"Webhook for non-pending or non-existent pledge ID: {pledge_id}. Status: {status_val}"
                )
                return

            pledge.status = PledgeStatus.CAPTURED
            pledge.payment_intent_id = data_object.get("payment_intent")

            project = session.get(Project, pledge.project_id)
            if project:
                project.current_funding += pledge.amount
                session.add(project)

                notification = Notification(
                    user_id=project.teacher_id,
                    message=f"You received a new pledge of €{pledge.amount / 100:.2f} for your project '{project.title}'!",
                    link=f"/projects/{project.id}",
                )
                session.add(notification)

                if (
                    project.current_funding >= project.funding_goal
                    and project.status == ProjectStatus.FUNDING
                ):
                    project.status = ProjectStatus.SUCCESSFUL
                    project.funded_at = datetime.now(UTC)
                    goal_notification = Notification(
                        user_id=project.teacher_id,
                        message=f"Congratulations! Your project '{project.title}' has been fully funded!",
                        link=f"/projects/{project.id}",
                    )
                    session.add(goal_notification)
            else:
                logger.error(
                    f"CRITICAL: Could not find project with ID {pledge.project_id} for pledge {pledge.id}"
                )

            session.commit()
        except Exception as e:
            logger.error(
                f"Error processing checkout.session.completed for pledge_id {client_reference_id}: {e}\n{traceback.format_exc()}"
            )
            session.rollback()


def handle_account_updated(session: Session, data_object: dict):
    try:
        stripe_account_id = data_object["id"]
        teacher = session.exec(
            select(User).where(User.stripe_account_id == stripe_account_id)
        ).first()
        if teacher:
            teacher.charges_enabled = data_object["charges_enabled"]
            teacher.payouts_enabled = data_object["payouts_enabled"]

            if not teacher.charges_enabled:
                projects_to_hold = session.exec(
                    select(Project).where(
                        Project.teacher_id == teacher.id, Project.status == ProjectStatus.FUNDING
                    )
                ).all()
                for proj in projects_to_hold:
                    proj.status = ProjectStatus.ON_HOLD

            notification = Notification(
                user_id=teacher.id,
                message="Your Stripe account status has been updated.",
                link="/teacher/dashboard",
            )
            session.add(notification)
            session.commit()
    except Exception as e:
        logger.error(f"Error processing account.updated: {e}\n{traceback.format_exc()}")
        session.rollback()


def handle_charge_refunded(session: Session, data_object: dict):
    try:
        payment_intent_id = data_object["payment_intent"]
        pledge_to_refund = session.exec(
            select(Pledge).where(Pledge.payment_intent_id == payment_intent_id)
        ).first()
        if pledge_to_refund and pledge_to_refund.status != PledgeStatus.REFUNDED:
            pledge_to_refund.status = PledgeStatus.REFUNDED

            project = session.get(Project, pledge_to_refund.project_id)
            if project:
                project.current_funding -= pledge_to_refund.amount

            session.commit()
    except Exception as e:
        logger.error(f"Error processing charge.refunded: {e}\n{traceback.format_exc()}")
        session.rollback()


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request, stripe_signature: str = Header(None), session: Session = Depends(get_session)
):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload") from None
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature") from None

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        handle_checkout_session_completed(session, data)
    elif event_type == "account.updated":
        handle_account_updated(session, data)
    elif event_type == "charge.refunded":
        handle_charge_refunded(session, data)
    else:
        logger.info(f"Unhandled event type: {event_type}")

    return {"status": "success"}
