import json
import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_  # Import and_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import (  # Import new models
    Conversation,
    ConversationStatus,
    Message,
    MessageType,
    Notification,
    PriorityCredit,
    PriorityCreditStatus,
    Project,
    Request,
    RequestBlacklist,
    RequestStatus,
    SubscriptionTier,
    User,
    UserRole,
)
from ..schemas import (  # Keep existing imports
    MessageRead,
    RequestCreate,
    RequestRead,
)
from .conversations import manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/requests", tags=["requests"])


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)!r} not serializable")


# Update RequestCreate schema to include use_priority_credit
class RequestCreate(RequestCreate):
    use_priority_credit: bool | None = False


@router.post("/", response_model=Request)
def create_request(
    request_in: RequestCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Create a new content request.
    """
    request_data = request_in.model_dump(exclude_unset=True)
    use_priority_credit = request_data.pop("use_priority_credit", False)

    request = Request(**request_data, user_id=current_user.id, status=RequestStatus.OPEN)

    # Handle priority credit usage
    if use_priority_credit and current_user.subscription_tier == SubscriptionTier.PLUS:
        # Find an available priority credit for the user
        priority_credit = session.exec(
            select(PriorityCredit)
            .where(PriorityCredit.user_id == current_user.id)
            .where(PriorityCredit.status == PriorityCreditStatus.AVAILABLE)
        ).first()

        if priority_credit:
            request.priority_credit_id = priority_credit.id
            # Note: The status of the PriorityCredit is updated in the accept_offer endpoint
            # to ensure it's only marked as USED when the request is actually accepted.
        else:
            # Silently ignore if no credit is found, as per the prompt's suggestion for UX
            logger.warning(
                "User %s tried to use priority credit but none was available.",
                current_user.id,
            )

    session.add(request)
    session.commit()
    session.refresh(request)

    # Notify target teacher if specified
    if request.target_teacher_id:
        notification = Notification(
            user_id=request.target_teacher_id,
            message=f"Student {current_user.full_name} requested a video from you: {request.title}",
            is_read=False,
            link="/requests",
        )
        logger.debug(
            f"Creating notification for new request: {notification.message}, link: {notification.link}"
        )
        session.add(notification)
        session.commit()

    return request


@router.get("/", response_model=list[RequestRead])
def list_requests(
    limit: int = 10,
    offset: int = 0,
    language: str | None = None,
    level: str | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    List content requests.
    """
    query = select(Request).options(selectinload(Request.user))

    # Exclude cancelled requests by default
    query = query.where(Request.status != RequestStatus.CANCELLED)

    # Define statuses for community/teacher visibility
    visible_statuses = [RequestStatus.OPEN, RequestStatus.NEGOTIATING]

    # A request is visible if:
    # 1. The current user is the owner (all statuses are visible).
    # 2. It's a public request and its status is OPEN or NEGOTIATING.
    # 3. The current user is a TEACHER, it's targeted to them, and its status is OPEN or NEGOTIATING.
    conditions = [
        Request.user_id == current_user.id,
        and_(Request.is_private == False, Request.status.in_(visible_statuses)),
    ]
    if current_user.role == UserRole.CREATOR:
        conditions.append(
            and_(Request.target_teacher_id == current_user.id, Request.status.in_(visible_statuses))
        )

    query = query.where(or_(*conditions))

    # For teachers, exclude requests they have blacklisted (rejected)
    if current_user.role == UserRole.CREATOR:
        blacklist_sub = select(RequestBlacklist.request_id).where(
            RequestBlacklist.teacher_id == current_user.id
        )
        query = query.where(Request.id.notin_(blacklist_sub))

    if language:
        query = query.where(Request.language == language)
    if level:
        query = query.where(Request.level == level)

    query = query.order_by(Request.created_at.desc()).offset(offset).limit(limit)

    requests = session.exec(query).all()

    results = []
    for r in requests:
        user_name = r.user.full_name if r.user else "Unknown"

        project_data = {
            "associated_project_id": None,
            "project_title": None,
            "project_description": None,
            "project_funding_goal": None,
        }

        if r.status == RequestStatus.ACCEPTED:
            # Find the project created from this request
            project = session.exec(select(Project).where(Project.origin_request_id == r.id)).first()
            if project:
                project_data["associated_project_id"] = project.id
                project_data["project_title"] = project.title
                project_data["project_description"] = project.description
                project_data["project_funding_goal"] = project.funding_goal

        results.append(
            RequestRead(
                id=r.id,
                title=r.title,
                description=r.description,
                language=r.language,
                level=r.level,
                budget=r.budget,
                status=r.status,
                target_teacher_id=r.target_teacher_id,
                counter_offer_amount=r.counter_offer_amount,
                is_private=r.is_private,
                created_at=r.created_at,
                user_id=r.user_id,
                user_name=user_name,
                **project_data,
            )
        )

    return results


@router.post("/{request_id}/cancel")
async def cancel_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Cancel a request. Only the owner or an admin can cancel it.
    This action is not a hard delete. It sets the request status to CANCELLED
    and closes associated conversations, which moves them to the archive.
    """
    request = session.get(Request, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if request.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to cancel this request",
        )

    if request.status not in [RequestStatus.OPEN, RequestStatus.NEGOTIATING]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a request with status '{request.status}'.",
        )

    request.status = RequestStatus.CANCELLED
    session.add(request)

    # Find and close associated conversations
    conversations = session.exec(
        select(Conversation).where(Conversation.request_id == request_id)
    ).all()

    notifications_to_add = []

    for conv in conversations:
        # Check if teacher is blacklisted for this request
        is_blacklisted = session.exec(
            select(RequestBlacklist)
            .where(RequestBlacklist.request_id == request_id)
            .where(RequestBlacklist.teacher_id == conv.teacher_id)
        ).first()

        if is_blacklisted:
            # If blacklisted, just close the conversation and skip notifications
            conv.status = ConversationStatus.CLOSED
            session.add(conv)
            continue  # Skip to the next conversation

        # 1. Add cancellation message to the conversation
        cancellation_message_content = f"The student has cancelled the request '{request.title}'. This conversation is now archived."
        cancellation_message = Message(
            conversation_id=conv.id,
            sender_id=current_user.id,  # Student is the sender of this message
            content=cancellation_message_content,
            is_read=False,  # Teacher hasn't read it yet
            message_type=MessageType.TEXT,
        )
        session.add(cancellation_message)
        session.flush()  # Ensure message gets an ID
        session.refresh(cancellation_message)

        # Prepare MessageRead instance for broadcast
        message_read_instance = MessageRead(
            id=cancellation_message.id,
            conversation_id=cancellation_message.conversation_id,
            sender_id=cancellation_message.sender_id,
            content=cancellation_message.content,
            created_at=cancellation_message.created_at,
            is_read=cancellation_message.is_read,
            sender_full_name=current_user.full_name,
            sender_avatar_url=current_user.avatar_url,
            replied_to_message_id=None,
            replied_to_message_content=None,
            replied_to_sender_name=None,
            message_type=cancellation_message.message_type,
            offer_description=None,
            offer_price=None,
            offer_status=None,
        )

        # 2. Notify the teacher
        if manager.is_user_in_conversation(conv.teacher_id, conv.id):
            # First, broadcast the new message as a regular message
            await manager.broadcast_to_conversation(
                message_read_instance.model_dump_json(),  # This is already a JSON string
                conv.id,
            )
            # Then, broadcast the conversation closure event
            await manager.broadcast_to_conversation(
                json.dumps(
                    {
                        "type": "MESSAGE_AND_CONVERSATION_CLOSED",
                        "conversation_id": conv.id,
                        "reason": "request_cancelled",
                    }
                ),
                conv.id,
            )
        else:
            # Create a standard notification
            notification = Notification(
                user_id=conv.teacher_id,
                message=cancellation_message_content,  # Use the same content as the message
                is_read=False,
                link=f"/messages/{conv.id}",  # Link to the archived conversation
            )
            logger.debug(
                f"Creating notification for request cancellation: {notification.message}, link: {notification.link}"
            )
            notifications_to_add.append(notification)

        # 3. Close the conversation in the database
        conv.status = ConversationStatus.CLOSED
        session.add(conv)

    session.add_all(notifications_to_add)  # Add all collected notifications
    session.commit()
    return {"ok": True, "detail": "Request cancelled and conversations archived."}


# Historical note: the request → project conversion + counter-offer
# routes that used to live here were superseded by the conversation-
# based offer flow in `conversations.py` (make_offer / accept-offer /
# reject-offer on a Message of type OFFER). Dead commented code lived
# here for months; removed 2026-06-07 because it was confusing audits
# and shadowing the local `RequestCreate` subclass below.
