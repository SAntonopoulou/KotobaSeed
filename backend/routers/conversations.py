import io
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_user
from ..services.rate_limit import _inprocess_incr, _redis_incr, rate_limit


def _ws_event_allowed(key: str, *, limit: int, window_seconds: int) -> bool:
    """Per-key WS event throttle. Mirrors the HTTP rate_limit dependency's
    counter logic but skips FastAPI's dep machinery — WS receive loops
    don't go through DI, and a 429 inside a WS frame would be invisible
    to the client. We silently drop excess events instead.

    Same Redis-or-in-process fallback as the HTTP path."""
    count = _redis_incr(key, window_seconds)
    if count is None:
        count = _inprocess_incr(key, window_seconds)
    return count <= limit

# Bound separately at module load so each endpoint stamps its own
# bucket. send_message is the hot one; the rest of the limits are
# defence-in-depth around endpoints a script could otherwise hammer.
_send_message_limit = rate_limit("send_message", limit=30, window_seconds=60)
_send_attachment_limit = rate_limit("send_attachment", limit=20, window_seconds=60)
_open_dm_limit = rate_limit("open_dm", limit=5, window_seconds=3600)
_report_limit = rate_limit("report", limit=10, window_seconds=3600)
# Marketplace creators can fan out across many open requests; same shape
# as the direct-DM limit so a single account can't spam every tutor on
# the board.
_open_marketplace_limit = rate_limit("open_marketplace", limit=10, window_seconds=3600)
# Offer + offer-state transitions: a script could otherwise hammer
# accept/reject toggles or fire offers across every open conversation.
# Generous enough that a working tutor never sees it (30/hour is roughly
# one every two minutes); low enough that abuse stalls.
_offer_limit = rate_limit("offer", limit=30, window_seconds=3600)
# Demo-video request + URL updates. Even rarer than offers — the cap is
# defence against a script that flips state in a loop.
_demo_video_limit = rate_limit("demo_video", limit=30, window_seconds=3600)
from ..models import (  # noqa: E402 — rate_limit set up above this block
    Conversation,
    ConversationReport,
    ConversationReportReason,
    ConversationReportStatus,
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
    UserBlock,
    UserRole,
)
from ..schemas import (  # noqa: E402 — rate_limit set up above
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
from ..security import decode_access_token  # noqa: E402 — rate_limit set up above
from ..services.gamification import award_achievement  # noqa: E402

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


# WS envelope protocol version. Every server-emitted payload includes
# this so clients can route on it deterministically. Old clients that
# don't know about the field still see all the original keys and keep
# working — this is purely additive. Bump when the envelope shape
# changes (e.g. moving to {version, type, payload}); current clients
# will ignore the unknown version and continue with the legacy shape.
WS_PROTOCOL_VERSION = 1


def _envelope(payload) -> str:
    """JSON-encode a WS payload with the protocol version stamped on."""
    if hasattr(payload, "model_dump"):
        data = payload.model_dump(mode="json")
    elif isinstance(payload, dict):
        data = dict(payload)
    else:
        # Shouldn't happen — every call site passes either a Pydantic
        # model or a dict — but degrade gracefully rather than 500.
        data = {"value": payload}
    data["version"] = WS_PROTOCOL_VERSION
    return json.dumps(data, default=str)


# Helper to create ConversationRead from Conversation model
def _create_conversation_read(
    conversation: Conversation, current_user: User, session: Session
) -> ConversationRead:
    # Direct (booking-flow) conversations have no marketplace Request
    # behind them, so the request relationship can legitimately be None.
    # Lazy-load only when there's a request_id to look up.
    if conversation.request_id and not conversation.request:
        conversation.request = session.get(Request, conversation.request_id)

    # Ensure request.user is loaded for user_name
    if conversation.request and not conversation.request.user:
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

        is_deleted = msg.deleted_at is not None
        messages_read.append(
            MessageRead(
                id=msg.id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                content="" if is_deleted else msg.content,
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
                deleted_at=msg.deleted_at,
                attachment_url=None if is_deleted else msg.attachment_url,
                attachment_kind=None if is_deleted else msg.attachment_kind,
            )
        )

    # Manually construct RequestRead to ensure user_name is present —
    # but only when a request actually exists (direct conversations
    # have no marketplace request).
    request_payload: FullRequestRead | None = None
    if conversation.request is not None:
        request_read_data = conversation.request.model_dump()
        request_read_data["user_name"] = (
            conversation.request.user.full_name
            if conversation.request.user
            else "Unknown"
        )
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
        request_payload = FullRequestRead(**request_read_data)

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
        request=request_payload,
        teacher=UserPublicRead.model_validate(teacher),
        student=UserPublicRead.model_validate(student),
        messages=messages_read,
    )


