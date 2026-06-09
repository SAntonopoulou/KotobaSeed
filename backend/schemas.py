from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator

from .models import (
    ConversationStatus,
    MessageType,
    OfferStatus,
    ProjectStatus,
    RequestStatus,
    UserRole,
)


def _utc_aware(v):
    """Naive-datetime → UTC-aware. Pydantic field_validator(mode="before")
    target so timestamps land in ISO strings with a Z suffix and the
    browser doesn't shift them by the user's local offset."""
    if v is None or not isinstance(v, datetime):
        return v
    if v.tzinfo is None:
        return v.replace(tzinfo=UTC)
    return v


class RequestCreate(BaseModel):
    title: str
    description: str
    language: str
    level: str
    budget: int = 0
    target_teacher_id: int | None = None
    is_private: bool = False
    is_series: bool = False
    num_videos: int | None = None


class RequestRead(BaseModel):
    id: int
    title: str
    description: str
    language: str
    level: str
    budget: int
    status: RequestStatus
    target_teacher_id: int | None
    counter_offer_amount: int | None
    is_private: bool
    created_at: datetime
    user_id: int
    user_name: str
    associated_project_id: int | None = None
    project_title: str | None = None
    project_description: str | None = None
    project_funding_goal: int | None = None
    tags: str | None = None  # Added tags field
    is_series: bool = False
    num_videos: int | None = None

    model_config = ConfigDict(from_attributes=True)


class ProjectCreate(BaseModel):
    title: str
    description: str
    language: str
    level: str
    funding_goal: int
    delivery_days: int
    tags: str | None = None
    is_series: bool = False
    num_videos: int | None = None
    price_per_video: int | None = None
    project_image_url: str | None = None
    series_intro_video_url: str | None = None


class ProjectUpdateModel(BaseModel):
    title: str | None = None
    description: str | None = None
    language: str | None = None
    level: str | None = None
    funding_goal: int | None = None
    deadline: datetime | None = None
    delivery_days: int | None = None
    status: ProjectStatus | None = None
    tags: str | None = None
    project_image_url: str | None = None
    series_intro_video_url: str | None = None


class UpdateCreate(BaseModel):
    content: str


class UpdateRead(BaseModel):
    id: int
    content: str
    created_at: datetime
    project_id: int

    model_config = ConfigDict(from_attributes=True)


class BackerRead(BaseModel):
    id: int
    full_name: str
    avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LanguageLevelsRead(BaseModel):
    language: str
    levels: list[str]


class MyRatingRead(BaseModel):
    rating: int
    comment: str | None = None


class FilterOptionsRead(BaseModel):
    languages: list[LanguageLevelsRead]


class ProjectRead(BaseModel):
    id: int
    title: str
    description: str
    language: str
    level: str
    tags: str | None = None
    funding_goal: int
    current_funding: int
    total_tipped_amount: int = 0
    deadline: datetime | None = None
    delivery_days: int | None = None
    status: ProjectStatus
    is_private: bool
    created_at: datetime
    updated_at: datetime
    funded_at: datetime | None = None
    completed_at: datetime | None = None
    teacher_id: int
    teacher_name: str
    teacher_avatar_url: str | None = None
    teacher_stripe_account_id: str | None = None
    teacher_verified_languages: list[str] = []  # New field
    origin_request_id: int | None = None
    origin_request_title: str | None = None
    origin_request_student_name: str | None = None
    videos: list[str] = []  # Assuming list of video URLs or IDs
    is_backed_by_user: bool = False
    is_owner: bool = False
    is_teacher_verified: bool = False
    is_following_teacher: bool = False
    average_rating: float | None = None
    total_ratings: int = 0
    my_rating: MyRatingRead | None = None
    is_series: bool = False
    num_videos: int | None = None
    price_per_video: int | None = None
    project_image_url: str | None = None
    series_intro_video_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedProjectRead(BaseModel):
    projects: list[ProjectRead]
    total_count: int


class ProjectResponse(BaseModel):
    id: int
    title: str
    description: str
    language: str
    level: str
    funding_goal: int
    status: ProjectStatus
    teacher_id: int
    origin_request_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class CounterOffer(BaseModel):
    amount: int


class ConversationCreate(BaseModel):
    request_id: int


class MessageCreate(BaseModel):
    content: str
    replied_to_message_id: int | None = None


class OfferCreate(BaseModel):
    offer_description: str
    offer_price: int
    title: str
    language: str
    level: str
    tags: str | None = None
    is_series: bool | None = None
    num_videos: int | None = None
    price_per_video: int | None = None


class DemoVideoUpdate(BaseModel):
    url: str


class UserPublicRead(BaseModel):
    id: int
    full_name: str
    avatar_url: str | None = None
    role: UserRole

    model_config = ConfigDict(from_attributes=True)


class MessageRead(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str
    created_at: datetime
    is_read: bool
    sender_full_name: str
    sender_avatar_url: str | None = None
    replied_to_message_id: int | None = None
    replied_to_message_content: str | None = None
    replied_to_sender_name: str | None = None
    message_type: MessageType
    offer_description: str | None = None
    offer_price: int | None = None
    offer_status: OfferStatus | None = None
    offer_title: str | None = None
    offer_language: str | None = None
    offer_level: str | None = None
    offer_tags: str | None = None
    offer_is_series: bool | None = None
    offer_num_videos: int | None = None
    offer_price_per_video: int | None = None
    # Undo-send + attachments. deleted_at flipped non-null means the
    # sender retracted within the 60-second window; clients should
    # render a "Message deleted" placeholder and ignore content.
    deleted_at: datetime | None = None
    attachment_url: str | None = None
    attachment_kind: str | None = None

    @field_validator("created_at", "deleted_at", mode="before")
    @classmethod
    def _ensure_utc(cls, v):
        return _utc_aware(v)

    model_config = ConfigDict(from_attributes=True)


class ConversationRead(BaseModel):
    id: int
    # Nullable: direct (booking-flow / dashboard) conversations don't
    # belong to any marketplace request.
    request_id: int | None = None
    teacher_id: int
    student_id: int
    status: ConversationStatus
    student_demo_video_url: str | None = None
    demo_video_requested: bool = False
    created_at: datetime
    updated_at: datetime

    request: RequestRead | None = None
    teacher: UserPublicRead
    student: UserPublicRead
    messages: list[MessageRead] = []

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _ensure_utc(cls, v):
        return _utc_aware(v)

    model_config = ConfigDict(from_attributes=True)


class ConversationSummaryRead(BaseModel):
    id: int
    request_id: int | None = None
    teacher_id: int
    student_id: int
    status: ConversationStatus
    updated_at: datetime

    # Nullable since direct conversations (booking-flow DMs, message
    # buttons on dashboards) have no marketplace request behind them.
    request_title: str | None = None
    other_participant: UserPublicRead
    last_message_content: str | None = None
    last_message_created_at: datetime | None = None
    unread_messages_count: int = 0

    @field_validator("updated_at", "last_message_created_at", mode="before")
    @classmethod
    def _ensure_utc(cls, v):
        return _utc_aware(v)

    model_config = ConfigDict(from_attributes=True)


class InboxSummary(BaseModel):
    conversations: list[ConversationSummaryRead]
    total_unread_count: int
