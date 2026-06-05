import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_user
from ..models import (
    Conversation,
    ConversationStatus,
    Message,
    MessageType,
    Notification,
    OfferStatus,
    Pledge,
    PledgeStatus,
    PriorityCredit,
    PriorityCreditStatus,
    Project,
    ProjectStatus,
    Request,
    RequestBlacklist,
    RequestStatus,
    User,
    UserRole,
)
from ..schemas import (
    ConversationCreate,
    ConversationRead,
    ConversationSummaryRead,
    DemoVideoUpdate,
    InboxSummary,
    MessageCreate,
    MessageRead,
    OfferCreate,
    RequestRead as FullRequestRead,
    UserPublicRead,
)
from ..security import decode_access_token
from ..services.gamification import award_achievement

router = APIRouter(prefix="/conversations", tags=["conversations"])

log = logging.getLogger(__name__)


# ConnectionManager for WebSockets
class ConnectionManager:
    def __init__(self):
        # Stores {conversation_id: [(websocket, user_id), ...]}
        self.active_conversation_connections: dict[int, list[tuple[WebSocket, int]]] = {}
        # Stores {user_id: [websocket, ...]} for global notifications
        self.active_user_connections: dict[int, list[WebSocket]] = {}

    async def connect_conversation(self, websocket: WebSocket, conversation_id: int, user_id: int):
        await websocket.accept()
        if conversation_id not in self.active_conversation_connections:
            self.active_conversation_connections[conversation_id] = []
        self.active_conversation_connections[conversation_id].append((websocket, user_id))

    def disconnect_conversation(self, websocket: WebSocket, conversation_id: int, user_id: int):
        if conversation_id in self.active_conversation_connections:
            self.active_conversation_connections[conversation_id].remove((websocket, user_id))
            if not self.active_conversation_connections[conversation_id]:
                del self.active_conversation_connections[conversation_id]

    async def broadcast_to_conversation(self, message: str, conversation_id: int):
        if conversation_id in self.active_conversation_connections:
            for connection, _ in self.active_conversation_connections[conversation_id]:
                await connection.send_text(message)

    def is_user_in_conversation(self, user_id: int, conversation_id: int) -> bool:
        if conversation_id in self.active_conversation_connections:
            return any(
                uid == user_id for _, uid in self.active_conversation_connections[conversation_id]
            )
        return False

    async def connect_user(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_user_connections:
            self.active_user_connections[user_id] = []
        self.active_user_connections[user_id].append(websocket)

    def disconnect_user(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_user_connections:
            self.active_user_connections[user_id].remove(websocket)
            if not self.active_user_connections[user_id]:
                del self.active_user_connections[user_id]

    async def send_user_notification(self, user_id: int, message: str):
        if user_id in self.active_user_connections:
            for connection in self.active_user_connections[user_id]:
                await connection.send_text(message)


manager = ConnectionManager()


# Helper to create ConversationRead from Conversation model
def _create_conversation_read(
    conversation: Conversation, current_user: User, session: Session
) -> ConversationRead:
    # Ensure relationships are loaded
    if not conversation.request:
        conversation.request = session.get(Request, conversation.request_id)

    # Ensure request.user is loaded for user_name
    if not conversation.request.user:
        conversation.request.user = session.get(User, conversation.request.user_id)

    # Explicitly fetch teacher and student to avoid relationship loading bugs
    teacher = session.get(User, conversation.teacher_id)
    student = session.get(User, conversation.student_id)
    if not teacher or not student:
        raise HTTPException(status_code=500, detail="Could not load conversation participants.")

    messages_read = []
    for msg in conversation.messages:
        sender_user = session.get(User, msg.sender_id)
        replied_to_message_content = None
        replied_to_sender_name = None
        if msg.replied_to_message_id:
            replied_to_message = session.get(Message, msg.replied_to_message_id)
            if replied_to_message:
                replied_to_message_content = replied_to_message.content
                replied_to_sender = session.get(User, replied_to_message.sender_id)
                if replied_to_sender:
                    replied_to_sender_name = replied_to_sender.full_name

        messages_read.append(
            MessageRead(
                id=msg.id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                content=msg.content,
                created_at=msg.created_at,
                is_read=msg.is_read,
                sender_full_name=sender_user.full_name if sender_user else "Deleted User",
                sender_avatar_url=sender_user.avatar_url if sender_user else None,
                replied_to_message_id=msg.replied_to_message_id,
                replied_to_message_content=replied_to_message_content,
                replied_to_sender_name=replied_to_sender_name,
                message_type=msg.message_type,
                offer_description=msg.offer_description,
                offer_price=msg.offer_price,
                offer_status=msg.offer_status,
                offer_title=msg.offer_title,
                offer_language=msg.offer_language,
                offer_level=msg.offer_level,
                offer_tags=msg.offer_tags,
                offer_is_series=msg.offer_is_series,
                offer_num_videos=msg.offer_num_videos,
                offer_price_per_video=msg.offer_price_per_video,
            )
        )

    # Manually construct RequestRead to ensure user_name is present
    request_read_data = conversation.request.model_dump()
    request_read_data["user_name"] = (
        conversation.request.user.full_name if conversation.request.user else "Unknown"
    )

    # Handle associated_project_id, project_title, project_description, project_funding_goal
    project_data = {
        "associated_project_id": None,
        "project_title": None,
        "project_description": None,
        "project_funding_goal": None,
    }
    if conversation.request.status == RequestStatus.ACCEPTED:
        project = session.exec(
            select(Project).where(Project.origin_request_id == conversation.request.id)
        ).first()
        if project:
            project_data["associated_project_id"] = project.id
            project_data["project_title"] = project.title
            project_data["project_description"] = project.description
            project_data["project_funding_goal"] = project.funding_goal

    request_read_data.update(project_data)

    return ConversationRead(
        id=conversation.id,
        request_id=conversation.request_id,
        teacher_id=conversation.teacher_id,
        student_id=conversation.student_id,
        status=conversation.status,
        student_demo_video_url=conversation.student_demo_video_url,
        demo_video_requested=conversation.demo_video_requested,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        request=FullRequestRead(**request_read_data),
        teacher=UserPublicRead.model_validate(teacher),
        student=UserPublicRead.model_validate(student),
        messages=messages_read,
    )


# Helper to create ConversationSummaryRead from Conversation model
def _create_conversation_summary_read(
    conversation: Conversation, current_user: User, session: Session
) -> ConversationSummaryRead:
    # Ensure relationships are loaded
    if not conversation.request:
        conversation.request = session.get(Request, conversation.request_id)

    # Explicitly determine and fetch the other participant to avoid relationship loading bugs
    other_participant_id = (
        conversation.teacher_id
        if current_user.id == conversation.student_id
        else conversation.student_id
    )
    other_participant = session.get(User, other_participant_id)
    if not other_participant:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load other participant with ID {other_participant_id}.",
        )

    last_message = session.exec(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
    ).first()

    unread_messages_count = session.exec(
        select(func.count(Message.id))
        .where(Message.conversation_id == conversation.id)
        .where(Message.sender_id != current_user.id)
        .where(Message.is_read == False)
    ).one()

    return ConversationSummaryRead(
        id=conversation.id,
        request_id=conversation.request_id,
        teacher_id=conversation.teacher_id,
        student_id=conversation.student_id,
        status=conversation.status,
        updated_at=conversation.updated_at,
        request_title=conversation.request.title,
        other_participant=UserPublicRead.model_validate(other_participant),
        last_message_content=last_message.content if last_message else None,
        last_message_created_at=last_message.created_at if last_message else None,
        unread_messages_count=unread_messages_count,
    )


@router.post("/", response_model=ConversationRead)
def create_conversation(
    conversation_in: ConversationCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can initiate conversations.",
        )

    request = session.get(Request, conversation_in.request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
    if request.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create a conversation for your own request.",
        )

    # Check if conversation already exists
    existing_conversation = session.exec(
        select(Conversation)
        .where(Conversation.request_id == conversation_in.request_id)
        .where(Conversation.teacher_id == current_user.id)
    ).first()

    if existing_conversation:
        return _create_conversation_read(existing_conversation, current_user, session)

    conversation = Conversation(
        request_id=request.id,
        teacher_id=current_user.id,
        student_id=request.user_id,
        status=ConversationStatus.OPEN,
        updated_at=datetime.now(UTC),
    )
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    # Add initial message from teacher
    initial_message_content = (
        f"Hi, I'm interested in your request for '{request.title}'. Let's discuss!"
    )
    initial_message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=initial_message_content,
        is_read=False,
    )
    session.add(initial_message)
    session.commit()
    session.refresh(conversation)  # Refresh to update updated_at

    return _create_conversation_read(conversation, current_user, session)