# Helper to create ConversationSummaryRead from Conversation model
def _create_conversation_summary_read(
    conversation: Conversation, current_user: User, session: Session
) -> ConversationSummaryRead:
    # Lazy-load the request only when one exists. Direct (booking-flow)
    # conversations have no marketplace request, so skip the lookup.
    if conversation.request_id and not conversation.request:
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
        request_title=conversation.request.title if conversation.request else None,
        other_participant=UserPublicRead.model_validate(other_participant),
        last_message_content=last_message.content if last_message else None,
        last_message_created_at=last_message.created_at if last_message else None,
        unread_messages_count=unread_messages_count,
    )


@router.post("/", response_model=ConversationRead)
def create_conversation(
    conversation_in: ConversationCreate,
    current_user: User = Depends(_open_marketplace_limit),
    session: Session = Depends(get_session),
):
    if current_user.role != UserRole.TUTOR:
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
    q: str | None = Query(default=None, max_length=80),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
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

    summaries = [
        _create_conversation_summary_read(conv, current_user, session) for conv in conversations
    ]

    if q:
        # Lightweight in-process filter: match against the other
        # participant's display name, the request title, or the latest
        # message preview. Inbox lists per user are small (tens, maybe
        # a few hundred) so a SQL-side join isn't worth the complexity
        # — we already materialised the summaries.
        needle = q.casefold()

        def _matches(s: ConversationSummaryRead) -> bool:
            haystacks: list[str] = []
            if s.other_participant and s.other_participant.full_name:
                haystacks.append(s.other_participant.full_name)
            if s.request_title:
                haystacks.append(s.request_title)
            if s.last_message_content:
                haystacks.append(s.last_message_content)
            return any(needle in h.casefold() for h in haystacks)

        summaries = [s for s in summaries if _matches(s)]

    return summaries


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


class StartDirectConversationResponse(BaseModel):
    conversation_id: int


