from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


# Enums
class UserRole(str, Enum):
    """The user's primary persona.

    - student: browses, learns, pledges, books lessons
    - creator: makes comprehensible-input content on the marketplace
      (previously called "teacher" — same role, clearer name)
    - moderator, admin: platform staff

    A Creator who also runs one-to-one tutoring is a Creator with a Tutor
    row attached. "Tutor" is not a separate User.role — it's a Creator
    who's added the tutor-site half on top.
    """

    STUDENT = "student"
    CREATOR = "creator"
    MODERATOR = "moderator"
    SUPPORT = "support"  # staff tier 1 — handles support tickets
    MANAGER = "manager"  # staff tier 2 — handles escalations, content review
    ADMIN = "admin"  # staff tier 3 — full platform control


class SubscriptionTier(str, Enum):
    """Single subscription tier on User. Gates platform features for everyone.

    Tutors who go PRO or BUSINESS additionally get tutor-side perks (0% lesson
    fee, higher classroom minute quota, custom domain) — those derive from the
    user's tier, not from Tutor.plan, so a tutor never needs to upgrade twice.
    """

    FREE = "free"
    PLUS = "plus"  # student-side perks: priority credits, premium content
    PRO = "pro"  # teacher + tutor perks (verifications, analytics, 0% lesson fee, etc.)
    BUSINESS = "business"  # schools: 5 seats, no Kotobaseed branding, priority support
    # NOTE: If you ever rename a value here, ship a data migration to
    # rewrite the column too — SQLAlchemy's Enum type uses a dict lookup
    # against enum names, and any stray value raises LookupError on read
    # which 500s every endpoint that joins User. See migration
    # 20260617_normalize_subscription_tier for the pattern.


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
    EXPIRED = "expired"


# ---------------------------------------------------------------------------
# Multi-tenant tutor platform (Kotobaseed) enums
# ---------------------------------------------------------------------------


class TutorPlan(str, Enum):
    """Which billing model the tutor is on for their instructor site."""

    STARTER = "starter"  # €0/mo + 5% Application Fee on tutoring revenue
    PRO = "pro"  # flat monthly fee, 0% Application Fee


class TutorAccountStatus(str, Enum):
    """High-level lifecycle state for the tutor account."""

    PAUSED_KYC = "paused_kyc"  # not yet finished Stripe Connect onboarding
    ACTIVE = "active"
    PAUSED_DORMANT = "paused_dormant"  # 30+ days no lesson on Starter
    PAUSED_BILLING = "paused_billing"  # 60+ days failed subscription on Pro
    SUSPENDED = "suspended"  # admin action


class OveragePolicy(str, Enum):
    """What happens when a tutor exceeds their monthly classroom minutes."""

    BLOCK = "block"  # classroom refuses to start
    AUTO_BILL = "auto_bill"  # bills the card on file at the configured rate


class TutorVerificationKind(str, Enum):
    """The kind of credential a verification record attests to."""

    LANGUAGE_PROFICIENCY = "language_proficiency"  # native speaker, fluency cert
    TEACHING_CREDENTIAL = "teaching_credential"  # CELTA, DELE, JLPT N1, degree
    IDENTITY = "identity"  # auto-granted by Stripe Connect KYC


class StudentEnrollmentStatus(str, Enum):
    """Whether a student is active on a specific tutor's site."""

    ACTIVE = "active"
    INACTIVE = "inactive"


class TutorPageSectionType(str, Enum):
    """The library of landing-page section blocks a tutor can pick from."""

    HERO_PORTRAIT = "hero_portrait"
    FEATURES_GRID = "features_grid"
    LEVELS_ALPHABET = "levels_alphabet"
    PRICING_GRID = "pricing_grid"
    ABOUT_PORTRAIT = "about_portrait"
    REVIEWS_GRID = "reviews_grid"
    FAQ_ACCORDION = "faq_accordion"
    VIDEO_EMBED = "video_embed"
    CTA_BAND = "cta_band"
    LANGUAGE_INTRO = "language_intro"


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
    is_active: bool = Field(default=True, index=True)
    timezone: str = Field(default="UTC", max_length=64)
    bio: str | None = None
    languages: str | None = None
    intro_video_url: str | None = None
    sample_video_url: str | None = None
    avatar_url: str | None = None

    stripe_customer_id: str | None = None
    stripe_account_id: str | None = None
    charges_enabled: bool = Field(default=False)
    payouts_enabled: bool = Field(default=False)

    subscription_tier: SubscriptionTier = Field(default=SubscriptionTier.FREE)
    subscription_expires_at: datetime | None = None

    # GDPR consent — captured at signup; required to create an account.
    newsletter_opt_in: bool = Field(default=False)
    # Public-profile opt-out for students. Teachers and tutors are always
    # public (it's their business face) — the /profile/<id> endpoint enforces
    # this rule, so for non-student roles the value is effectively ignored.
    profile_public: bool = Field(default=True)
    gdpr_consent_at: datetime | None = Field(default=None)
    gdpr_consent_ip: str | None = Field(default=None, max_length=64)

    # Email verification — 6-digit code hashed in DB so a leak can't be replayed.
    email_verified_at: datetime | None = Field(default=None)
    email_verification_code_hash: str | None = Field(default=None, max_length=255)
    email_verification_expires_at: datetime | None = Field(default=None)

    # Password reset — opaque token hashed in DB. Same shape as email
    # verification: a short-TTL stamped hash, validated and cleared on use.
    password_reset_token_hash: str | None = Field(default=None, max_length=255)
    password_reset_expires_at: datetime | None = Field(default=None)

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
        return self.role == UserRole.CREATOR and self.subscription_tier in (
            SubscriptionTier.PRO,
            SubscriptionTier.BUSINESS,
        )


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


