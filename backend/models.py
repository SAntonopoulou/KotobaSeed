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
    """Single subscription tier on User. Gates platform features for everyone.

    Tutors who go PRO or BUSINESS additionally get tutor-side perks (0% lesson
    fee, higher classroom minute quota, custom domain) — those derive from the
    user's tier, not from Tutor.plan, so a tutor never needs to upgrade twice.
    """

    FREE = "free"
    PLUS = "plus"  # student-side perks: priority credits, premium content
    PRO = "pro"  # teacher + tutor perks (verifications, analytics, 0% lesson fee, etc.)
    BUSINESS = "business"  # schools: 5 seats, no Kotobaseed branding, priority support


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
        return self.role == UserRole.TEACHER and self.subscription_tier in (
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
    custom_domain: str | None = Field(
        default=None, unique=True, index=True, max_length=255
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorMarketplaceProfile(SQLModel, table=True):
    """Opt-in marketplace settings for a tutor.

    A tutor isn't visible in the marketplace by default. Toggling
    `marketplace_enabled` surfaces them in browse + search, lets them
    publish projects, and lets students follow them.
    """

    __tablename__ = "tutor_marketplace_profile"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", unique=True, index=True)
    marketplace_enabled: bool = Field(default=False, index=True)

    intro_video_url: str | None = None
    sample_videos_json: str | None = Field(
        default=None,
        description="JSON-encoded list of {url, title, language, level}",
    )

    follower_count: int = Field(default=0, ge=0)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


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
