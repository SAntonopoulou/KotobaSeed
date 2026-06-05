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
from ..models import (
    Booking,
    BookingStatus,
    Notification,
    Pledge,
    PledgeStatus,
    Project,
    ProjectRating,
    ProjectStatus,
    StripeWebhookEvent,
    Tutor,
    TutorAccountStatus,
    User,
)
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


def _handle_booking_checkout(session: Session, data_object: dict) -> bool:
    """Confirm a tutor-lesson Booking from a Stripe Checkout completion.

    Returns True if the event was a booking and was handled here, False if
    the caller should fall through to other types.
    """
    metadata = data_object.get("metadata", {})
    if metadata.get("type") != "booking":
        return False
    booking_id = metadata.get("booking_id")
    if not booking_id:
        logger.warning("Booking checkout event missing booking_id; metadata=%s", metadata)
        return True

    booking = session.get(Booking, int(booking_id))
    if not booking:
        logger.warning("Booking #%s referenced by webhook not found", booking_id)
        return True
    if booking.status != BookingStatus.PENDING_PAYMENT:
        logger.info(
            "Booking #%s already in %s state; webhook is a duplicate",
            booking_id,
            booking.status,
        )
        return True

    now = datetime.now(UTC)
    booking.status = BookingStatus.CONFIRMED
    booking.paid_at = now
    booking.stripe_payment_intent_id = data_object.get("payment_intent")
    booking.updated_at = now
    session.add(booking)

    # Notify the tutor that they have a paid booking.
    tutor = session.get(Tutor, booking.tutor_id)
    if tutor:
        notification = Notification(
            user_id=tutor.user_id,
            message=f"New booking confirmed for {booking.scheduled_at.strftime('%a %d %b · %H:%M UTC')}.",
            link="/dashboard",
        )
        session.add(notification)
    session.commit()
    # Email confirmations — non-blocking, failures swallowed inside.
    from ..services import booking_emails

    booking_emails.send_confirmation_emails(session, booking)
    return True


def _handle_module_checkout(session: Session, data_object: dict) -> bool:
    """Grant a LessonModule purchase on successful checkout. Idempotent —
    a duplicate webhook for the same (module_id, student_user_id) returns
    True without inserting a second row."""
    metadata = data_object.get("metadata", {})
    if metadata.get("type") != "module":
        return False
    try:
        module_id = int(metadata.get("module_id"))
        tutor_id = int(metadata.get("tutor_id"))
        student_user_id = int(metadata.get("student_user_id"))
        fee = int(metadata.get("platform_fee_cents") or 0)
    except (TypeError, ValueError):
        logger.warning("Module checkout missing/invalid metadata: %s", metadata)
        return True
    from ..models import LessonModule, ModulePurchase

    module = session.get(LessonModule, module_id)
    if module is None:
        logger.warning("Module %s referenced by checkout not found", module_id)
        return True
    existing = session.exec(
        select(ModulePurchase).where(
            ModulePurchase.module_id == module_id,
            ModulePurchase.student_user_id == student_user_id,
        )
    ).first()
    if existing is not None:
        return True
    row = ModulePurchase(
        module_id=module_id,
        tutor_id=tutor_id,
        student_user_id=student_user_id,
        amount_cents=int(data_object.get("amount_total") or module.price_cents),
        platform_fee_cents=fee,
        currency=module.currency,
        stripe_checkout_session_id=data_object.get("id"),
        stripe_payment_intent_id=data_object.get("payment_intent"),
    )
    session.add(row)
    session.commit()
    return True