@router.get("/", response_model=list[ConversationSummaryRead])
def list_my_conversations(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    conversations = session.exec(
        select(Conversation)
        .where(
            (Conversation.teacher_id == current_user.id)
            | (Conversation.student_id == current_user.id)
        )
        .where(Conversation.status == ConversationStatus.OPEN)
        .options(
            selectinload(Conversation.request),
            selectinload(Conversation.teacher),
            selectinload(Conversation.student),
        )
        .order_by(Conversation.updated_at.desc())
    ).all()

    return [
        _create_conversation_summary_read(conv, current_user, session) for conv in conversations
    ]


@router.get("/archive", response_model=list[ConversationSummaryRead])
def list_archived_conversations(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    conversations = session.exec(
        select(Conversation)
        .where(
            (Conversation.teacher_id == current_user.id)
            | (Conversation.student_id == current_user.id)
        )
        .where(Conversation.status == ConversationStatus.CLOSED)
        .options(
            selectinload(Conversation.request),
            selectinload(Conversation.teacher),
            selectinload(Conversation.student),
        )
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [
        _create_conversation_summary_read(conv, current_user, session) for conv in conversations
    ]


@router.get("/summary", response_model=InboxSummary)
def get_inbox_summary(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    conversations = session.exec(
        select(Conversation)
        .where(
            (Conversation.teacher_id == current_user.id)
            | (Conversation.student_id == current_user.id)
        )
        .where(Conversation.status == ConversationStatus.OPEN)
        .options(
            selectinload(Conversation.request),
            selectinload(Conversation.teacher),
            selectinload(Conversation.student),
        )
        .order_by(Conversation.updated_at.desc())
    ).all()

    summary_conversations = []
    total_unread_count = 0
    for conv in conversations:
        summary_conv = _create_conversation_summary_read(conv, current_user, session)
        summary_conversations.append(summary_conv)
        total_unread_count += summary_conv.unread_messages_count

    return InboxSummary(conversations=summary_conversations, total_unread_count=total_unread_count)


@router.get("/{conversation_id}", response_model=ConversationRead)
def get_full_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.exec(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(
            selectinload(Conversation.request).selectinload(Request.user),
            selectinload(Conversation.teacher),
            selectinload(Conversation.student),
            selectinload(Conversation.messages),
        )
    ).first()

    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if not (
        conversation.teacher_id == current_user.id
        or conversation.student_id == current_user.id
        or current_user.role == UserRole.ADMIN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this conversation.",
        )

    # Mark messages from the other participant as read
    for message in conversation.messages:
        if message.sender_id != current_user.id and not message.is_read:
            message.is_read = True
            session.add(message)
    session.commit()
    session.refresh(conversation)

    return _create_conversation_read(conversation, current_user, session)


@router.post("/{conversation_id}/messages", response_model=MessageRead)
async def send_message(
    conversation_id: int,
    message_in: MessageCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if not (
        conversation.teacher_id == current_user.id or conversation.student_id == current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to send messages in this conversation.",
        )

    if conversation.status == ConversationStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send messages in a closed conversation.",
        )

    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=message_in.content,
        is_read=False,
        replied_to_message_id=message_in.replied_to_message_id,
    )
    session.add(message)
    conversation.updated_at = datetime.now(UTC)  # Update conversation timestamp
    session.add(conversation)
    session.commit()
    session.refresh(message)
    session.refresh(conversation)

    # Prepare message for broadcast and return
    sender_user = session.get(User, message.sender_id)
    replied_to_message_content = None
    replied_to_sender_name = None
    if message.replied_to_message_id:
        replied_to_message = session.get(Message, message.replied_to_message_id)
        if replied_to_message:
            replied_to_message_content = replied_to_message.content
            replied_to_sender = session.get(User, replied_to_message.sender_id)
            if replied_to_sender:
                replied_to_sender_name = replied_to_sender.full_name

    message_read_instance = MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content=message.content,
        created_at=message.created_at,
        is_read=message.is_read,
        sender_full_name=sender_user.full_name if sender_user else "Deleted User",
        sender_avatar_url=sender_user.avatar_url if sender_user else None,
        replied_to_message_id=message.replied_to_message_id,
        replied_to_message_content=replied_to_message_content,
        replied_to_sender_name=replied_to_sender_name,
        message_type=message.message_type,
        offer_description=message.offer_description,
        offer_price=message.offer_price,
        offer_status=message.offer_status,
        offer_title=message.offer_title,
        offer_language=message.offer_language,
        offer_level=message.offer_level,
        offer_tags=message.offer_tags,
        offer_is_series=message.offer_is_series,
        offer_num_videos=message.offer_num_videos,
        offer_price_per_video=message.offer_price_per_video,
    )

    await manager.broadcast_to_conversation(
        message_read_instance.model_dump_json(), conversation_id
    )

    # Send notification to the other participant
    recipient_id = (
        conversation.student_id
        if current_user.id == conversation.teacher_id
        else conversation.teacher_id
    )
    if recipient_id != current_user.id:
        # Only send notification if the recipient is NOT currently in this conversation
        # The global websocket just pings the client to re-fetch its state.
        notification_payload = json.dumps({"type": "NEW_MESSAGE_ALERT"})
        await manager.send_user_notification(recipient_id, notification_payload)

    return message_read_instance


@router.post("/{conversation_id}/offer", response_model=MessageRead)
async def make_offer(
    conversation_id: int,
    offer_in: OfferCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if current_user.id != conversation.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the teacher can make an offer."
        )

    if conversation.status == ConversationStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot make an offer in a closed conversation.",
        )

    offer_price = offer_in.offer_price
    if (
        offer_in.is_series
        and offer_in.price_per_video
        and offer_in.num_videos
        and offer_in.num_videos > 0
    ):
        offer_price = offer_in.price_per_video * offer_in.num_videos

    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=f"Offer: {offer_in.offer_description}",
        message_type=MessageType.OFFER,
        offer_description=offer_in.offer_description,
        offer_price=offer_price,
        offer_status=OfferStatus.PENDING,
        offer_title=offer_in.title,
        offer_language=offer_in.language,
        offer_level=offer_in.level,
        offer_tags=offer_in.tags,
        offer_is_series=offer_in.is_series,
        offer_num_videos=offer_in.num_videos,
        offer_price_per_video=offer_in.price_per_video,
    )
    session.add(message)
    conversation.updated_at = datetime.now(UTC)
    session.add(conversation)
    session.commit()
    session.refresh(message)
    session.refresh(conversation)

    message_read_instance = MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content=message.content,
        created_at=message.created_at,
        is_read=False,
        sender_full_name=current_user.full_name,
        sender_avatar_url=current_user.avatar_url,
        message_type=message.message_type,
        offer_description=message.offer_description,
        offer_price=message.offer_price,
        offer_status=message.offer_status,
        offer_title=message.offer_title,
        offer_language=message.offer_language,
        offer_level=message.offer_level,
        offer_tags=message.offer_tags,
        offer_is_series=message.offer_is_series,
        offer_num_videos=message.offer_num_videos,
        offer_price_per_video=message.offer_price_per_video,
    )

    await manager.broadcast_to_conversation(
        message_read_instance.model_dump_json(), conversation_id
    )

    return message_read_instance