@router.post("/with/{other_user_id}", response_model=StartDirectConversationResponse)
def find_or_create_direct_conversation(
    other_user_id: int,
    current_user: User = Depends(_open_dm_limit),
    session: Session = Depends(get_session),
) -> StartDirectConversationResponse:
    """Open a direct conversation between the caller and ``other_user_id``.

    Used by the booking dashboard's "Message X" affordance: a tutor
    contacting a student about an upcoming lesson, or vice-versa. We
    only treat existing conversations as a match when they have a
    ``NULL request_id`` so a marketplace request thread doesn't get
    rebound to an unrelated booking. Order of `teacher_id` /
    `student_id` doesn't matter for lookup — the pair is symmetric.
    """
    if other_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can't open a conversation with yourself.",
        )
    other = session.get(User, other_user_id)
    if other is None or other.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    # Mirror the block check on send_message — without this a blocked
    # user could still spin up a fresh conversation row that shows up
    # in the blocker's inbox list. Symmetric so neither side can keep
    # poking after the other side blocked them.
    block_exists = session.exec(
        select(UserBlock).where(
            or_(
                and_(
                    UserBlock.blocker_user_id == current_user.id,
                    UserBlock.blocked_user_id == other_user_id,
                ),
                and_(
                    UserBlock.blocker_user_id == other_user_id,
                    UserBlock.blocked_user_id == current_user.id,
                ),
            )
        )
    ).first()
    if block_exists is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can't open a conversation with this user.",
        )

    pair_a = (current_user.id, other_user_id)
    pair_b = (other_user_id, current_user.id)
    existing = session.exec(
        select(Conversation).where(
            Conversation.request_id == None,  # noqa: E711
            or_(
                and_(
                    Conversation.teacher_id == pair_a[0],
                    Conversation.student_id == pair_a[1],
                ),
                and_(
                    Conversation.teacher_id == pair_b[0],
                    Conversation.student_id == pair_b[1],
                ),
            ),
        )
    ).first()
    if existing is not None:
        return StartDirectConversationResponse(conversation_id=existing.id)

    # Roles are nominally teacher/student but for a direct DM either
    # side can be either. Assign by best guess: a CREATOR-role caller
    # becomes the teacher; otherwise the other party is the teacher if
    # they are CREATOR, falling back to the caller.
    caller_is_creator = current_user.role == UserRole.TUTOR
    other_is_creator = other.role == UserRole.TUTOR
    if caller_is_creator and not other_is_creator:
        teacher_id, student_id = current_user.id, other.id
    elif other_is_creator and not caller_is_creator:
        teacher_id, student_id = other.id, current_user.id
    else:
        # Both creators, both students, or unclear — caller is teacher.
        teacher_id, student_id = current_user.id, other.id

    # Student-initiated flag controls the "one initial message" gate
    # below — when True the student gets one shot until the tutor
    # responds once. False bypasses the gate (tutor-initiated DMs
    # behave like normal open conversations).
    student_initiated = (current_user.id == student_id)
    conversation = Conversation(
        request_id=None,
        teacher_id=teacher_id,
        student_id=student_id,
        status=ConversationStatus.OPEN,
        student_initiated=student_initiated,
        updated_at=datetime.now(UTC),
    )
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return StartDirectConversationResponse(conversation_id=conversation.id)


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
    current_user: User = Depends(_send_message_limit),
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

    # Initial-message gate: when a student opens a direct conversation
    # they get one message to introduce themselves. The tutor must
    # respond at least once before the student can send more. This
    # keeps low-effort cold messages from flooding tutor inboxes
    # without blocking the genuine "introduce my goals" use case.
    is_student_sender = current_user.id == conversation.student_id
    if (
        conversation.student_initiated
        and is_student_sender
        and conversation.tutor_first_responded_at is None
    ):
        prior_student_msg = session.exec(
            select(Message).where(
                Message.conversation_id == conversation.id,
                Message.sender_id == current_user.id,
            )
        ).first()
        if prior_student_msg is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You've sent your intro — wait for the tutor to reply "
                    "before sending another message."
                ),
            )

    # Block check: refuse the send if either user has blocked the
    # other. Same shape as the WhatsApp/iMessage rule — symmetric so a
    # harasser can't keep pinging after the recipient blocks.
    other_user_id = (
        conversation.teacher_id if is_student_sender else conversation.student_id
    )
    block_exists = session.exec(
        select(UserBlock).where(
            or_(
                and_(
                    UserBlock.blocker_user_id == current_user.id,
                    UserBlock.blocked_user_id == other_user_id,
                ),
                and_(
                    UserBlock.blocker_user_id == other_user_id,
                    UserBlock.blocked_user_id == current_user.id,
                ),
            )
        )
    ).first()
    if block_exists is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can't send messages in this conversation.",
        )

    # Symmetric gate for marketplace conversations: a teacher reaches
    # out on a request, lands one intro message at create time, and is
    # blocked from sending more until the request author (the student)
    # writes back. Same anti-spam rationale, applied from the other
    # side. Marketplace = conversation has a backing Request row.
    is_marketplace = conversation.request_id is not None
    is_tutor_sender = current_user.id == conversation.teacher_id
    if is_marketplace and is_tutor_sender:
        student_has_replied = session.exec(
            select(Message).where(
                Message.conversation_id == conversation.id,
                Message.sender_id == conversation.student_id,
            )
        ).first()
        if student_has_replied is None:
            tutor_msg_count = session.exec(
                select(func.count(Message.id)).where(
                    Message.conversation_id == conversation.id,
                    Message.sender_id == conversation.teacher_id,
                )
            ).one()
            if tutor_msg_count >= 1:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "You've sent your intro — wait for the student to "
                        "reply before sending another message."
                    ),
                )

    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=message_in.content,
        is_read=False,
        replied_to_message_id=message_in.replied_to_message_id,
    )
    session.add(message)
    # If the tutor is replying for the first time in a student-initiated
    # thread, stamp the unlock so subsequent student messages are free.
    if (
        conversation.student_initiated
        and not is_student_sender
        and conversation.tutor_first_responded_at is None
    ):
        conversation.tutor_first_responded_at = datetime.now(UTC)
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
        deleted_at=message.deleted_at,
        attachment_url=message.attachment_url,
        attachment_kind=message.attachment_kind,
    )

    await manager.broadcast_to_conversation(
        _envelope(message_read_instance), conversation_id
    )

    # Push to the recipient's global WS so the inbox list + unread badge
    # update even when they're not viewing this thread. The per-conv WS
    # above only fires for clients in the conversation room — the global
    # WS is the only channel a teacher sitting on /messages (no thread
    # selected), the dashboard, or any other page receives. Send the
    # alert unconditionally; the client dedupes by `conversation_id`
    # against any open per-conv WS so we don't double-append. We also
    # ping the sender's other devices so a second tab stays in sync.
    recipient_id = (
        conversation.student_id
        if current_user.id == conversation.teacher_id
        else conversation.teacher_id
    )
    alert_payload = _envelope(
        {
            "type": "NEW_MESSAGE_ALERT",
            "conversation_id": conversation.id,
            "sender_id": current_user.id,
        }
    )
    await manager.send_user_notification(recipient_id, alert_payload)
    if recipient_id != current_user.id:
        await manager.send_user_notification(current_user.id, alert_payload)

    return message_read_instance