def _handle_premium_homework_checkout(
    session: Session, data_object: dict
) -> bool:
    """Grant a premium HomeworkPurchase + create an Assignment for the
    student so it lands in their /student/assignments queue immediately."""
    metadata = data_object.get("metadata", {})
    if metadata.get("type") != "homework":
        return False
    try:
        template_id = int(metadata.get("template_id"))
        tutor_id = int(metadata.get("tutor_id"))
        student_user_id = int(metadata.get("student_user_id"))
        fee = int(metadata.get("platform_fee_cents") or 0)
    except (TypeError, ValueError):
        logger.warning("Homework checkout missing/invalid metadata: %s", metadata)
        return True
    from ..models import (
        HomeworkAssignment,
        HomeworkAssignmentStatus,
        HomeworkPurchase,
        HomeworkTemplate,
    )
    from ..services import homework_grading

    template = session.get(HomeworkTemplate, template_id)
    if template is None:
        logger.warning("Homework template %s missing for checkout", template_id)
        return True
    existing = session.exec(
        select(HomeworkPurchase).where(
            HomeworkPurchase.template_id == template_id,
            HomeworkPurchase.student_user_id == student_user_id,
        )
    ).first()
    if existing is not None:
        return True
    purchase = HomeworkPurchase(
        template_id=template_id,
        tutor_id=tutor_id,
        student_user_id=student_user_id,
        amount_cents=int(data_object.get("amount_total") or template.price_cents),
        platform_fee_cents=fee,
        currency=template.currency,
        stripe_checkout_session_id=data_object.get("id"),
        stripe_payment_intent_id=data_object.get("payment_intent"),
    )
    session.add(purchase)
    # Spawn a fresh assignment so the student can start immediately.
    questions = homework_grading.parse_questions(template.questions_json)
    assignment = HomeworkAssignment(
        tutor_id=tutor_id,
        student_user_id=student_user_id,
        template_id=template_id,
        title=template.title,
        description=template.description,
        questions_snapshot_json=template.questions_json,
        max_score=homework_grading.compute_max_score(questions),
        status=HomeworkAssignmentStatus.OPEN,
    )
    session.add(assignment)
    session.commit()
    return True


def handle_checkout_session_completed(session: Session, data_object: dict):
    metadata = data_object.get("metadata", {})
    if _handle_booking_checkout(session, data_object):
        return
    if _handle_module_checkout(session, data_object):
        return
    if _handle_premium_homework_checkout(session, data_object):
        return
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
        charges_enabled = bool(data_object.get("charges_enabled"))
        payouts_enabled = bool(data_object.get("payouts_enabled"))

        # Legacy CompInput path: the teacher User owns the Connect account.
        teacher = session.exec(
            select(User).where(User.stripe_account_id == stripe_account_id)
        ).first()
        if teacher:
            teacher.charges_enabled = charges_enabled
            teacher.payouts_enabled = payouts_enabled
            if not charges_enabled:
                projects_to_hold = session.exec(
                    select(Project).where(
                        Project.teacher_id == teacher.id, Project.status == ProjectStatus.FUNDING
                    )
                ).all()
                for proj in projects_to_hold:
                    proj.status = ProjectStatus.ON_HOLD
            session.add(
                Notification(
                    user_id=teacher.id,
                    message="Your Stripe account status has been updated.",
                    link="/teacher/dashboard",
                )
            )

        # Kotobaseed path: the Connect account belongs to a Tutor. Flip
        # PAUSED_KYC → ACTIVE the first time both flags come back true.
        tutor = session.exec(
            select(Tutor).where(Tutor.stripe_connect_account_id == stripe_account_id)
        ).first()
        if tutor:
            if charges_enabled and payouts_enabled:
                if tutor.account_status == TutorAccountStatus.PAUSED_KYC:
                    tutor.account_status = TutorAccountStatus.ACTIVE
                    tutor.updated_at = datetime.now(UTC)
            elif tutor.account_status == TutorAccountStatus.ACTIVE:
                # Stripe revoked a capability — back to KYC-pending so the
                # tutor sees the "finish setup" prompt on next login.
                tutor.account_status = TutorAccountStatus.PAUSED_KYC
                tutor.updated_at = datetime.now(UTC)

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

    event_id = event["id"]
    event_type = event["type"]
    data = event["data"]["object"]

    # Idempotency: Stripe retries webhooks on non-2xx and network blips.
    # Without this gate, tip credits double-count, priority credits over-
    # grant, etc. If we've seen this event_id, return 200 silently and let
    # Stripe stop retrying.
    if session.get(StripeWebhookEvent, event_id):
        logger.info(f"Stripe webhook {event_id} ({event_type}) already processed; skipping")
        return {"status": "duplicate"}

    if event_type == "checkout.session.completed":
        handle_checkout_session_completed(session, data)
    elif event_type == "account.updated":
        handle_account_updated(session, data)
    elif event_type == "charge.refunded":
        handle_charge_refunded(session, data)
    else:
        logger.info(f"Unhandled event type: {event_type}")

    # Mark processed only after handlers succeed. If a handler throws, the
    # event isn't recorded and Stripe's retry will pick it up. Handlers
    # individually session.commit() on success, so we re-stage the record here.
    session.add(StripeWebhookEvent(event_id=event_id, event_type=event_type))
    session.commit()
    return {"status": "success"}