@router.post("/messages/{message_id}/accept-offer", response_model=Project)
async def accept_offer(
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    offer_message = session.get(Message, message_id)
    if not offer_message or offer_message.message_type != MessageType.OFFER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")

    conversation = session.get(Conversation, offer_message.conversation_id)
    if not conversation or current_user.id != conversation.student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to accept this offer."
        )

    if offer_message.offer_status != OfferStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Offer is not pending.")

    offer_message.offer_status = OfferStatus.ACCEPTED
    session.add(offer_message)

    request = session.get(Request, conversation.request_id)
    request.status = RequestStatus.ACCEPTED
    session.add(request)

    new_project = Project(
        title=offer_message.offer_title,
        description=offer_message.offer_description,
        language=offer_message.offer_language,
        level=offer_message.offer_level,
        tags=offer_message.offer_tags,
        funding_goal=offer_message.offer_price,
        teacher_id=conversation.teacher_id,
        origin_request_id=request.id,
        status=ProjectStatus.FUNDING,
        is_series=offer_message.offer_is_series,
        num_videos=offer_message.offer_num_videos,
        price_per_video=offer_message.offer_price_per_video,
    )
    session.add(new_project)
    session.flush()  # To get the new_project.id

    # Handle Priority Credit usage
    if request.priority_credit_id:
        credit = session.get(PriorityCredit, request.priority_credit_id)
        if not credit:
            raise HTTPException(status_code=404, detail="Priority credit not found.")
        if credit.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Priority credit does not belong to you.")
        if credit.status != PriorityCreditStatus.AVAILABLE:
            raise HTTPException(status_code=400, detail="Priority credit is not available.")

        # Create a pledge representing the credit usage
        credit_pledge = Pledge(
            amount=500,  # 500 cents = $5.00
            status=PledgeStatus.PAID_BY_CREDIT,
            user_id=current_user.id,
            project_id=new_project.id,
        )
        session.add(credit_pledge)

        # Update the credit status
        credit.status = PriorityCreditStatus.USED
        credit.used_on_request_id = request.id
        session.add(credit)

    # Award "First Steps" achievement
    accepted_requests_count = session.exec(
        select(func.count(Request.id))
        .where(Request.user_id == current_user.id)
        .where(Request.status == RequestStatus.ACCEPTED)
    ).one()

    if accepted_requests_count == 1:
        award_achievement(user=current_user, achievement_key="first_steps", session=session)

    # Broadcast acceptance before closing to allow for redirect
    await manager.broadcast_to_conversation(
        json.dumps({"type": "OFFER_ACCEPTED", "project_id": new_project.id}), conversation.id
    )

    # Close all conversations for this request
    all_conversations = session.exec(
        select(Conversation).where(Conversation.request_id == request.id)
    ).all()
    for conv in all_conversations:
        conv.status = ConversationStatus.CLOSED
        session.add(conv)
        await manager.broadcast_to_conversation(
            json.dumps({"type": "CONVERSATION_CLOSED"}), conv.id
        )

    session.commit()
    session.refresh(new_project)

    return new_project


