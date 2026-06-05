from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


# Enums
class UserRole(str, Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    MODERATOR = "moderator"
    ADMIN = "admin"


class SubscriptionTier(str, Enum):
    NONE = "none"
    PLUS = "plus"
    PREMIUM = "premium"
    PRO = "pro"


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    FUNDING = "funding"
    SUCCESSFUL = "successful"
    PENDING_CONFIRMATION = "pending_confirmation"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ON_HOLD = "on_hold"


class PledgeStatus(str, Enum):
    PENDING = "pending"
    CAPTURED = "captured"
    REFUNDED = "refunded"
    PAID_BY_CREDIT = "paid_by_credit"


class RequestStatus(str, Enum):
    OPEN = "open"
    NEGOTIATING = "negotiating"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class VerificationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ConversationStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class MessageType(str, Enum):
    TEXT = "text"
    OFFER = "offer"
    DEMO_REQUEST = "demo_request"
    DEMO_VIDEO = "demo_video"


class OfferStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class PriorityCreditStatus(str, Enum):
    AVAILABLE = "available"
    USED = "used"


# Association table for User and LanguageGroup
class UserLanguageGroup(SQLModel, table=True):
    user_id: int | None = Field(default=None, foreign_key="user.id", primary_key=True)
    group_id: int | None = Field(default=None, foreign_key="languagegroup.id", primary_key=True)


# New Association table for User and Achievement
class UserAchievement(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    achievement_id: int = Field(foreign_key="achievement.id", primary_key=True)
    unlocked_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# Database Models
class LanguageGroup(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    language_name: str = Field(unique=True, index=True)

    members: list["User"] = Relationship(
        back_populates="language_groups", link_model=UserLanguageGroup
    )


class TeacherFollower(SQLModel, table=True):
    teacher_id: int = Field(foreign_key="user.id", primary_key=True)
    student_id: int = Field(foreign_key="user.id", primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    full_name: str
    role: UserRole = Field(default=UserRole.STUDENT)
    bio: str | None = None
    languages: str | None = None
    intro_video_url: str | None = None
    sample_video_url: str | None = None
    avatar_url: str | None = None

    stripe_customer_id: str | None = None
    stripe_account_id: str | None = None
    charges_enabled: bool = Field(default=False)
    payouts_enabled: bool = Field(default=False)

    subscription_tier: SubscriptionTier = Field(default=SubscriptionTier.NONE)
    subscription_expires_at: datetime | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = Field(default=None)

    taught_projects: list["Project"] = Relationship(back_populates="teacher")
    pledges: list["Pledge"] = Relationship(back_populates="user")
    notifications: list["Notification"] = Relationship(back_populates="user")
    requests: list["Request"] = Relationship(
        back_populates="user", sa_relationship_kwargs={"foreign_keys": "Request.user_id"}
    )
    project_ratings: list["ProjectRating"] = Relationship(back_populates="user")
    video_comments: list["VideoComment"] = Relationship(back_populates="user")
    verifications: list["TeacherVerification"] = Relationship(back_populates="teacher")
    priority_credits: list["PriorityCredit"] = Relationship(back_populates="user")
    achievements: list["Achievement"] = Relationship(
        back_populates="users", link_model=UserAchievement
    )

    # Follower relationships
    followers: list["User"] = Relationship(
        back_populates="following",
        link_model=TeacherFollower,
        sa_relationship_kwargs={
            "primaryjoin": "User.id==TeacherFollower.teacher_id",
            "secondaryjoin": "User.id==TeacherFollower.student_id",
        },
    )
    following: list["User"] = Relationship(
        back_populates="followers",
        link_model=TeacherFollower,
        sa_relationship_kwargs={
            "primaryjoin": "User.id==TeacherFollower.student_id",
            "secondaryjoin": "User.id==TeacherFollower.teacher_id",
        },
    )

    # Language group relationship
    language_groups: list["LanguageGroup"] = Relationship(
        back_populates="members", link_model=UserLanguageGroup
    )

    # Messaging relationships
    sent_messages: list["Message"] = Relationship(back_populates="sender")
    conversations_as_teacher: list["Conversation"] = Relationship(
        back_populates="teacher", sa_relationship_kwargs={"foreign_keys": "Conversation.teacher_id"}
    )
    conversations_as_student: list["Conversation"] = Relationship(
        back_populates="student", sa_relationship_kwargs={"foreign_keys": "Conversation.student_id"}
    )

    @property
    def is_pro_subscriber(self) -> bool:
        return self.role == UserRole.TEACHER and self.subscription_tier == SubscriptionTier.PRO


class TeacherVerification(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    language: str
    document_url: str
    status: VerificationStatus = Field(default=VerificationStatus.PENDING)
    admin_notes: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    reviewed_at: datetime | None = None

    teacher_id: int = Field(foreign_key="user.id")
    teacher: "User" = Relationship(back_populates="verifications")


class Project(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    description: str
    language: str = Field(index=True)
    level: str = Field(index=True)
    tags: str | None = None

    funding_goal: int
    current_funding: int = Field(default=0)
    total_tipped_amount: int = Field(default=0)

    deadline: datetime | None = None
    delivery_days: int | None = None
    status: ProjectStatus = Field(default=ProjectStatus.DRAFT)

    is_private: bool = Field(default=False)

    stripe_transfer_id: str | None = None
    origin_request_id: int | None = Field(default=None, foreign_key="request.id")

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    funded_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)

    teacher_id: int | None = Field(default=None, foreign_key="user.id")
    teacher: User | None = Relationship(back_populates="taught_projects")

    request: Optional["Request"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Project.origin_request_id"}
    )

    videos: list["Video"] = Relationship(back_populates="project")
    pledges: list["Pledge"] = Relationship(back_populates="project")
    updates: list["ProjectUpdate"] = Relationship(back_populates="project")
    ratings: list["ProjectRating"] = Relationship(back_populates="project")

    # New fields for multi-video projects
    is_series: bool = Field(default=False)
    num_videos: int | None = None
    price_per_video: int | None = None
    project_image_url: str | None = None
    series_intro_video_url: str | None = None


class ProjectUpdate(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    project_id: int = Field(foreign_key="project.id")
    project: Project | None = Relationship(back_populates="updates")


class VideoResource(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    url: str
    video_id: int = Field(foreign_key="video.id")
    video: "Video" = Relationship(back_populates="resources")


class Video(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    url: str
    platform: str = Field(default="youtube")
    duration: int | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    project_id: int | None = Field(default=None, foreign_key="project.id")
    project: Project | None = Relationship(back_populates="videos")

    comments: list["VideoComment"] = Relationship(back_populates="video")
    resources: list["VideoResource"] = Relationship(back_populates="video")


class ProjectRating(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    rating: int
    comment: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    teacher_response: str | None = None
    response_created_at: datetime | None = None

    user_id: int = Field(foreign_key="user.id")
    user: User | None = Relationship(back_populates="project_ratings")

    project_id: int = Field(foreign_key="project.id")
    project: Project | None = Relationship(back_populates="ratings")


class VideoComment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    user_id: int = Field(foreign_key="user.id")
    user: User | None = Relationship(back_populates="video_comments")

    video_id: int = Field(foreign_key="video.id")
    video: Video | None = Relationship(back_populates="comments")


class Pledge(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    amount: int
    status: PledgeStatus = Field(default=PledgeStatus.PENDING)

    checkout_session_id: str | None = Field(default=None, unique=True, index=True, nullable=True)
    payment_intent_id: str | None = Field(default=None, unique=True, index=True, nullable=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    user_id: int | None = Field(default=None, foreign_key="user.id")
    user: User | None = Relationship(back_populates="pledges")

    project_id: int | None = Field(default=None, foreign_key="project.id")
    project: Project | None = Relationship(back_populates="pledges")


class Request(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    description: str
    language: str
    level: str

    budget: int = Field(default=0)
    target_teacher_id: int | None = Field(default=None, foreign_key="user.id")
    counter_offer_amount: int | None = None
    status: RequestStatus = Field(default=RequestStatus.OPEN)
    is_private: bool = Field(default=False)

    priority_credit_id: int | None = Field(default=None, foreign_key="prioritycredit.id")

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    user_id: int | None = Field(default=None, foreign_key="user.id")
    user: User | None = Relationship(
        back_populates="requests", sa_relationship_kwargs={"foreign_keys": "Request.user_id"}
    )

    target_teacher: User | None = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Request.target_teacher_id"}
    )
    conversations: list["Conversation"] = Relationship(back_populates="request")

    # New fields for multi-video requests
    is_series: bool = Field(default=False)
    num_videos: int | None = None


class Notification(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    message: str
    is_read: bool = Field(default=False)
    link: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    user_id: int | None = Field(default=None, foreign_key="user.id")
    user: User | None = Relationship(back_populates="notifications")


class RequestBlacklist(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    request_id: int = Field(foreign_key="request.id")
    teacher_id: int = Field(foreign_key="user.id")


class Conversation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    request_id: int = Field(foreign_key="request.id", index=True)
    teacher_id: int = Field(foreign_key="user.id", index=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    status: ConversationStatus = Field(default=ConversationStatus.OPEN)
    student_demo_video_url: str | None = None
    demo_video_requested: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    request: Optional["Request"] = Relationship(back_populates="conversations")
    teacher: Optional["User"] = Relationship(
        back_populates="conversations_as_teacher",
        sa_relationship_kwargs={"foreign_keys": "Conversation.teacher_id"},
    )
    student: Optional["User"] = Relationship(
        back_populates="conversations_as_student",
        sa_relationship_kwargs={"foreign_keys": "Conversation.student_id"},
    )
    messages: list["Message"] = Relationship(
        back_populates="conversation",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "Message.created_at"},
    )


class Message(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    sender_id: int = Field(foreign_key="user.id", index=True)
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    is_read: bool = Field(default=False)
    replied_to_message_id: int | None = Field(default=None, foreign_key="message.id")

    message_type: MessageType = Field(default=MessageType.TEXT)
    offer_description: str | None = None
    offer_price: int | None = None
    offer_status: OfferStatus | None = Field(default=None)
    offer_title: str | None = None
    offer_language: str | None = None
    offer_level: str | None = None
    offer_tags: str | None = None

    # New fields for multi-video offers
    offer_is_series: bool | None = None
    offer_num_videos: int | None = None
    offer_price_per_video: int | None = None

    conversation: Optional["Conversation"] = Relationship(back_populates="messages")
    sender: Optional["User"] = Relationship(back_populates="sent_messages")
    replied_to_message: Optional["Message"] = Relationship(
        sa_relationship_kwargs={"remote_side": "Message.id"}
    )


# New Models
class PriorityCredit(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(UTC) + timedelta(days=30))
    status: PriorityCreditStatus = Field(default=PriorityCreditStatus.AVAILABLE)
    used_on_request_id: int | None = Field(default=None, foreign_key="request.id")

    user: "User" = Relationship(back_populates="priority_credits")


class Achievement(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    name: str
    description: str
    icon_url: str | None = None

    users: list["User"] = Relationship(back_populates="achievements", link_model=UserAchievement)