class AuditLog(SQLModel, table=True):
    """A durable record of admin and system actions.

    Wire admin endpoints to `services.audit.record_audit(...)` so we have an
    after-the-fact paper trail of who did what. Failures inside record_audit
    are swallowed — an audit-write hiccup must never roll back the action
    that prompted it.
    """

    __tablename__ = "audit_log"

    id: int | None = Field(default=None, primary_key=True)
    # Null actor_user_id = system action (e.g. cron job). The string actor_label
    # always has something human-readable for the admin UI.
    actor_user_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    actor_label: str = Field(max_length=120)
    action: str = Field(max_length=80, index=True)
    target_type: str | None = Field(default=None, max_length=40, index=True)
    target_id: int | None = Field(default=None, index=True)
    summary: str = Field(max_length=500)
    details_json: str | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )


class BookingStatus(str, Enum):
    PENDING_PAYMENT = "pending_payment"  # Stripe Checkout created, awaiting webhook
    CONFIRMED = "confirmed"  # paid, scheduled, waiting for the lesson
    COMPLETED = "completed"  # tutor marked the lesson done
    CANCELLED = "cancelled"  # before the lesson; pre-refund-window
    REFUNDED = "refunded"  # refunded inside the 14-day window


class Booking(SQLModel, table=True):
    """One student-buys-and-schedules-a-lesson event.

    A Booking always references a LessonPack (the product the student bought)
    plus a single scheduled slot. If a pack contains multiple lessons, each
    one is a separate Booking row pointing at the same pack — that way
    cancellation, classroom-minute tracking, and the refund window are all
    per-lesson, not per-pack.
    """

    __tablename__ = "booking"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    lesson_pack_id: int = Field(foreign_key="lesson_pack.id", index=True)
    scheduled_at: datetime = Field(index=True)
    duration_minutes: int = Field(ge=15, le=240)
    # Snapshot price + currency from the pack at purchase time so later edits
    # to the pack don't rewrite this booking's history.
    price_cents: int = Field(ge=0)
    currency: str = Field(max_length=3)
    platform_fee_cents: int = Field(default=0, ge=0)
    status: BookingStatus = Field(default=BookingStatus.PENDING_PAYMENT, index=True)
    # Stripe wiring
    stripe_checkout_session_id: str | None = Field(default=None, max_length=128, index=True)
    stripe_payment_intent_id: str | None = Field(default=None, max_length=128, index=True)
    # Daily.co classroom — populated on first join (lazy).
    daily_room_name: str | None = Field(default=None, max_length=128)
    daily_room_url: str | None = Field(default=None, max_length=512)
    # Lifecycle timestamps
    paid_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    cancelled_at: datetime | None = Field(default=None)
    refunded_at: datetime | None = Field(default=None)
    # Reminder dedup — the hourly sweep stamps this when it sends the 24h
    # reminder so we don't double-send if the job runs more than once in
    # the window.
    reminder_sent_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorAvailability(SQLModel, table=True):
    """A recurring weekly window when the tutor is available for bookings.

    Times live in the tutor's own timezone (which is `tutor.user.timezone`).
    Each row is one contiguous availability block — multiple per day are
    fine (e.g. 09:00-12:00 then 14:00-17:00 with a break in the middle).
    `start_minute` and `end_minute` are minutes from local-midnight, so
    09:30 = 570, 17:00 = 1020, etc.
    """

    __tablename__ = "tutor_availability"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    # 0 = Monday … 6 = Sunday (ISO weekday minus one).
    weekday: int = Field(ge=0, le=6, index=True)
    start_minute: int = Field(ge=0, le=1440)
    end_minute: int = Field(ge=0, le=1440)
    # When True, this window is ALSO eligible for free-trial bookings. A
    # superset flag on regular availability — never carves out paid hours.
    # Lets a tutor say "9-10am is open to trials too" while keeping their
    # 10am-noon peak hours paid-only.
    allow_trial: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LessonPack(SQLModel, table=True):
    """A lesson package a tutor sells to students.

    Three flavors, distinguished by `num_lessons` and `is_trial`:
      - Free trial (is_trial=True, price_cents=0, num_lessons=1) — auto-
        maintained when the tutor toggles `Tutor.offers_free_trial`. Hidden
        from the "regular packs" list in the dashboard.
      - Single lesson (is_trial=False, num_lessons=1) — shown as a single
        lesson card on the tutor's site, distinct from multi-lesson packs
        to keep the buying decision simple.
      - Multi-lesson pack (is_trial=False, num_lessons>1) — bulk-buy with
        a discount, often.

    Deactivating is preferred over delete so historical bookings that
    reference an old pack stay readable.

    The price stored here is the full price the student pays; the platform
    fee (5% Free/Plus, 0% Pro/Business) is computed at checkout time and
    deducted via Stripe Application Fees on Connect. Trial packs skip
    Stripe entirely.
    """

    __tablename__ = "lesson_pack"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    name: str = Field(max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    num_lessons: int = Field(ge=1)
    duration_minutes: int = Field(ge=15, le=240, description="Length of one lesson")
    price_cents: int = Field(ge=0)
    currency: str = Field(default="eur", max_length=3)
    is_active: bool = Field(default=True, index=True)
    # Auto-managed trial pack. Hidden from the regular-packs UI; reachable
    # only through the tutor's trial settings + the public trial-book flow.
    is_trial: bool = Field(default=False, index=True)
    # The tutor's headline single-lesson offering. Edited via a dedicated
    # dashboard widget rather than the LessonPackManager grid — most tutors
    # only have one single-lesson price, and the inline editor keeps that
    # common case simple. Public site renders this pack (and any other
    # num_lessons=1 packs) inline above the multi-lesson packs.
    is_default_single: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PlacementTest(SQLModel, table=True):
    """One placement test per tutor — students take it to find their level
    before booking. Reuses the homework question schema (mc_single,
    mc_multi, fill_blank, short_answer) so the same grading engine works.

    Unique on tutor_id: one active test per tutor. To replace it, update
    the row rather than insert a new one.
    """

    __tablename__ = "placement_test"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", unique=True, index=True)
    title: str = Field(default="Placement test", max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    # Tutor's optional band labels for displaying a level guess to the
    # student after they finish ("80%+ → B2"). Stored as JSON list of
    # `{"min_percent": int, "label": str}` entries.
    level_bands_json: str = Field(default="[]", max_length=8000)
    questions_json: str = Field(default="[]", max_length=200_000)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PlacementSubmission(SQLModel, table=True):
    """A student's submission for a tutor's placement test.

    Students can re-take — each submission is a new row so the tutor sees
    progression. Score breakdown stored as JSON for the same per-question
    drilldown the homework system shows.
    """

    __tablename__ = "placement_submission"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    answers_json: str = Field(default="{}", max_length=200_000)
    per_question_results_json: str = Field(default="{}", max_length=200_000)
    auto_score: int = Field(default=0, ge=0)
    max_score: int = Field(default=0, ge=0)
    # Tutor's optional band label captured at submit time. The same student
    # re-taking later gets a fresh row so the tutor can compare.
    level_label: str | None = Field(default=None, max_length=80)
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HomeworkQuestionType(str, Enum):
    """Question types the grading engine knows about.

    - mc_single: one correct option index from a list
    - mc_multi: a set of correct option indices (all-or-nothing scoring)
    - fill_blank: free-text answer compared against `accepted_answers`;
      Greek accent normalization + case insensitivity toggleable per Q
    - short_answer: free-text answer that always needs manual review
    """

    MC_SINGLE = "mc_single"
    MC_MULTI = "mc_multi"
    FILL_BLANK = "fill_blank"
    SHORT_ANSWER = "short_answer"


class HomeworkTemplate(SQLModel, table=True):
    """A reusable homework that a tutor can assign to any student or have
    auto-assigned when a booking is marked complete.

    `questions_json` is the source of truth — a JSON array of question
    dicts whose shape varies by `type`. We store it as TEXT in SQLite
    because the structure is heterogeneous; validation happens at the
    Pydantic schema layer in the router.

    `auto_assign_on_lesson_complete` flips this template into "send
    automatically after every completed lesson with this tutor" mode.
    The tutor can keep manually-assigned templates separate.

    Premium homework: tutors mark a template `is_premium=True` and set
    `price_cents`. Students who haven't purchased it can browse the
    title/description on the tutor's site but the questions stay
    locked behind a Stripe Connect checkout until paid (`HomeworkPurchase`
    grants permanent access).
    """

    __tablename__ = "homework_template"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    title: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    questions_json: str = Field(default="[]", max_length=200_000)
    auto_assign_on_lesson_complete: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True, index=True)
    # Premium fields. is_premium=False keeps the template in the
    # tutor's manual-assign list as before; True opens a paid path:
    # students browse the storefront, pay via Stripe Connect, then it
    # acts like a normal assignment (HomeworkAssignment row created).
    is_premium: bool = Field(default=False, index=True)
    price_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    # Per-grading price the tutor charges for manual review (short_answer
    # questions or any time they override the autograde). 0 = free, no
    # payment gate. Snapshot-copied onto each HomeworkAssignment at clone
    # time so later edits don't retroactively change live work.
    grading_price_cents: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HomeworkPurchase(SQLModel, table=True):
    """A student's permanent unlock of a premium HomeworkTemplate.

    Once a row exists for (template_id, student_user_id), the student
    can spawn assignments from that template forever (and the platform
    keeps a copy for audit). Stripe payment_intent is stamped so we can
    refund or look up the original charge later.
    """

    __tablename__ = "homework_purchase"
    __table_args__ = (
        UniqueConstraint(
            "template_id", "student_user_id", name="uq_homework_purchase_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    template_id: int = Field(foreign_key="homework_template.id", index=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    amount_cents: int = Field(default=0, ge=0)
    platform_fee_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    stripe_checkout_session_id: str | None = Field(default=None, max_length=128, index=True)
    stripe_payment_intent_id: str | None = Field(default=None, max_length=128, index=True)
    paid_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    refunded_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorSubscriptionStatus(str, Enum):
    """Mirrors Stripe's subscription statuses we actually care about.

    Stripe has more (incomplete, incomplete_expired, etc.) — we collapse
    everything that isn't active/trialing/past_due/cancelled into
    `unpaid` so the access check is a clean two-way comparison.
    """

    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"
    UNPAID = "unpaid"


class TutorSubscriptionPlan(SQLModel, table=True):
    """One per tutor — the price + cadence of their content subscription.

    Stripe Price objects aren't created up-front; we pass `price_data`
    inline on each Checkout Session, which means changing the price
    here doesn't affect existing subscribers (Stripe keeps charging
    them at the price they signed up for).
    """

    __tablename__ = "tutor_subscription_plan"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", unique=True, index=True)
    price_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    is_active: bool = Field(default=False, index=True)
    # Grading credits subscribers receive each month. 0 means subscribers
    # still pay per grading at the template's price. >0 means they get
    # this many free gradings per renewal cycle.
    monthly_grading_credits: int = Field(default=0, ge=0, le=10_000)
    # When True, unused credits at renewal time are kept and added to the
    # fresh batch. When False, the balance resets to monthly_grading_credits.
    credits_roll_over: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StudentGradingCreditBalance(SQLModel, table=True):
    """Per (tutor, student) running balance of grading credits.

    Unique on (tutor_id, student_user_id) so the refill webhook can
    insert-or-update without race conditions. Refilled on initial
    subscription checkout and on every customer.subscription.updated
    that indicates a successful renewal (current_period_end advances).
    `last_refilled_at` stores the period_end the refill applied to so a
    duplicate webhook event doesn't double-grant.
    """

    __tablename__ = "student_grading_credit_balance"
    __table_args__ = (
        UniqueConstraint(
            "tutor_id", "student_user_id", name="uq_grading_credit_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    available: int = Field(default=0, ge=0)
    last_refilled_period_end: datetime | None = Field(default=None)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HomeworkGradingPaymentKind(str, Enum):
    CREDIT = "credit"
    STRIPE = "stripe"


class HomeworkGradingPayment(SQLModel, table=True):
    """Audit row for each "grading paid for" event. One per submission;
    composite uniqueness on submission_id prevents double-charging on
    webhook retries."""

    __tablename__ = "homework_grading_payment"
    __table_args__ = (
        UniqueConstraint("submission_id", name="uq_grading_payment_submission"),
    )

    id: int | None = Field(default=None, primary_key=True)
    submission_id: int = Field(
        foreign_key="homework_submission.id", index=True, unique=True
    )
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    kind: HomeworkGradingPaymentKind
    amount_cents: int = Field(default=0, ge=0)
    platform_fee_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    stripe_checkout_session_id: str | None = Field(default=None, max_length=128, index=True)
    stripe_payment_intent_id: str | None = Field(default=None, max_length=128, index=True)
    paid_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StudentTutorSubscription(SQLModel, table=True):
    """A student's recurring subscription to one tutor's content.

    Composite uniqueness on (tutor_id, student_user_id) so the webhook
    can re-grant idempotently on duplicate events. Status + current
    period end together determine access — `is_active_now()` returns
    True when status is ACTIVE/PAST_DUE/TRIALING AND the period hasn't
    elapsed yet. PAST_DUE counts as active so a delayed renewal doesn't
    lock the student out mid-month.
    """

    __tablename__ = "student_tutor_subscription"
    __table_args__ = (
        UniqueConstraint(
            "tutor_id", "student_user_id", name="uq_student_tutor_sub_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    status: TutorSubscriptionStatus = Field(
        default=TutorSubscriptionStatus.UNPAID, index=True
    )
    # Stripe references — the webhook stamps these so we can refund or
    # debug later from either side.
    stripe_subscription_id: str | None = Field(
        default=None, max_length=128, index=True
    )
    stripe_customer_id: str | None = Field(default=None, max_length=128)
    stripe_price_cents_snapshot: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    current_period_end: datetime | None = Field(default=None)
    cancel_at_period_end: bool = Field(default=False)
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    cancelled_at: datetime | None = Field(default=None)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LessonModule(SQLModel, table=True):
    """A self-paced lesson module — a tutor's curriculum unit.

    Combines existing Article rows + HomeworkTemplate rows into an
    ordered "do this, then this" sequence sold as one bundle. Module
    pricing is one-time permanent access (Stripe Connect checkout
    grants a `ModulePurchase` on success). For embedded video / audio
    the tutor links externally inside their articles' markdown — we
    don't host files in v1.

    items_json is a JSON list of `{"kind": "article"|"homework",
    "ref_id": int}` records in display order. Storing as JSON avoids a
    second table for what is essentially a small ordered list.
    """

    __tablename__ = "lesson_module"
    __table_args__ = (
        UniqueConstraint("tutor_id", "slug", name="uq_lesson_module_tutor_slug"),
    )

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    slug: str = Field(max_length=120, index=True)
    title: str = Field(max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=4000)
    featured_image_url: str | None = Field(default=None, max_length=2048)
    items_json: str = Field(default="[]", max_length=20_000)
    price_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    is_published: bool = Field(default=False, index=True)
    published_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ModulePurchase(SQLModel, table=True):
    """A student's permanent unlock of a LessonModule.

    Composite uniqueness on (module_id, student_user_id) so a duplicate
    Stripe webhook can't double-insert. Audit-only — we never delete
    these rows even after refunds; we stamp `refunded_at` instead so
    historical revenue stays auditable.
    """

    __tablename__ = "module_purchase"
    __table_args__ = (
        UniqueConstraint(
            "module_id", "student_user_id", name="uq_module_purchase_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    module_id: int = Field(foreign_key="lesson_module.id", index=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    amount_cents: int = Field(default=0, ge=0)
    platform_fee_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    stripe_checkout_session_id: str | None = Field(default=None, max_length=128, index=True)
    stripe_payment_intent_id: str | None = Field(default=None, max_length=128, index=True)
    paid_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    refunded_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HomeworkAssignmentStatus(str, Enum):
    OPEN = "open"
    SUBMITTED = "submitted"
    GRADED = "graded"


class HomeworkAssignment(SQLModel, table=True):
    """A specific homework given to a specific student.

    Snapshots the template's question set at assign time so future template
    edits don't retroactively change live work. `template_id` is nullable
    for one-off assignments tutors compose for a single student.
    """

    __tablename__ = "homework_assignment"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    template_id: int | None = Field(default=None, foreign_key="homework_template.id")
    title: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    questions_snapshot_json: str = Field(default="[]", max_length=200_000)
    max_score: int = Field(default=0, ge=0)
    # Snapshot of the template's grading_price at assignment-creation time.
    # Lets the tutor change their template later without retroactively
    # changing what already-issued students owe.
    grading_price_cents: int = Field(default=0, ge=0)
    grading_currency: str = Field(default="eur", max_length=3)
    status: HomeworkAssignmentStatus = Field(
        default=HomeworkAssignmentStatus.OPEN, index=True
    )
    due_at: datetime | None = Field(default=None)
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HomeworkSubmission(SQLModel, table=True):
    """One student submission for one assignment.

    One-shot: an assignment can have at most one submission row. Autograded
    fields populate immediately on submit; `needs_manual_review` flips
    True when any short_answer question is present. `manual_score` is the
    tutor's override (when set, it wins over `auto_score`); `feedback`
    is whatever the tutor wants to write back.
    """

    __tablename__ = "homework_submission"

    id: int | None = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="homework_assignment.id", index=True, unique=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    answers_json: str = Field(default="{}", max_length=200_000)
    per_question_results_json: str = Field(default="{}", max_length=200_000)
    auto_score: int = Field(default=0, ge=0)
    manual_score: int | None = Field(default=None, ge=0)
    max_score: int = Field(default=0, ge=0)
    needs_manual_review: bool = Field(default=False, index=True)
    feedback: str | None = Field(default=None, max_length=4000)
    # True when the tutor can proceed to grade — either the assignment had
    # no grading_price, OR the student paid, OR they spent a credit. The
    # tutor's "needs review" queue filters to grading_paid=True so unpaid
    # submissions don't ambient-pressure them to grade for free.
    grading_paid: bool = Field(default=True, index=True)
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    graded_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class NewsletterStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"


class Newsletter(SQLModel, table=True):
    """A per-tutor newsletter broadcast — drafts and history.

    Tutor composes in markdown; render to HTML at send time using the
    shared email_templates._markdown_to_html helper so the styling
    matches our transactional mail. Drafts can be edited freely; SENT
    rows are immutable so the history matches what students received.

    Audience snapshot lives in `recipient_count` (denormalised at send
    time) — the actual student list isn't stored long-term to keep the
    table small and so GDPR deletion of a student doesn't backfill old
    newsletter rows.
    """

    __tablename__ = "newsletter"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    subject: str = Field(max_length=200)
    body_markdown: str = Field(default="", max_length=50_000)
    status: NewsletterStatus = Field(default=NewsletterStatus.DRAFT, index=True)
    sent_at: datetime | None = Field(default=None)
    recipient_count: int = Field(default=0)
    # Tutor sometimes wants to verify the look before broadcasting; stamp
    # the last time we sent the test so the UI can confirm.
    last_test_sent_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class NewsletterUnsubscribe(SQLModel, table=True):
    """One row per (tutor, student) opt-out from newsletter broadcasts.

    Composite uniqueness so an idempotent unsubscribe doesn't error if the
    student clicks the link twice. We key on student_user_id rather than
    email so the same student unsubscribed from one tutor still receives
    from another.
    """

    __tablename__ = "newsletter_unsubscribe"
    __table_args__ = (
        UniqueConstraint(
            "tutor_id", "student_user_id", name="uq_newsletter_unsub_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    unsubscribed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorEmailTemplate(SQLModel, table=True):
    """Per-tutor override of a transactional email's subject + markdown body.

    Identified by `template_key` (matches the keys in
    services.email_templates.DEFAULTS). When no row exists for a (tutor,
    key) pair, the platform default is used. Tutors edit these from the
    dashboard so their student-facing emails sound like them rather than
    like a SaaS platform.

    Body is markdown — rendered to HTML at send time. Subject is plain
    text. Both run through str.format_map with a safe-fallback dict so a
    placeholder typo shows literally rather than crashing the send.
    """

    __tablename__ = "tutor_email_template"
    __table_args__ = (
        UniqueConstraint("tutor_id", "template_key", name="uq_tutor_email_template_key"),
    )

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    template_key: str = Field(max_length=80, index=True)
    subject: str = Field(max_length=200)
    body_markdown: str = Field(default="", max_length=20_000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Testimonial(SQLModel, table=True):
    """A student testimonial shown on the tutor's public site.

    Tutor types these in themselves on the dashboard (no student-side
    submission flow in v1 — keeps it simple, prevents the abuse vectors
    that come with public submission). Display order is explicit so the
    tutor can pin the best ones to the top; ties break on created_at.

    Star rating is 1–5 (whole stars only). The body is plain text, not
    markdown — testimonials don't need formatting and keeping them text-
    only avoids worrying about XSS via paste.
    """

    __tablename__ = "testimonial"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    # Public attribution. We keep the name as displayed (e.g. "Sara M.")
    # rather than linking to a User row — many testimonials come from
    # students who haven't joined Kotobaseed, and pseudonyms are normal.
    student_name: str = Field(max_length=120)
    # Country/city for context — optional. Renders as a subtitle.
    location: str | None = Field(default=None, max_length=120)
    body: str = Field(max_length=2000)
    # 1-5 stars. Kept as int rather than half-stars; matches every site
    # students have seen and avoids fiddly UI.
    rating: int = Field(default=5, ge=1, le=5)
    # Lower numbers render first. Defaults to 100 so newly added rows go
    # to the back — explicit ordering wins over recency.
    display_order: int = Field(default=100, index=True)
    is_published: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ArticleVisibility(str, Enum):
    """Who can read this article.

    - public: anyone visiting /articles. Default — backwards-compatible
      with everything that already exists.
    - subscribers_only: hidden from the public articles index; readable
      by students with an active TutorSubscription to this tutor (or
      anyone who owns a module that contains it).
    - module_only: not on the public articles index at all; accessible
      only as an item inside a paid/subscribed module. Lets the tutor
      write self-paced lesson content that isn't a standalone blog post.
    """

    PUBLIC = "public"
    SUBSCRIBERS_ONLY = "subscribers_only"
    MODULE_ONLY = "module_only"


class Article(SQLModel, table=True):
    """A per-tutor markdown article — blog posts, free resources, lesson notes.

    The same model serves all three use-cases (the tutor's choice) so we
    don't have to fork CRUD for "lessons" vs "articles" vs "freebies". The
    public list at /articles/ on the tutor's subdomain shows whatever is
    `is_published=True AND visibility=public`; the reader at
    /articles/<slug>/ enforces visibility on top.

    Slugs are unique per tutor so two tutors can both have an article at
    `welcome` without colliding. Globally-unique would force tutors to
    pick increasingly cryptic slugs as the platform grows.
    """

    __tablename__ = "article"
    __table_args__ = (
        UniqueConstraint("tutor_id", "slug", name="uq_article_tutor_slug"),
    )

    visibility: ArticleVisibility = Field(
        default=ArticleVisibility.PUBLIC, index=True
    )

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    slug: str = Field(max_length=120, index=True)
    title: str = Field(max_length=200)
    # Short blurb shown on the article list cards. Optional — falls back to
    # the first ~200 chars of the body if not set when rendering.
    summary: str | None = Field(default=None, max_length=500)
    # Round-trippable markdown source — what the editor opens, what the
    # public reader falls back to if lexical_json is absent. Custom blocks
    # (`:::vocab`, `:::translate`) survive markdown round-trips because
    # the editor's serializer preserves them as shortcodes.
    body_markdown: str = Field(default="")
    # Lexical editor state as JSON. Used by the reader for richer rendering
    # (clickable vocab tooltips, embedded media) without re-parsing
    # markdown. May be empty for articles created before Lexical landed
    # or saved by an older client — the reader falls back to body_markdown.
    lexical_json: str | None = Field(default=None)
    is_published: bool = Field(default=False, index=True)
    published_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StripeWebhookEvent(SQLModel, table=True):
    """One row per processed Stripe webhook event.

    Stripe retries webhooks on non-2xx responses (or on network blips); the
    same event can fire multiple times. Webhook handlers read this table to
    decide whether they've already done the work — if so, return 200 without
    re-mutating state.
    """

    __tablename__ = "stripe_webhook_event"

    event_id: str = Field(primary_key=True, max_length=128)
    event_type: str = Field(max_length=120)
    received_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ===========================================================================
# Multi-tenant tutor platform tables
#
# These tables introduce Kotobaseed's per-tutor SaaS structure on top of the
# existing CompInput identity + marketplace schema. The original User table
# stays as the platform-level identity; a Tutor row hangs off it for the
# tenant-specific data (subdomain slug, plan, classroom quota, branding,
# Stripe Connect settings, custom domain).
#
# Existing tables that the marketplace already uses (Project, Pledge,
# TeacherFollower, etc.) keep User.id as their teacher reference for
# backwards compatibility. New tutoring-side features (bookings, lesson
# packs, homework, articles) will reference Tutor.id directly.
# ===========================================================================


class Tutor(SQLModel, table=True):
    """The per-tenant tutor profile that owns an instructor site.

    Created when a user signs up to teach via the kotobaseed.net onboarding
    flow. One Tutor per User. The User row stays the source of truth for
    identity (email, password, role); the Tutor row holds everything
    platform-specific.
    """

    __tablename__ = "tutor"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True, index=True)

    # Identity (bio, avatar, languages) lives on the User row this points to.
    user: "User" = Relationship()

    # ----- Public-facing profile -----
    tutor_slug: str = Field(
        unique=True,
        index=True,
        max_length=80,
        description="URL slug, used as `{slug}.kotobaseed.net` subdomain",
    )
    display_name: str = Field(
        max_length=120,
        description="Stage name shown on the tutor's site. May differ from User.full_name (legal name).",
    )
    # bio, photo, and languages now live on User — single identity source so
    # editing on the marketplace profile updates the tutor site and vice versa.
    # Reach them via `tutor.user.bio`, `tutor.user.avatar_url`, `tutor.user.languages`.
    cefr_level_lowest: str | None = Field(default=None, max_length=8)
    cefr_level_highest: str | None = Field(default=None, max_length=8)

    # ----- Email + contact -----
    public_reply_email: str | None = Field(
        default=None,
        description="Address used in Reply-To on transactional emails",
        max_length=255,
    )

    # ----- Plan + status -----
    plan: TutorPlan = Field(default=TutorPlan.STARTER, index=True)
    plan_started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    account_status: TutorAccountStatus = Field(
        default=TutorAccountStatus.ACTIVE, index=True
    )
    paused_reason: str | None = Field(default=None, max_length=255)

    # ----- Activity-driven anti-abuse -----
    last_completed_lesson_at: datetime | None = Field(
        default=None,
        description="Drives the 30-day Starter dormant auto-pause check",
    )

    # ----- Classroom minutes -----
    classroom_minutes_quota: int = Field(
        default=300, ge=0, description="Monthly quota; Starter=300, Pro=1000"
    )
    classroom_minutes_used_this_cycle: int = Field(default=0, ge=0)
    cycle_started_at: datetime | None = Field(default=None)
    overage_policy: OveragePolicy = Field(default=OveragePolicy.BLOCK)

    # ----- Stripe -----
    stripe_connect_account_id: str | None = Field(
        default=None,
        index=True,
        max_length=128,
        description="Tutor's Stripe Connect Express account",
    )
    stripe_platform_customer_id: str | None = Field(
        default=None,
        max_length=128,
        description="Card on file with the platform (for Pro subscription + overages)",
    )

    # ----- Domain -----
    # Pro/Business tutors can point their own domain at the platform. The
    # field stays null on Free/Plus. Verification: tutor adds an A record
    # at their domain pointing at the platform IP; the verify endpoint does
    # a DNS lookup and stamps custom_domain_verified_at when it matches.
    # The tenancy middleware only resolves verified domains so an attacker
    # can't claim a domain they don't own.
    custom_domain: str | None = Field(
        default=None, unique=True, index=True, max_length=255
    )
    custom_domain_verified_at: datetime | None = Field(default=None)

    # ----- Free trial -----
    # Tutor opts in to offering a free trial lesson. When enabled, a managed
    # LessonPack with is_trial=True is auto-maintained — students see a
    # "Try a free X-minute lesson" CTA on the tutor's site that books
    # directly without Stripe checkout.
    offers_free_trial: bool = Field(default=False)
    free_trial_minutes: int = Field(default=20, ge=15, le=120)
    # Per-student lifetime cap on trial bookings with this tutor.
    free_trial_limit_per_student: int = Field(default=1, ge=1, le=10)

    # ----- Marketplace listing -----
    # Show this tutor on the apex /library directory. Default True so new
    # tutors get discovery automatically — they can opt out from the
    # dashboard if they only want direct-link traffic to their subdomain.
    list_in_marketplace: bool = Field(default=True, index=True)

    # ----- Cancellation policy -----
    # Hours before a lesson at which the student can still cancel + refund.
    # Platform floor is 48 — enforced via the `ge=48` validator — so a
    # tutor can be stricter (96, 168 = one week) but never weaker. Sophia's
    # call: prevents last-minute cancellations that leave tutors with a
    # held slot and no income, while still letting students out with
    # plenty of notice. Bookings made INSIDE this window get a "no refund
    # if you no-show" warning at checkout and the cancel button stays
    # disabled afterwards.
    cancellation_cutoff_hours: int = Field(default=48, ge=48, le=720)

    # ----- Theme -----
    # Pro+ tutors can pick from a curated set of colour bundles. The string
    # matches a CSS class on the frontend (theme-sage, theme-midnight, etc.).
    # Free + Plus tutors stay on the default — `sage` is what the platform
    # ships with, so nothing changes visually for them.
    theme: str = Field(default="sage", max_length=32)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# TutorMarketplaceProfile was scaffolded for an opt-in marketplace listing
# feature but never wired into a router. The functionality it modelled is
# now served by Tutor.list_in_marketplace (boolean flag) + User's existing
# intro_video_url + sample_video_url fields. The model + table are dropped
# in migration 20260607_drop_tutor_marketplace_profile to avoid drift.


class StudentEnrollment(SQLModel, table=True):
    """Per-tenant enrollment record — student X is on tutor Y's site.

    A student signing up through `vasso.kotobaseed.net` gets an
    enrollment for Vasso's tenant. A different tutor's tenant doesn't
    see this student. The marketplace bypasses enrollments — there a
    student browses across all tutors freely.
    """

    __tablename__ = "student_enrollment"

    id: int | None = Field(default=None, primary_key=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    status: StudentEnrollmentStatus = Field(
        default=StudentEnrollmentStatus.ACTIVE, index=True
    )

    first_enrolled_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_active_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorVerification(SQLModel, table=True):
    """Verified credentials shown as a badge on a tutor's site + marketplace.

    Distinct from the legacy `TeacherVerification` table (which is tied to
    User.id and only knows about language proficiency). New code should
    use this table; the legacy table sticks around until the marketplace
    router is refactored to switch over.
    """

    __tablename__ = "tutor_verification"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    kind: TutorVerificationKind = Field(index=True)
    description: str = Field(
        max_length=300,
        description="Human-readable summary, e.g. 'DELE C2', 'CELTA from Cambridge'",
    )
    language: str | None = Field(
        default=None,
        max_length=40,
        description="Only set when kind=LANGUAGE_PROFICIENCY",
    )
    evidence_file_path: str | None = Field(default=None, max_length=512)

    status: VerificationStatus = Field(default=VerificationStatus.PENDING, index=True)
    reviewed_by_user_id: int | None = Field(default=None, foreign_key="user.id")
    reviewed_at: datetime | None = None
    review_notes: str | None = Field(default=None, max_length=1000)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Tutor site customization — theming + landing-page sections
# ---------------------------------------------------------------------------


class Theme(SQLModel, table=True):
    """A curated theme — coordinated palette + typography pair.

    Tutors pick from this list when configuring their site. The CSS class
    prefix (`css_class_prefix`) tells the frontend which kit's stylesheet
    to apply.
    """

    __tablename__ = "theme"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True, max_length=64)
    name: str = Field(max_length=120)
    description: str | None = Field(default=None, max_length=500)
    css_class_prefix: str = Field(
        max_length=64,
        description="e.g. 'kit-marketing-warm' — drives which CSS file loads",
    )
    primary_palette_json: str | None = Field(
        default=None,
        description="JSON-encoded list of {key, hex} swatches the tutor can pick from",
    )
    typography_pair_json: str | None = Field(
        default=None,
        description="JSON-encoded {display, body} font stack identifiers",
    )

    is_active: bool = Field(default=True, index=True)
    display_order: int = Field(default=0)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorBranding(SQLModel, table=True):
    """Per-tutor theme choice + color/logo overrides."""

    __tablename__ = "tutor_branding"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", unique=True, index=True)
    theme_id: int = Field(foreign_key="theme.id", index=True)

    primary_color: str | None = Field(
        default=None,
        max_length=10,
        description="Hex from theme's palette",
    )
    accent_color: str | None = Field(default=None, max_length=10)

    logo_url: str | None = Field(default=None, max_length=512)
    favicon_url: str | None = Field(default=None, max_length=512)

    cefr_glyphs_json: str | None = Field(
        default=None,
        description=(
            "JSON-encoded mapping of CEFR level → display glyph, "
            "e.g. {'A1': 'α', 'A2': 'β'} for Greek or "
            "{'A1': 'あ', 'A2': 'か'} for Japanese"
        ),
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorPageSection(SQLModel, table=True):
    """One block in a tutor's landing page.

    The public homepage reads visible sections ordered by `position` and
    renders each with its `section_type` component, passing the
    `content_json` payload as props.
    """

    __tablename__ = "tutor_page_section"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    section_type: TutorPageSectionType
    position: int = Field(default=0, index=True)
    is_visible: bool = Field(default=True)

    content_json: str | None = Field(
        default=None,
        description="JSON-encoded section-specific content payload",
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SupportTicketStatus(str, Enum):
    """Where a ticket sits in the staff workflow.

    - OPEN: new, no staff has touched it yet
    - IN_PROGRESS: staff is handling it
    - ESCALATED: support couldn't resolve, bumped to manager
    - RESOLVED: staff says it's fixed; user can still reply to reopen
    - CLOSED: final — no further replies. Only manager+ can close.
    """

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    ESCALATED = "escalated"
    RESOLVED = "resolved"
    CLOSED = "closed"


class SupportTicketPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class SupportTicketCategory(str, Enum):
    """Coarse-grained bucket so staff can filter the queue. We keep this
    list short on purpose — finer categorisation lives in tags / search.
    """

    TECHNICAL = "technical"
    BILLING = "billing"
    ACCOUNT = "account"
    CONTENT = "content"
    ABUSE = "abuse"
    OTHER = "other"


class SupportTicket(SQLModel, table=True):
    """A user's support request.

    The initial message body lives on the ticket row itself; subsequent
    back-and-forth is recorded as `SupportTicketMessage` children so the
    thread is preserved. We snapshot the submitter's email so closed
    tickets stay readable even if the user later deletes their account.
    """

    __tablename__ = "support_ticket"

    id: int | None = Field(default=None, primary_key=True)
    subject: str = Field(max_length=200)
    body: str  # initial message text

    submitted_by_user_id: int | None = Field(
        default=None, foreign_key="user.id", index=True
    )
    submitted_by_email: str = Field(max_length=255)
    submitted_by_name: str | None = Field(default=None, max_length=120)

    status: SupportTicketStatus = Field(default=SupportTicketStatus.OPEN, index=True)
    priority: SupportTicketPriority = Field(
        default=SupportTicketPriority.NORMAL, index=True
    )
    category: SupportTicketCategory = Field(
        default=SupportTicketCategory.OTHER, index=True
    )

    # Bumped from 0 → 1 on first escalation (support → manager),
    # 1 → 2 on second (manager → admin). Used for routing + visibility.
    escalation_level: int = Field(default=0)
    assigned_to_user_id: int | None = Field(default=None, foreign_key="user.id")

    # Optional context — what the ticket is about. None of these are
    # required, but having them lets staff jump straight to the booking
    # or tutor page without searching.
    related_user_id: int | None = Field(default=None, foreign_key="user.id")
    related_booking_id: int | None = Field(default=None, foreign_key="booking.id")
    related_tutor_id: int | None = Field(default=None, foreign_key="tutor.id")

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_activity_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )
    resolved_at: datetime | None = None
    closed_at: datetime | None = None


class SupportTicketMessage(SQLModel, table=True):
    """One reply or internal note on a ticket."""

    __tablename__ = "support_ticket_message"

    id: int | None = Field(default=None, primary_key=True)
    ticket_id: int = Field(foreign_key="support_ticket.id", index=True)
    author_user_id: int | None = Field(default=None, foreign_key="user.id")
    # Snapshot the author's display so closed tickets keep their author
    # label even if the user deletes their account later.
    author_label: str = Field(max_length=200)
    body: str
    # Internal notes are visible only to staff — used for coordination
    # between support / manager / admin.
    is_internal: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PlatformSetting(SQLModel, table=True):
    """Key/value store for platform-wide configuration that needs to change
    without a redeploy — social network URLs, support contact email, brand
    bits, feature flags, etc.

    Values are JSON-encoded so anything serialisable fits without a schema
    migration. Read access is per-key public (the public endpoints curate
    what's exposed); write access is admin-only.
    """

    __tablename__ = "platform_setting"

    key: str = Field(primary_key=True, max_length=128)
    value_json: str = Field(description="JSON-encoded value")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_by_user_id: int | None = Field(default=None, foreign_key="user.id")


# ---------------------------------------------------------------------------
# Classroom usage tracking + platform billing
# ---------------------------------------------------------------------------


class TutorMinuteUsageLog(SQLModel, table=True):
    """Running ledger of classroom minutes consumed per tutor per day.

    Aggregated monthly to compute overage charges + reset the quota.
    """

    __tablename__ = "tutor_minute_usage_log"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    usage_date: datetime = Field(index=True)
    minutes_used: int = Field(default=0, ge=0)
    source: str | None = Field(
        default=None,
        max_length=64,
        description="e.g. 'daily_room_ended' (webhook), 'manual_adjustment'",
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PlatformSubscription(SQLModel, table=True):
    """Tutor's Pro-plan subscription on the platform's own Stripe account.

    Separate from the Connect account (which receives tutoring + marketplace
    income). This is what tutors pay Sophia for hosting / platform access.
    """

    __tablename__ = "platform_subscription"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", unique=True, index=True)
    stripe_subscription_id: str = Field(unique=True, index=True, max_length=128)
    plan: TutorPlan = Field(default=TutorPlan.PRO)
    status: str = Field(
        default="incomplete",
        index=True,
        description="active / trialing / past_due / canceled / etc. (mirrors Stripe)",
    )

    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = Field(default=False)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