@router.post("/messages/{message_id}/reject-offer")
async def reject_offer(
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    offer_message = session.get(Message, message_id)
    if not offer_message or offer_message.message_type != MessageType.OFFER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")

    conversation = session.get(Conversation, offer_message.conversation_id)
    if not conversation or current_user.id != conversation.student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to reject this offer."
        )

    if offer_message.offer_status != OfferStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Offer is not pending.")

    offer_message.offer_status = OfferStatus.REJECTED
    session.add(offer_message)

    conversation.status = ConversationStatus.CLOSED
    session.add(conversation)

    blacklist_entry = RequestBlacklist(
        request_id=conversation.request_id, teacher_id=conversation.teacher_id
    )
    session.add(blacklist_entry)

    session.commit()

    await manager.broadcast_to_conversation(
        json.dumps({"type": "CONVERSATION_CLOSED"}), conversation.id
    )

    return {"status": "offer rejected"}


@router.post("/{conversation_id}/leave")
async def leave_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if current_user.id != conversation.student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the student can leave the conversation.",
        )

    # Fetch the request to get its title for the message and for blacklisting
    request = session.get(Request, conversation.request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Associated request not found."
        )

    # 1. Add a message to the conversation indicating the student has left
    leave_message_content = "The student has left this conversation. It is now archived."
    leave_message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,  # Student is the sender of this message
        content=leave_message_content,
        is_read=False,  # Teacher hasn't read it yet
        message_type=MessageType.TEXT,
    )
    session.add(leave_message)
    session.flush()  # Ensure message gets an ID
    session.refresh(leave_message)

    # Prepare MessageRead instance for broadcast
    message_read_instance = MessageRead(
        id=leave_message.id,
        conversation_id=leave_message.conversation_id,
        sender_id=leave_message.sender_id,
        content=leave_message.content,
        created_at=leave_message.created_at,
        is_read=leave_message.is_read,
        sender_full_name=current_user.full_name,
        sender_avatar_url=current_user.avatar_url,
        replied_to_message_id=None,
        replied_to_message_content=None,
        replied_to_sender_name=None,
        message_type=leave_message.message_type,
        offer_description=None,
        offer_price=None,
        offer_status=None,
        offer_title=None,
        offer_language=None,
        offer_level=None,
        offer_tags=None,
        offer_is_series=None,
        offer_num_videos=None,
        offer_price_per_video=None,
    )

    # 2. Close the conversation
    conversation.status = ConversationStatus.CLOSED
    session.add(conversation)

    # 3. Blacklist the teacher from the request associated with that conversation
    blacklist_entry = RequestBlacklist(
        request_id=conversation.request_id, teacher_id=conversation.teacher_id
    )
    session.add(blacklist_entry)

    # 4. Send appropriate notifications to the teacher
    if manager.is_user_in_conversation(conversation.teacher_id, conversation.id):
        # Broadcast a single event that includes the message and closure
        await manager.broadcast_to_conversation(
            json.dumps(
                {
                    "type": "MESSAGE_AND_CONVERSATION_CLOSED",
                    "message": message_read_instance.model_dump(mode="json"),
                    "conversation_id": conversation.id,
                    "reason": "student_left",  # Add a reason to differentiate from request cancellation
                }
            ),
            conversation.id,
        )
    else:
        # Create a standard notification
        notification = Notification(
            user_id=conversation.teacher_id,
            message=leave_message_content,
            is_read=False,
            link=f"/messages/{conversation.id}",  # Link to the archived conversation
        )
        session.add(notification)

    # 5. Ensure the original request's status remains active (e.g., 'open')
    # The request status is not changed here, so it remains as it was (e.g., OPEN or NEGOTIATING)

    session.commit()

    return {
        "status": "conversation left",
        "detail": "Conversation archived and teacher blacklisted from request.",
    }