UNDO_WINDOW = timedelta(seconds=60)


@router.post("/{conversation_id}/messages/{message_id}/undo", response_model=MessageRead)
async def undo_message(
    conversation_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Retract a message inside the 60-second undo window. The row stays
    (so reply chains don't dangle); the client renders a deleted
    placeholder. Idempotent: undoing an already-deleted message
    returns the current state instead of erroring."""
    message = session.get(Message, message_id)
    if message is None or message.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found.")
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the sender can undo this message.")

    if message.deleted_at is None:
        created = message.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        if datetime.now(UTC) - created > UNDO_WINDOW:
            raise HTTPException(
                status_code=400,
                detail="The undo window has passed.",
            )
        message.deleted_at = datetime.now(UTC)
        message.content = ""
        session.add(message)
        session.commit()
        session.refresh(message)

    sender_user = session.get(User, message.sender_id)
    payload = MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content="",
        created_at=message.created_at,
        is_read=message.is_read,
        sender_full_name=sender_user.full_name if sender_user else "Deleted User",
        sender_avatar_url=sender_user.avatar_url if sender_user else None,
        message_type=message.message_type,
        deleted_at=message.deleted_at,
        attachment_url=None,
        attachment_kind=None,
    )
    await manager.broadcast_to_conversation(
        _envelope(
            {
                "type": "MESSAGE_DELETED",
                "conversation_id": conversation_id,
                "message_id": message.id,
            }
        ),
        conversation_id,
    )
    return payload


ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024  # 8 MiB raw upload
ATTACHMENT_MAX_DIM = 2048
ALLOWED_ATTACHMENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/{conversation_id}/messages/attachment", response_model=MessageRead)
async def send_attachment(
    conversation_id: int,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    current_user: User = Depends(_send_attachment_limit),
    session: Session = Depends(get_session),
):
    """Upload an image and attach it to a new chat message. Re-encodes
    to WebP server-side so the wire bytes stay small and EXIF metadata
    (which can leak GPS coordinates) is stripped."""
    from ..services import storage

    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if not (
        conversation.teacher_id == current_user.id or conversation.student_id == current_user.id
    ):
        raise HTTPException(status_code=403, detail="Not your conversation.")
    if conversation.status == ConversationStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Conversation is closed.")

    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    raw = await file.read()
    if len(raw) > ATTACHMENT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 8 MB).")

    try:
        from PIL import Image, ImageOps, UnidentifiedImageError

        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail(
            (ATTACHMENT_MAX_DIM, ATTACHMENT_MAX_DIM), Image.Resampling.LANCZOS
        )
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=82, method=6)
        body = buf.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        log.warning("Attachment decode failed: %s", exc)
        raise HTTPException(status_code=400, detail="Could not process that image.") from None

    key = f"chat/{conversation_id}/{current_user.id}/{secrets.token_hex(6)}.webp"
    public_url = storage.put_object(key=key, body=body, content_type="image/webp")

    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        content=(caption or "").strip(),
        is_read=False,
        attachment_url=public_url,
        attachment_kind="image",
    )
    session.add(message)
    conversation.updated_at = datetime.now(UTC)
    session.add(conversation)
    session.commit()
    session.refresh(message)

    sender_user = session.get(User, message.sender_id)
    payload = MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content=message.content,
        created_at=message.created_at,
        is_read=message.is_read,
        sender_full_name=sender_user.full_name if sender_user else "Deleted User",
        sender_avatar_url=sender_user.avatar_url if sender_user else None,
        message_type=message.message_type,
        attachment_url=message.attachment_url,
        attachment_kind=message.attachment_kind,
    )
    await manager.broadcast_to_conversation(_envelope(payload), conversation_id)

    recipient_id = (
        conversation.student_id
        if current_user.id == conversation.teacher_id
        else conversation.teacher_id
    )
    alert_payload = _envelope(
        {
            "type": "NEW_MESSAGE_ALERT",
            "conversation_id": conversation.id,
            "sender_id": current_user.id,
        }
    )
    await manager.send_user_notification(recipient_id, alert_payload)
    if recipient_id != current_user.id:
        await manager.send_user_notification(current_user.id, alert_payload)
    return payload


class ReportCreate(BaseModel):
    reason: ConversationReportReason = ConversationReportReason.OTHER
    note: str | None = None
    message_id: int | None = None


class ReportRead(BaseModel):
    id: int
    conversation_id: int
    message_id: int | None
    reporter_user_id: int
    reported_user_id: int
    reason: ConversationReportReason
    note: str | None
    status: ConversationReportStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.post("/{conversation_id}/report", response_model=ReportRead)
async def report_conversation(
    conversation_id: int,
    payload: ReportCreate,
    current_user: User = Depends(_report_limit),
    session: Session = Depends(get_session),
):
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if not (
        conversation.teacher_id == current_user.id or conversation.student_id == current_user.id
    ):
        raise HTTPException(status_code=403, detail="Not your conversation.")

    reported_id = (
        conversation.student_id
        if current_user.id == conversation.teacher_id
        else conversation.teacher_id
    )
    report = ConversationReport(
        conversation_id=conversation.id,
        message_id=payload.message_id,
        reporter_user_id=current_user.id,
        reported_user_id=reported_id,
        reason=payload.reason,
        note=(payload.note or None),
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return ReportRead.model_validate(report)


class BlockToggleResponse(BaseModel):
    blocked: bool


@router.post("/users/{user_id}/block", response_model=BlockToggleResponse)
def block_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Idempotent block. Returns the resulting state."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Can't block yourself.")
    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found.")

    existing = session.exec(
        select(UserBlock).where(
            UserBlock.blocker_user_id == current_user.id,
            UserBlock.blocked_user_id == user_id,
        )
    ).first()
    if existing is None:
        session.add(UserBlock(blocker_user_id=current_user.id, blocked_user_id=user_id))
        session.commit()
    return BlockToggleResponse(blocked=True)


@router.delete("/users/{user_id}/block", response_model=BlockToggleResponse)
def unblock_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(UserBlock).where(
            UserBlock.blocker_user_id == current_user.id,
            UserBlock.blocked_user_id == user_id,
        )
    ).first()
    if existing is not None:
        session.delete(existing)
        session.commit()
    return BlockToggleResponse(blocked=False)


@router.get("/users/{user_id}/block", response_model=BlockToggleResponse)
def is_user_blocked(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(UserBlock).where(
            UserBlock.blocker_user_id == current_user.id,
            UserBlock.blocked_user_id == user_id,
        )
    ).first()
    return BlockToggleResponse(blocked=existing is not None)


@router.post("/{conversation_id}/offer", response_model=MessageRead)
async def make_offer(
    conversation_id: int,
    offer_in: OfferCreate,
    current_user: User = Depends(_offer_limit),
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
        _envelope(message_read_instance), conversation_id
    )

    return message_read_instance


@router.post("/messages/{message_id}/accept-offer", response_model=Project)
async def accept_offer(
    message_id: int,
    current_user: User = Depends(_offer_limit),
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

    # Direct (booking-flow) conversations have request_id=None — the
    # marketplace offer flow doesn't apply there. Catch it explicitly
    # so we don't NoneType-crash later when looking up the Request.
    if conversation.request_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offers are only available on marketplace conversations.",
        )

    offer_message.offer_status = OfferStatus.ACCEPTED
    session.add(offer_message)

    request = session.get(Request, conversation.request_id)
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The underlying request was removed.",
        )
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
        _envelope({"type": "OFFER_ACCEPTED", "project_id": new_project.id}), conversation.id
    )

    # Close all conversations for this request
    all_conversations = session.exec(
        select(Conversation).where(Conversation.request_id == request.id)
    ).all()
    for conv in all_conversations:
        conv.status = ConversationStatus.CLOSED
        session.add(conv)
        await manager.broadcast_to_conversation(
            _envelope({"type": "CONVERSATION_CLOSED"}), conv.id
        )

    session.commit()
    session.refresh(new_project)

    return new_project


@router.post("/messages/{message_id}/reject-offer")
async def reject_offer(
    message_id: int,
    current_user: User = Depends(_offer_limit),
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

    # Same guard as accept_offer: a direct DM has no Request to blacklist.
    if conversation.request_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offers are only available on marketplace conversations.",
        )

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
        _envelope({"type": "CONVERSATION_CLOSED"}), conversation.id
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
            _envelope(
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
            _envelope(
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
    current_user: User = Depends(_demo_video_limit),
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

    # Re-requesting is allowed — a teacher might want a fresh sample
    # after the first one was unusable. Wiping the prior URL means the
    # student's submit form lights back up the next time they open the
    # thread.
    conversation.demo_video_requested = True
    conversation.student_demo_video_url = None
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
        _envelope(message_read_instance), conversation_id
    )

    return message_read_instance


@router.patch("/{conversation_id}/demo-video", response_model=MessageRead)
async def update_demo_video_url(
    conversation_id: int,
    demo_video_in: DemoVideoUpdate,
    current_user: User = Depends(_demo_video_limit),
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
        _envelope(message_read_instance), conversation_id
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
    user = session.get(User, int(user_id))
    if user is None:
        return None
    # Honour the same iat / token_invalidation_at gate the HTTP path
    # enforces — a stale JWT after a logout-everywhere should not be
    # able to re-open a WebSocket.
    iat = payload.get("iat")
    if user.token_invalidation_at is not None and iat is not None:
        bound = user.token_invalidation_at
        if bound.tzinfo is None:
            from datetime import UTC as _UTC
            bound = bound.replace(tzinfo=_UTC)
        from datetime import UTC as _UTC, datetime as _dt
        if _dt.fromtimestamp(int(iat), tz=_UTC) < bound:
            return None
    return user


async def _ws_auth(websocket: WebSocket, token: str | None, session: Session) -> User | None:
    """Resolve the user for a WS upgrade.

    Order: the cookie carried by the upgrade handshake (preferred — it
    matches the SPA's session cookie and isn't logged in URLs), then
    the ``?token=`` query param (legacy fallback so existing clients
    that pass the JWT in the URL keep working).

    Custom domains: the shared SSO cookie is bound to ``.kotobaseed.net``
    so it's not sent on a tutor's vanity host. The ``?token=`` fallback
    is the path that path uses — the frontend's AuthContext stamps the
    JWT into localStorage when the user signs in, and the WS clients
    (InboxContext, Inbox.jsx) pass it as ``?token=`` on the upgrade.
    """
    from ..security import AUTH_COOKIE_NAME

    cookie_token = websocket.cookies.get(AUTH_COOKIE_NAME)
    candidate = cookie_token or token
    return await get_user_from_token(candidate, session)


@router.websocket("/{conversation_id}/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: int,
    token: str | None = Query(default=None),
    session: Session = Depends(get_session),
):
    user = await _ws_auth(websocket, token, session)
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
                kind = payload.get("type")
                if kind in ("TYPING_ON", "TYPING_OFF"):
                    # Silently drop excess typing events. The web client
                    # coalesces to ~1 TYPING_ON per 2s, so a well-behaved
                    # session sits well under the limit; a malicious
                    # client trying to fan out broadcast spam through
                    # the room gets cut off here without disconnecting
                    # the socket. Per (user, conversation) so two
                    # concurrent threads each get their own budget.
                    if not _ws_event_allowed(
                        f"ws_typing:{user.id}:{conversation_id}",
                        limit=40,
                        window_seconds=60,
                    ):
                        continue
                    # Forward to the rest of the room, tagged with the
                    # sender id so the client knows whether the dot is
                    # theirs (suppress) or the peer's (show).
                    out = _envelope({"type": kind, "sender_id": user.id})
                    await manager.broadcast_to_conversation(out, conversation_id)
                    continue
                if kind == "READ_RECEIPT":
                    # Read-receipt bulk-updates messages + recalculates
                    # total unread count across every conversation the
                    # user is in. Cheap per call but expensive to spam;
                    # gate at 60/min per user across conversations.
                    if not _ws_event_allowed(
                        f"ws_read:{user.id}",
                        limit=60,
                        window_seconds=60,
                    ):
                        continue
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

                        notification_payload = _envelope(
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
    websocket: WebSocket,
    token: str | None = Query(default=None),
    session: Session = Depends(get_session),
):
    user = await _ws_auth(websocket, token, session)
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