@router.post("/{conversation_id}/teacher-leave")
async def teacher_leave_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if current_user.id != conversation.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher of this conversation can leave it.",
        )

    # Fetch the request to get its title for the message and for blacklisting
    request = session.get(Request, conversation.request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Associated request not found."
        )

    # 1. Add a message to the conversation indicating the teacher has left
    leave_message_content = "The teacher has left this conversation. It is now archived."
    leave_message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,  # Teacher is the sender of this message
        content=leave_message_content,
        is_read=False,  # Student hasn't read it yet
        message_type=MessageType.TEXT,
    )
    session.add(leave_message)
    session.flush()  # Ensure message gets an ID
    session.refresh(leave_message)

    # Prepare MessageRead instance for broadcast
    message_read_instance = MessageRead(
        id=leave_message.id,
        conversation_id=leave_message.conversation_id,
        sender_id=leave_message.sender_id,
        content=leave_message.content,
        created_at=leave_message.created_at,
        is_read=leave_message.is_read,
        sender_full_name=current_user.full_name,
        sender_avatar_url=current_user.avatar_url,
        replied_to_message_id=None,
        replied_to_message_content=None,
        replied_to_sender_name=None,
        message_type=leave_message.message_type,
        offer_description=None,
        offer_price=None,
        offer_status=None,
        offer_title=None,
        offer_language=None,
        offer_level=None,
        offer_tags=None,
        offer_is_series=None,
        offer_num_videos=None,
        offer_price_per_video=None,
    )

    # 2. Close the conversation
    conversation.status = ConversationStatus.CLOSED
    session.add(conversation)

    # 3. Blacklist the teacher from the request associated with that conversation
    blacklist_entry = RequestBlacklist(
        request_id=conversation.request_id, teacher_id=current_user.id
    )
    session.add(blacklist_entry)

    # 4. Send appropriate notifications to the student
    if manager.is_user_in_conversation(conversation.student_id, conversation.id):
        # Broadcast a single event that includes the message and closure
        await manager.broadcast_to_conversation(
            json.dumps(
                {
                    "type": "MESSAGE_AND_CONVERSATION_CLOSED",
                    "message": message_read_instance.model_dump(mode="json"),
                    "conversation_id": conversation.id,
                    "reason": "teacher_left",  # Add a reason to differentiate
                }
            ),
            conversation.id,
        )
    else:
        # Create a standard notification
        notification = Notification(
            user_id=conversation.student_id,
            message=leave_message_content,
            is_read=False,
            link=f"/messages/{conversation.id}",  # Link to the archived conversation
        )
        session.add(notification)

    # 5. Ensure the original request's status remains active (e.g., 'open')
    # The request status is not changed here, so it remains as it was (e.g., OPEN or NEGOTIATING)

    session.commit()

    return {
        "status": "conversation left",
        "detail": "Conversation archived and teacher blacklisted from request.",
    }


@router.post("/{conversation_id}/close", response_model=ConversationRead)
def close_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if conversation.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher can close this conversation.",
        )

    if conversation.status == ConversationStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Conversation is already closed."
        )

    conversation.status = ConversationStatus.CLOSED
    conversation.updated_at = datetime.now(UTC)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    return _create_conversation_read(conversation, current_user, session)


@router.post("/{conversation_id}/request-demo-video", response_model=MessageRead)
async def request_demo_video(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if conversation.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher can request a demo video.",
        )

    if conversation.demo_video_requested:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A demo video has already been requested.",
        )

    conversation.demo_video_requested = True
    session.add(conversation)

    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content="The teacher has requested a video demonstration of your language level.",
        message_type=MessageType.DEMO_REQUEST,
    )
    session.add(message)
    conversation.updated_at = datetime.now(UTC)
    session.add(conversation)
    session.commit()
    session.refresh(message)
    session.refresh(conversation)

    sender_user = session.get(User, message.sender_id)
    message_read_instance = MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content=message.content,
        created_at=message.created_at,
        is_read=False,
        sender_full_name=sender_user.full_name,
        sender_avatar_url=sender_user.avatar_url,
        message_type=message.message_type,
        offer_title=None,
        offer_language=None,
        offer_level=None,
        offer_tags=None,
        offer_is_series=None,
        offer_num_videos=None,
        offer_price_per_video=None,
    )

    await manager.broadcast_to_conversation(
        message_read_instance.model_dump_json(), conversation_id
    )

    return message_read_instance


@router.patch("/{conversation_id}/demo-video", response_model=MessageRead)
async def update_demo_video_url(
    conversation_id: int,
    demo_video_in: DemoVideoUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if conversation.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the student can update the demo video URL.",
        )

    if not conversation.demo_video_requested:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No demo video was requested."
        )

    if conversation.student_demo_video_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A demo video has already been submitted.",
        )

    conversation.student_demo_video_url = demo_video_in.url
    conversation.updated_at = datetime.now(UTC)
    session.add(conversation)

    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=demo_video_in.url,
        message_type=MessageType.DEMO_VIDEO,
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    session.refresh(conversation)

    sender_user = session.get(User, message.sender_id)
    message_read_instance = MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content=message.content,
        created_at=message.created_at,
        is_read=False,
        sender_full_name=sender_user.full_name,
        sender_avatar_url=sender_user.avatar_url,
        message_type=message.message_type,
        offer_title=None,
        offer_language=None,
        offer_level=None,
        offer_tags=None,
        offer_is_series=None,
        offer_num_videos=None,
        offer_price_per_video=None,
    )

    await manager.broadcast_to_conversation(
        message_read_instance.model_dump_json(), conversation_id
    )

    return message_read_instance


async def get_user_from_token(token: str, session: Session) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return session.get(User, int(user_id))


@router.websocket("/{conversation_id}/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: int,
    token: str = Query(...),
    session: Session = Depends(get_session),
):
    user = await get_user_from_token(token, session)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    # Check if user is part of this conversation
    conversation = session.get(Conversation, conversation_id)
    if not conversation or not (
        conversation.teacher_id == user.id or conversation.student_id == user.id
    ):
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION, reason="Not authorized for this conversation"
        )
        return

    await manager.connect_conversation(websocket, conversation_id, user.id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                if payload.get("type") == "READ_RECEIPT":
                    message_ids = payload.get("message_ids", [])
                    if message_ids:
                        # Update messages in bulk
                        stmt = (
                            select(Message)
                            .where(Message.id.in_(message_ids))
                            .where(Message.sender_id != user.id)
                        )
                        messages_to_update = session.exec(stmt).all()
                        for msg in messages_to_update:
                            msg.is_read = True
                            session.add(msg)
                        session.commit()

                        # Recalculate total unread count for the user
                        total_unread_count = 0
                        user_conversations = session.exec(
                            select(Conversation).where(
                                (Conversation.teacher_id == user.id)
                                | (Conversation.student_id == user.id)
                            )
                        ).all()
                        for conv in user_conversations:
                            total_unread_count += session.exec(
                                select(func.count(Message.id))
                                .where(Message.conversation_id == conv.id)
                                .where(Message.sender_id != user.id)
                                .where(Message.is_read == False)
                            ).one()

                        notification_payload = json.dumps(
                            {"type": "UNREAD_COUNT_UPDATE", "unread_count": total_unread_count}
                        )
                        await manager.send_user_notification(user.id, notification_payload)
            except json.JSONDecodeError:
                pass  # Ignore non-JSON messages
    except WebSocketDisconnect:
        manager.disconnect_conversation(websocket, conversation_id, user.id)
    except Exception:
        log.exception("WebSocket error in conversation %s", conversation_id)
        manager.disconnect_conversation(websocket, conversation_id, user.id)


@router.websocket("/ws")
async def websocket_global_notifications_endpoint(
    websocket: WebSocket, token: str = Query(...), session: Session = Depends(get_session)
):
    user = await get_user_from_token(token, session)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    await manager.connect_user(websocket, user.id)
    try:
        while True:
            # This endpoint is primarily for server-to-client notifications,
            # so we just keep the connection open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_user(websocket, user.id)
    except Exception:
        log.exception("Global WebSocket error for user %s", user.id)
        manager.disconnect_user(websocket, user.id)
