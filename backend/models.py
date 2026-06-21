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
    TUTOR = "tutor"
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


class CohortStatus(str, Enum):
    """A cohort moves through these in order. Once CONFIRMED, seat
    enrolment closes — students who want in have to find another
    cohort. Once CANCELLED, the seats are refunded by the cron sweep."""

    DRAFT = "draft"          # tutor still editing, not visible to students
    OPEN = "open"            # visible on group page, accepting seat purchases
    CONFIRMED = "confirmed"  # min/max seats hit; lessons go ahead
    CANCELLED = "cancelled"  # min not met by deadline OR tutor pulled it


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
    NEWSLETTER_SIGNUP = "newsletter_signup"
    # Tier-2 "schools" blocks. Available to TutorTeam owners (Business
    # subscribers) on the page builder. Solo tutors can technically add
    # them too — they'll render as a single-card team / empty programs
    # list — but the editor surfaces them only to Business accounts.
    TEAM_ROSTER = "team_roster"
    PROGRAMS_SHOWCASE = "programs_showcase"
    BOOKING_CTA = "booking_cta"


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
    """A per-language community surface.

    Originally a profile attribute (tutors got rows here for the languages
    they teach). 2026-06-07 sweep promotes it to a proper community
    feature: each group has a public landing at `/groups/{slug}` with
    pinned tutors, a scoped article feed, members, and (Phase 2+)
    cohorts + threads + badges. See project_language_groups_design memory.
    """

    id: int | None = Field(default=None, primary_key=True)
    language_name: str = Field(unique=True, index=True)
    # URL slug — lowercased ASCII, used for /groups/{slug} routing. Derived
    # from language_name on creation but editable so Sophia can pretty up
    # ambiguous names.
    slug: str | None = Field(default=None, max_length=80, index=True)
    # Short copy shown on the group page hero.
    description: str | None = Field(default=None, max_length=2000)
    # Hex hint used to colour the group card / hero accent. Optional.
    cover_color: str | None = Field(default=None, max_length=16)
    # Soft-disable so we don't lose history when a group goes quiet.
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    members: list["User"] = Relationship(
        back_populates="language_groups", link_model=UserLanguageGroup
    )


class LanguageGroupMembership(SQLModel, table=True):
    """Explicit student join on a LanguageGroup.

    Distinct from `UserLanguageGroup` (which marks tutors who *teach* the
    language). This row is created when a signed-in user clicks "Join"
    on a group page. Memberships are free and reversible.
    """

    __tablename__ = "language_group_membership"
    __table_args__ = (
        UniqueConstraint(
            "group_id", "user_id", name="uq_language_group_membership_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="languagegroup.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    joined_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Editorial roles. Default "member"; Sophia (admin) sets "pinned" on
    # tutors she wants surfaced first on the group page.
    role: str = Field(default="member", max_length=16)


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

    # Two-factor auth (TOTP). Secret is base32, stored plain because the
    # TOTP algorithm needs it readable to verify; treat the DB as
    # privileged. `totp_recovery_codes_json` holds Argon2 hashes of N
    # single-use backup codes for when the authenticator is lost.
    totp_enabled: bool = Field(default=False)
    totp_secret: str | None = Field(default=None, max_length=64)
    totp_recovery_codes_json: str | None = Field(default=None)

    # All JWTs issued before this stamp are invalidated. Bumping logs the
    # user out of every device — used by 'log out other devices' and on
    # password change.
    token_invalidation_at: datetime | None = Field(default=None)

    # Demo-is-the-signup onboarding (Phase 1 — 2026-06-08).
    # When `is_demo_account` is True the user landed here from a /try
    # entry page, has no password yet, and sees the DemoBar across the
    # app. `demo_role` mirrors the entry route (tutor/creator/student)
    # so the tour engine can pick the right script. `demo_seed_ids_json`
    # records every row we seeded on entry so `wipe_workspace()` can
    # clean them out atomically on conversion.
    is_demo_account: bool = Field(default=False, index=True)
    demo_role: str | None = Field(default=None, max_length=16)
    demo_workspace_seeded_at: datetime | None = Field(default=None)
    demo_seed_ids_json: str = Field(default="{}")

    # Demo classroom trial — admins (Sophia) hand-issue these to people
    # who want to feel the live classroom before signing up. The trial
    # has a hard minute cap (5–10 typically) that the classroom token
    # mint path enforces; once minutes hit zero the user can still log
    # in but the Join Classroom button is disabled.
    #
    # demo_trial_expires_at auto-cleans them up after 7 days (TOTAL) or
    # N months (MONTHLY), so even without manual deletion the account
    # self-terminates. Sophia can still delete sooner from the admin panel.
    #
    # Period semantics:
    #   - "total":   minutes_allocated is a one-shot budget. expires after 7 days.
    #   - "monthly": minutes_allocated refills every 30 days from period_anchor
    #                until the overall expires_at is reached.
    is_demo_trial: bool = Field(default=False, index=True)
    demo_trial_minutes_remaining: int | None = Field(default=None)
    demo_trial_minutes_allocated: int | None = Field(default=None)
    demo_trial_period: str | None = Field(default=None, max_length=16)
    demo_trial_period_anchor: datetime | None = Field(default=None)
    demo_trial_expires_at: datetime | None = Field(default=None, index=True)
    demo_trial_label: str | None = Field(default=None, max_length=120)
    demo_trial_created_by_admin_id: int | None = Field(
        default=None, foreign_key="user.id"
    )

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
        # Defensive guard: a stale subscription_tier with an expired
        # subscription_expires_at means a webhook went missing and we'd
        # otherwise serve paid features to a lapsed user. Treat them as
        # FREE in the hot path; the next webhook will sync the column.
        if (
            self.subscription_expires_at is not None
            and self.subscription_expires_at < datetime.now(UTC)
        ):
            return False
        return self.role == UserRole.TUTOR and self.subscription_tier in (
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
    # Nullable so two users can open a direct conversation without going
    # through a marketplace Request (e.g. a student messaging the tutor
    # they have an upcoming lesson with).
    request_id: int | None = Field(default=None, foreign_key="request.id", index=True)
    # When a student opens a direct conversation by booking with a
    # tutor or messaging them, the student can send the initial message
    # but must wait for the tutor's first reply before sending more.
    # `tutor_first_responded_at` is stamped on the tutor's first message
    # in the conversation; while it's null and `student_initiated == True`,
    # the student is rate-limited to a single message.
    student_initiated: bool = Field(default=False)
    tutor_first_responded_at: datetime | None = Field(default=None)
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

    # Undo-send (60-second window). When the sender retracts a message
    # we stamp deleted_at and stop returning the content; the row stays
    # so reply chains + audit trails don't break.
    deleted_at: datetime | None = Field(default=None)

    # Image attachment (single-image first pass). Public URL minted by
    # services.storage. content stays as a caption/free text so the UX
    # is unchanged for text-only sends.
    attachment_url: str | None = Field(default=None, max_length=500)
    attachment_kind: str | None = Field(default=None, max_length=20)

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


class BookingCreditKind(str, Enum):
    """Why we issued this credit. Drives the messaging in the UI."""

    MAINTENANCE = "maintenance"   # Lesson hit a scheduled outage we caused.
    TUTOR_CANCELLED = "tutor_cancelled"  # Tutor cancelled within cutoff window.
    GOODWILL = "goodwill"         # Admin-issued apology / make-good.


class BookingCreditStatus(str, Enum):
    AVAILABLE = "available"
    USED = "used"
    EXPIRED = "expired"


class BookingCredit(SQLModel, table=True):
    """A free-lesson credit honoured against a specific tutor.

    Issued when something we caused interrupted a paid lesson —
    scheduled maintenance overlapping a booking, a tutor cancellation
    inside the cutoff window, etc. The credit lives for 30 days,
    waives the platform fee, and at checkout time the slot picker
    surfaces this tutor's openings before the rest of the marketplace
    so the student can rebook quickly.

    The credit references both the affected user AND the original
    affected booking so the admin trail is clear and we can build the
    "your free lesson is ready" inbox entry directly.
    """

    __tablename__ = "booking_credit"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    affected_booking_id: int | None = Field(
        default=None, foreign_key="booking.id", index=True
    )
    # How many minutes the credit is good for. We honour it on any
    # active lesson pack on the tutor's site that's <= this duration
    # (so a 60-min credit can pay for a 30-min or 60-min, never a
    # 90-min, without surprise).
    duration_minutes: int = Field(ge=15, le=240)
    kind: BookingCreditKind = Field(default=BookingCreditKind.MAINTENANCE)
    status: BookingCreditStatus = Field(default=BookingCreditStatus.AVAILABLE, index=True)
    # Reason note shown to the student in their dashboard ("we apologise
    # for the maintenance window on 2026-06-15 — here's a free lesson").
    note: str | None = Field(default=None, max_length=500)
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC) + timedelta(days=30),
        index=True,
    )
    used_on_booking_id: int | None = Field(
        default=None, foreign_key="booking.id"
    )
    used_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class MaintenanceStatus(str, Enum):
    SCHEDULED = "scheduled"   # Future window, banner showing.
    ACTIVE = "active"         # Currently in progress, page taken over.
    COMPLETED = "completed"   # Window passed, site back up.
    CANCELLED = "cancelled"   # Admin cancelled before it ran.


class MaintenanceWindow(SQLModel, table=True):
    """An admin-scheduled maintenance window.

    The system surfaces this in three places:
    1. SPA banner from 24h ahead until T-10min.
    2. Hard modal from T-10min until window starts.
    3. Caddy maintenance page during the window (backend down OK).

    `affected_booking_count` is denormalised so the admin schedule
    page shows the impact at a glance without a per-render join.
    """

    __tablename__ = "maintenance_window"

    id: int | None = Field(default=None, primary_key=True)
    scheduled_start_at: datetime = Field(index=True)
    duration_minutes: int = Field(ge=5, le=480)
    # Public message — appears in the banner, the modal, and the
    # maintenance page. Admin-typed Markdown is rejected; plain text
    # only so we don't sweep XSS into a non-React surface.
    message: str = Field(max_length=1000)
    status: MaintenanceStatus = Field(default=MaintenanceStatus.SCHEDULED, index=True)
    created_by_user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    cancelled_at: datetime | None = Field(default=None)
    cancelled_by_user_id: int | None = Field(default=None, foreign_key="user.id")
    affected_booking_count: int = Field(default=0)


class Achievement(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    name: str
    description: str
    icon_url: str | None = None

    users: list["User"] = Relationship(back_populates="achievements", link_model=UserAchievement)


class ConversationReportReason(str, Enum):
    SPAM = "spam"
    HARASSMENT = "harassment"
    ABUSE = "abuse"
    INAPPROPRIATE = "inappropriate"
    OTHER = "other"


class ConversationReportStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ConversationReport(SQLModel, table=True):
    """Moderation queue: a user reporting a conversation or specific
    message. Admins pick from /admin/reports."""

    __tablename__ = "conversation_report"

    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    message_id: int | None = Field(default=None, foreign_key="message.id")
    reporter_user_id: int = Field(foreign_key="user.id", index=True)
    reported_user_id: int = Field(foreign_key="user.id", index=True)
    reason: ConversationReportReason = Field(default=ConversationReportReason.OTHER)
    note: str | None = Field(default=None, max_length=1000)
    status: ConversationReportStatus = Field(default=ConversationReportStatus.OPEN)
    resolved_by_user_id: int | None = Field(default=None, foreign_key="user.id")
    resolved_at: datetime | None = Field(default=None)
    resolution_note: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class UserBlock(SQLModel, table=True):
    """One side blocking the other. Symmetric in effect — the chat
    send-path refuses if EITHER direction is blocked, so harassment
    can't be one-sided."""

    __tablename__ = "user_block"

    id: int | None = Field(default=None, primary_key=True)
    blocker_user_id: int = Field(foreign_key="user.id", index=True)
    blocked_user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


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


class ReportStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    ACTIONED = "actioned"
    DISMISSED = "dismissed"


class Report(SQLModel, table=True):
    """A DSA Article 16 notice — anyone (user or non-user) can report
    content believed to be illegal. We persist the full notice so we can:
      - reply to the reporter (Article 16(5))
      - issue a statement of reasons to the affected user (Article 17)
      - handle appeals (Article 20)
      - aggregate annual transparency stats (Article 24)

    Decisions are stamped in-place; the audit trail of who-decided-what
    sits on this row + a parallel AuditLog entry.
    """

    __tablename__ = "report"

    id: int | None = Field(default=None, primary_key=True)
    # Short human-readable handle ("DSA-20260608123456-be65") returned to
    # the reporter so support can correlate without leaking the row id.
    reference: str = Field(max_length=40, unique=True, index=True)
    reporter_email: str | None = Field(default=None, max_length=320, index=True)
    content_url: str = Field(max_length=2048)
    # Free-text legal hook ("Copyright; DSM Article 17", "CSAM", "GDPR
    # Art 6"). Nullable because non-lawyer reporters often don't know.
    legal_basis: str | None = Field(default=None, max_length=512)
    description: str = Field(max_length=8000)
    # Reporter claims to be a designated trusted flagger under DSA
    # Article 22. Until we verify against the DSC list this is just a
    # self-declared hint that bumps moderation priority.
    is_trusted_flagger: bool = Field(default=False)
    acting_on_behalf_of: str | None = Field(default=None, max_length=300)
    ip: str | None = Field(default=None, max_length=64)
    user_agent: str | None = Field(default=None, max_length=400)
    status: ReportStatus = Field(default=ReportStatus.OPEN, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )
    # Decision stamps. Populated when an admin moves the report off OPEN.
    decided_at: datetime | None = Field(default=None, index=True)
    decided_by_user_id: int | None = Field(default=None, foreign_key="user.id")
    # Short reason the admin gave; copied into the statement-of-reasons
    # email to the affected user (DSA Article 17).
    decision_reason: str | None = Field(default=None, max_length=2000)


class PlatformAnnouncementAudience(str, Enum):
    ALL = "all"
    TUTORS_ONLY = "tutors_only"
    STUDENTS_ONLY = "students_only"


class PlatformAnnouncementSeverity(str, Enum):
    INFO = "info"
    POLICY_CHANGE = "policy_change"  # triggers P2B 15-day acknowledge gate
    SECURITY = "security"


class PlatformAnnouncement(SQLModel, table=True):
    """A platform-wide banner. Drives the EU P2B Regulation Article 8
    15-day-notice mechanism for tutor-facing T&C changes and the DSA
    Article 14 disclosure obligations for content-moderation policy
    changes. Admin-authored; publish_at gates visibility so we can stage
    a notice in advance.
    """

    __tablename__ = "platform_announcement"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    body_md: str = Field(max_length=10_000)
    audience: PlatformAnnouncementAudience = Field(
        default=PlatformAnnouncementAudience.ALL, index=True
    )
    severity: PlatformAnnouncementSeverity = Field(
        default=PlatformAnnouncementSeverity.INFO
    )
    # publish_at: when the banner first appears.
    # effective_at: when the policy change takes effect (informational —
    #     surfaced in the banner so users know the deadline).
    publish_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )
    effective_at: datetime | None = Field(default=None)
    # Optional internal link the banner CTA points at — usually the
    # changelog or the policy doc that changed.
    cta_label: str | None = Field(default=None, max_length=80)
    cta_url: str | None = Field(default=None, max_length=512)
    # Severity=info banners can be dismissed; policy_change banners must
    # be acknowledged (and the acknowledgement is stored — see
    # AnnouncementDismissal) so we have proof the affected user was
    # notified before the effective_at deadline.
    dismissible: bool = Field(default=True)
    is_retracted: bool = Field(default=False, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )
    created_by_user_id: int | None = Field(default=None, foreign_key="user.id")


class AnnouncementDismissal(SQLModel, table=True):
    """Per-user record of dismissals/acknowledgements. For
    severity=policy_change announcements the row is the legal proof the
    user was notified at least 15 days before effective_at."""

    __tablename__ = "announcement_dismissal"
    __table_args__ = (
        UniqueConstraint(
            "announcement_id", "user_id", name="uq_announcement_dismissal_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    announcement_id: int = Field(foreign_key="platform_announcement.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    dismissed_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )
    # IP at the time of acknowledgement — needed if a tutor later
    # claims they never saw a P2B notice.
    ip: str | None = Field(default=None, max_length=64)


class GroupSession(SQLModel, table=True):
    """One scheduled instance of a group-lesson LessonPack.

    The tutor creates these at chosen times; multiple students each book a
    seat (each gets their own Booking row linked via Booking.group_session_id).
    A single Daily.co room is shared by every seat.

    Lifecycle is the same minimum-evaluation flow that drives individual
    Booking.PENDING_GROUP_MIN → CONFIRMED / REFUNDED transitions. We track
    `min_evaluated_at` so the cron sweep is idempotent.
    """

    __tablename__ = "group_session"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    lesson_pack_id: int = Field(foreign_key="lesson_pack.id", index=True)
    scheduled_at: datetime = Field(index=True)
    duration_minutes: int = Field(ge=15, le=240)
    threshold_eval_at: datetime = Field(
        index=True,
        description="scheduled_at minus group_min_threshold_hours",
    )
    min_evaluated_at: datetime | None = Field(default=None)
    is_cancelled: bool = Field(default=False, index=True)
    classroom_room_url: str | None = Field(default=None, max_length=512)
    classroom_room_name: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=2000)
    # When this group session has been delivered (the lesson actually
    # happened). Lets the minute-quota track group lessons the same way
    # 1:1 lessons do: reserved until delivered_at, then actualised into
    # the used bucket. Null = still in the future / reserved.
    delivered_at: datetime | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class BookingStatus(str, Enum):
    PENDING_PAYMENT = "pending_payment"  # Stripe Checkout created, awaiting webhook
    # Group bookings sit here after payment until the minimum-attendance
    # threshold time passes. At threshold:
    #   - count >= min_students → all flip to CONFIRMED
    #   - count <  min_students → all flip to REFUNDED + Stripe refund issued
    PENDING_GROUP_MIN = "pending_group_min"
    CONFIRMED = "confirmed"  # paid, scheduled, waiting for the lesson
    COMPLETED = "completed"  # tutor marked the lesson done
    CANCELLED = "cancelled"  # before the lesson; pre-refund-window
    REFUNDED = "refunded"  # refunded inside the 14-day window
    # Tutor flagged the student as a no-show. No refund — the slot was
    # held, the prep was done. Counts as terminal for stats purposes.
    NO_SHOW = "no_show"


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
    # The TutorTeam the tutor belonged to at the moment of booking. Stamped
    # here at creation time so we keep a faithful audit trail even if the
    # tutor later leaves the team. Drives the non-compete protection on
    # team-exit (services/team_protection.py).
    tutor_team_id: int | None = Field(
        default=None, foreign_key="tutor_team.id", index=True
    )
    # For group lessons every booking points at the same GroupSession;
    # the cron evaluates seats by counting bookings with this id. Null
    # for 1:1 lessons.
    group_session_id: int | None = Field(
        default=None, foreign_key="group_session.id", index=True
    )
    # Backreference to a recurring plan that generated this booking, if any.
    # Null for ad-hoc bookings.
    recurring_plan_id: int | None = Field(
        default=None, foreign_key="recurring_booking_plan.id", index=True
    )
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


class RecurringBookingPlan(SQLModel, table=True):
    """A standing weekly lesson commitment — a slot reserved for a specific
    student that auto-generates child Booking rows.

    A plan blocks the matching slot from regular availability for any
    other student. Cancel any time; cancellation stops generation but
    leaves already-generated future bookings standalone (the student can
    cancel those individually under the normal rules).

    Billing is Stripe Subscription on Connect. Each successful invoice
    payment triggers the cron that generates the next batch of child
    bookings — guarantees we never bill ahead of seats reserved.
    """

    __tablename__ = "recurring_booking_plan"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    lesson_pack_id: int = Field(foreign_key="lesson_pack.id", index=True)
    # Cadence + slot. day_of_week 0=Monday … 6=Sunday matching Python's
    # datetime.weekday(). start_minute is minutes from midnight UTC; the
    # frontend converts to/from local time using the tutor's timezone.
    day_of_week: int = Field(ge=0, le=6)
    start_minute: int = Field(ge=0, le=1439)
    duration_minutes: int = Field(ge=15, le=240)
    # Snapshot price + currency at signup so later pack edits don't
    # rewrite the price the student is billed.
    price_cents: int = Field(ge=0)
    currency: str = Field(default="eur", max_length=3)
    status: str = Field(default="active", max_length=32, index=True)
    # Generation horizon — we never have more than `lookahead_weeks` of
    # child bookings on the books at once. 4 weeks is enough buffer for
    # the student to cancel an individual lesson without surprise.
    lookahead_weeks: int = Field(default=4, ge=1, le=12)
    # First lesson date — used to anchor the weekly cadence.
    start_date: datetime = Field(index=True)
    cancelled_at: datetime | None = Field(default=None)
    # Stripe Subscription wiring
    stripe_subscription_id: str | None = Field(default=None, max_length=128, index=True)
    stripe_customer_id: str | None = Field(default=None, max_length=128, index=True)
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

    # ----- Group classes ----------------------------------------------
    # When `is_group=True`, this pack represents a group lesson that
    # multiple students share. `max_students` caps capacity. If by the
    # `group_min_threshold_hours` mark before lesson start the booked
    # count is below `min_students`, the auto-cancel cron refunds
    # everyone and cancels the lesson. Otherwise the bookings flip from
    # PENDING_GROUP_MIN to CONFIRMED at threshold time.
    is_group: bool = Field(default=False, index=True)
    max_students: int | None = Field(default=None, ge=2, le=200)
    min_students: int | None = Field(default=None, ge=2, le=200)
    group_min_threshold_hours: int = Field(
        default=24,
        ge=1,
        le=168,
        description="Hours before lesson when minimum-attendance is evaluated",
    )

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
    # EU Consumer Rights Directive 2011/83 Article 16(m) — for digital
    # content delivered immediately, the buyer must give prior express
    # consent waiving the 14-day right of withdrawal. We stamp the moment
    # the consent was given + the IP at checkout-start. NULL on rows
    # created before the waiver checkbox shipped.
    withdrawal_waiver_at: datetime | None = Field(default=None)
    withdrawal_waiver_ip: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CEFRLevel(str, Enum):
    """CEFR level reference. None = unspecified; otherwise A1..C2."""

    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"


class Curriculum(SQLModel, table=True):
    """A teacher-authored curriculum — an ordered sequence of lessons.

    Internal use first: tutors keep curriculums in their library and
    walk students through them lesson by lesson. Teachers in a school
    team can flip `is_school_library=True` to expose the curriculum to
    other team teachers (read + clone, never edit-in-place).

    Curriculums are NOT sellable directly. To monetise a curriculum a
    tutor uses the "publish as module" action that copies the lessons
    into the existing LessonModule + items_json structure; the two then
    evolve independently.
    """

    __tablename__ = "curriculum"

    id: int | None = Field(default=None, primary_key=True)
    # Owner is the User row (creator/tutor). We allow non-tutor authors
    # (e.g. a Business team owner) so the column points at user, not tutor.
    owner_user_id: int = Field(foreign_key="user.id", index=True)
    # When set, the curriculum belongs to a school team and can be
    # surfaced to teammates via the school library flag below.
    tutor_team_id: int | None = Field(
        default=None, foreign_key="tutor_team.id", index=True
    )

    title: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    language: str | None = Field(default=None, max_length=60, index=True)
    level: CEFRLevel | None = Field(default=None)
    cover_image_url: str | None = Field(default=None, max_length=2048)

    # Visibility within the owner's school team. False = private to the
    # owner. True = read + clone available to any teacher in the team.
    is_school_library: bool = Field(default=False, index=True)

    archived_at: datetime | None = Field(default=None, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CurriculumLesson(SQLModel, table=True):
    """One lesson inside a curriculum.

    Rich text + media: the body is a Lexical editor state JSON. Optional
    PDFs + images live on R2 with their URLs in `attachments_json`.
    Embedded videos (YouTube/Vimeo) are URL references in
    `embedded_videos_json` — we don't proxy video bytes.

    Position determines display order; we re-pack positions on
    insert/move to keep them dense (cheap because lesson counts are
    small, typically < 50 per curriculum).
    """

    __tablename__ = "curriculum_lesson"

    id: int | None = Field(default=None, primary_key=True)
    curriculum_id: int = Field(foreign_key="curriculum.id", index=True)
    position: int = Field(default=0, index=True)

    title: str = Field(max_length=200)
    summary: str | None = Field(default=None, max_length=600)
    # Lexical editor state, JSON-stringified. None = blank lesson.
    body_lexical_json: str | None = Field(default=None)
    # Plain-text body used as the source-of-truth for full-text search
    # + as the email/preview fallback when Lexical isn't rendered.
    body_markdown: str | None = Field(default=None)
    estimated_duration_minutes: int = Field(default=60, ge=5, le=600)

    # JSON list of {kind: 'pdf'|'image', name, url, size_bytes}.
    attachments_json: str = Field(default="[]")
    # JSON list of {provider: 'youtube'|'vimeo'|'other', url, title?}.
    embedded_videos_json: str = Field(default="[]")

    is_published: bool = Field(default=True)
    archived_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LessonHomeworkTemplate(SQLModel, table=True):
    """A homework template attached to a CurriculumLesson.

    When the lesson is actually taught to a student (LessonDelivery row
    created), every active LessonHomeworkTemplate on the lesson
    auto-spawns a HomeworkAssignment for that student. This is the
    "homework auto-assigns only when the lesson is taught" model.

    Body is Lexical-style rich text — same authoring tool as
    CurriculumLesson.body_lexical_json.
    """

    __tablename__ = "lesson_homework_template"

    id: int | None = Field(default=None, primary_key=True)
    lesson_id: int = Field(foreign_key="curriculum_lesson.id", index=True)
    position: int = Field(default=0)

    title: str = Field(max_length=200)
    body_lexical_json: str | None = Field(default=None)
    body_markdown: str | None = Field(default=None)
    # Days after the lesson delivery that the assignment is due.
    due_days_after_lesson: int = Field(default=7, ge=0, le=365)

    is_active: bool = Field(default=True)
    archived_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StudentLessonPlan(SQLModel, table=True):
    """The lesson sequence a teacher is using for one student.

    Two shapes:
      - Curriculum-driven (is_custom=False, curriculum_id set): the
        sequence IS the curriculum's lessons in order. `current_position`
        tracks where the student is up to.
      - Custom (is_custom=True, curriculum_id null): the sequence is
        spelled out in StudentLessonPlanItem rows. Teachers can clone
        an existing custom plan to seed a new student's plan.

    One plan per (tutor, student) is the v1 default. We allow multiple
    historical plans per pair (e.g. teacher started Beginner Greek with
    Maria last year, switched her to a custom plan this year — old plan
    stays for the LessonDelivery history).
    """

    __tablename__ = "student_lesson_plan"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    curriculum_id: int | None = Field(
        default=None, foreign_key="curriculum.id", index=True
    )
    is_custom: bool = Field(default=False)
    # Where the student is up to. For curriculum-driven plans this is
    # the CurriculumLesson.position to teach next. For custom plans it's
    # the StudentLessonPlanItem.position.
    current_position: int = Field(default=0)

    notes: str | None = Field(default=None, max_length=4000)
    is_active: bool = Field(default=True, index=True)
    archived_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StudentLessonPlanItem(SQLModel, table=True):
    """One step in a custom student lesson plan.

    Only used when `StudentLessonPlan.is_custom=True`. Each item points
    at a CurriculumLesson the teacher already owns (or has cloned from
    the school library). Teachers can mix lessons from multiple
    curriculums into a single custom plan.
    """

    __tablename__ = "student_lesson_plan_item"

    id: int | None = Field(default=None, primary_key=True)
    plan_id: int = Field(foreign_key="student_lesson_plan.id", index=True)
    lesson_id: int = Field(foreign_key="curriculum_lesson.id", index=True)
    position: int = Field(default=0)
    notes: str | None = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LessonDelivery(SQLModel, table=True):
    """A record that the teacher actually taught a specific lesson to a
    specific student during a specific booking.

    Created when the teacher marks "Lesson taught" in the classroom or
    via the dashboard after a booking. Triggers the homework auto-
    assignment for every active LessonHomeworkTemplate attached to the
    lesson. `homework_assignment_ids_json` records which homeworks were
    actually created so we can audit/undo if needed.
    """

    __tablename__ = "lesson_delivery"

    id: int | None = Field(default=None, primary_key=True)
    plan_id: int = Field(foreign_key="student_lesson_plan.id", index=True)
    lesson_id: int = Field(foreign_key="curriculum_lesson.id", index=True)
    booking_id: int | None = Field(
        default=None, foreign_key="booking.id", index=True
    )
    delivered_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )
    teacher_notes: str | None = Field(default=None, max_length=4000)
    # JSON list of HomeworkAssignment.id values that were auto-spawned
    # at delivery time. Lets us undo cleanly if the teacher reverses a
    # delivery record.
    homework_assignment_ids_json: str = Field(default="[]")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ArticlePurchase(SQLModel, table=True):
    """A Free student's piecemeal purchase of a single premium article.

    Plus subscribers don't generate rows here — their access comes from
    their User.subscription_tier. Audit-only: we never delete these,
    we stamp refunded_at instead.
    """

    __tablename__ = "article_purchase"
    __table_args__ = (
        UniqueConstraint(
            "article_id", "student_user_id", name="uq_article_purchase_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    article_id: int = Field(foreign_key="article.id", index=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    amount_cents: int = Field(default=0, ge=0)
    platform_fee_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    stripe_checkout_session_id: str | None = Field(default=None, max_length=128, index=True)
    stripe_payment_intent_id: str | None = Field(default=None, max_length=128, index=True)
    paid_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    refunded_at: datetime | None = Field(default=None)
    # CRD Article 16(m) digital-content withdrawal waiver — see ModulePurchase.
    withdrawal_waiver_at: datetime | None = Field(default=None)
    withdrawal_waiver_ip: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PremiumArticleRead(SQLModel, table=True):
    """A confirmed read of a premium article by a Plus subscriber.

    Used to compute the monthly creator-pool payout. One row per
    (user, article, month) — a refresh-spam loop can't inflate
    earnings. Frontend posts to /articles/{id}/read only after the
    reader has been on the page for ≥30 seconds AND scrolled past 50%,
    which is what makes "read" actually mean read.

    For the payout formula, see backend/services/creator_pool.py
    (to be added at the first end-of-month run; until then the table
    just collects data).
    """

    __tablename__ = "premium_article_read"
    __table_args__ = (
        UniqueConstraint(
            "article_id", "student_user_id", "year_month",
            name="uq_premium_read_triple",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    article_id: int = Field(foreign_key="article.id", index=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    # YYYY-MM bucket. Stored as a string so partitioning + grouping
    # SQL stays trivial across SQLite + Postgres.
    year_month: str = Field(max_length=7, index=True)
    read_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Dwell time the frontend reported when registering the read.
    # Kept for forensic checks (e.g. if a creator pool dispute opens).
    dwell_seconds: int = Field(default=0, ge=0)
    # Best-effort scroll % at registration time (0..100).
    scroll_percent: int = Field(default=0, ge=0, le=100)


class ArticleComment(SQLModel, table=True):
    """Threaded comment on an article. Surfaces only when the tutor flips
    `Article.comments_enabled = True`. Soft-hidden by the tutor (not
    deleted) so moderation is auditable; deleted by the author hard-
    deletes the row.
    """

    __tablename__ = "article_comment"

    id: int | None = Field(default=None, primary_key=True)
    article_id: int = Field(foreign_key="article.id", index=True)
    author_user_id: int = Field(foreign_key="user.id", index=True)
    # Threading: top-level comments have parent_id = NULL, replies point
    # at their parent. We don't currently nest deeper than one level in
    # the UI but the schema supports it.
    parent_id: int | None = Field(default=None, foreign_key="article_comment.id", index=True)
    body_markdown: str = Field(max_length=4000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Soft moderation by the article's tutor. Hidden comments still
    # surface to the tutor + the comment's own author so confusion is
    # avoided ("why did my comment disappear?" gets "the tutor hid it").
    hidden_at: datetime | None = Field(default=None)
    hidden_by_tutor: bool = Field(default=False)


class ArticleRating(SQLModel, table=True):
    """A 1–5 star rating from a reader. Unique on (article, user); the
    rating endpoint upserts so a reader can revise. The optional `body`
    is a single line — not a review essay — to keep the surface light.
    """

    __tablename__ = "article_rating"
    __table_args__ = (
        UniqueConstraint(
            "article_id", "user_id", name="uq_article_rating_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    article_id: int = Field(foreign_key="article.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    stars: int = Field(ge=1, le=5)
    body: str | None = Field(default=None, max_length=280)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SkillBadge(SQLModel, table=True):
    """A persistent achievement granted to a user. Phase 4.

    Badges are granted by the engagement-tracking hooks when the user
    crosses a threshold (e.g. read 25 premium articles, completed first
    module, left first review). They're forever — no expiry.

    `kind` is a free-form enum-like string; we keep it a string instead
    of a Python enum so future kinds can ship without a DB migration.
    Examples: first_lesson, first_module, first_review, articles_read_10,
    articles_read_50, streak_7, streak_30.

    `group_id` is optional — group-scoped badges (e.g. "JLPT N3 student"
    when earned in the Japanese group) attribute to that group. Global
    badges leave it NULL.
    """

    __tablename__ = "skill_badge"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "kind", "group_id", name="uq_skill_badge_triple"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: str = Field(max_length=64, index=True)
    group_id: int | None = Field(
        default=None, foreign_key="languagegroup.id", index=True
    )
    earned_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Numerator for "X out of N" badges (e.g. articles read at time of grant).
    counter: int | None = Field(default=None)


class GroupActivityPoint(SQLModel, table=True):
    """Event log for the monthly group leaderboard.

    Each row is one earned point event for a user in a language group.
    The leaderboard query sums points by user for the current year_month
    bucket — keeping the rows append-only means we don't need to mutate
    aggregates and replays are auditable.

    `kind` examples: article_read (1pt), rating_left (3pt), comment (2pt),
    module_purchased (5pt), lesson_completed (10pt), thread_posted (4pt),
    thread_reply (2pt).
    """

    __tablename__ = "group_activity_point"

    id: int | None = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="languagegroup.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: str = Field(max_length=64)
    points: int = Field(default=1, ge=0)
    # YYYY-MM bucket so monthly aggregates are a single index lookup.
    year_month: str = Field(max_length=7, index=True)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Optional dedupe key — the engagement hooks set this to e.g.
    # "article:42" so the same article-read doesn't re-grant points if
    # the read tracker fires twice in a month.
    dedupe_key: str | None = Field(default=None, max_length=80, index=True)


class GroupThread(SQLModel, table=True):
    """Top-level async discussion thread inside a LanguageGroup.

    Members of the group can post a thread (a question, a tip, a study
    plan, etc.). Replies live in GroupThreadReply. We denormalise
    reply_count + last_reply_at so the list view can sort and display
    without touching the replies table.

    Threads can be archived by the author (read-only, no new replies)
    or soft-hidden by any tutor who teaches the group's language.
    """

    __tablename__ = "group_thread"

    id: int | None = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="languagegroup.id", index=True)
    author_user_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(max_length=200)
    body_markdown: str = Field(max_length=8000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Sort key for the list view. Bumped on each new reply so live
    # conversations float to the top.
    last_reply_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    reply_count: int = Field(default=0, ge=0)
    # Author-side close: thread stays visible but no new replies allowed.
    archived_at: datetime | None = Field(default=None)
    # Tutor moderation. Hidden threads disappear for everyone except the
    # author + the tutor who hid it.
    hidden_at: datetime | None = Field(default=None)
    hidden_by_user_id: int | None = Field(default=None, foreign_key="user.id")


class GroupThreadReply(SQLModel, table=True):
    """Reply on a GroupThread."""

    __tablename__ = "group_thread_reply"

    id: int | None = Field(default=None, primary_key=True)
    thread_id: int = Field(foreign_key="group_thread.id", index=True)
    author_user_id: int = Field(foreign_key="user.id", index=True)
    body_markdown: str = Field(max_length=4000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    hidden_at: datetime | None = Field(default=None)
    hidden_by_user_id: int | None = Field(default=None, foreign_key="user.id")


class Cohort(SQLModel, table=True):
    """A tutor-posted group lesson series sold by-the-seat.

    Lives inside a LanguageGroup. Students buy seats individually; when
    `seats_filled >= max_seats` or the tutor manually confirms, status
    flips to CONFIRMED and enrolment closes. If `enrollment_deadline`
    passes with fewer than `min_seats` paid, the cron sweep marks the
    cohort CANCELLED and refunds every paid seat.

    Phase 2A: cohort marketplace + Stripe Connect checkout. Phase 2B
    will auto-create Booking rows on CONFIRMED so the cohort actually
    appears in the tutor's + students' booking lists. For now `lesson_schedule_note`
    is the source of truth for "when does this meet".
    """

    __tablename__ = "cohort"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    group_id: int = Field(foreign_key="languagegroup.id", index=True)
    title: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    # Tutor-written human-readable schedule, e.g. "Tuesdays 18:00 UTC,
    # 8 weeks starting March 4". Auto-Booking creation comes in 2B.
    lesson_schedule_note: str | None = Field(default=None, max_length=500)
    num_lessons: int = Field(ge=1, le=52)
    duration_minutes: int = Field(ge=15, le=240)
    price_per_seat_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    max_seats: int = Field(ge=2, le=50)
    # Minimum seats required to confirm. Defaults to 1 (tutor-fronted).
    min_seats: int = Field(default=1, ge=1)
    # First session UTC — surfaced as the headline "starts" date on the
    # cohort card.
    first_session_at: datetime
    # After this stamp, no new seat purchases. The cancellation cron
    # checks seat count at this point.
    enrollment_deadline: datetime
    status: CohortStatus = Field(default=CohortStatus.DRAFT, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    confirmed_at: datetime | None = Field(default=None)
    cancelled_at: datetime | None = Field(default=None)


class CohortSeat(SQLModel, table=True):
    """A student's paid seat in a Cohort. Mirrors ModulePurchase shape.

    Unique on (cohort_id, student_user_id) — a student can only hold
    one seat per cohort. Refunds stamp refunded_at without deleting the
    row so the audit trail stays intact.
    """

    __tablename__ = "cohort_seat"
    __table_args__ = (
        UniqueConstraint(
            "cohort_id", "student_user_id", name="uq_cohort_seat_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    cohort_id: int = Field(foreign_key="cohort.id", index=True)
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
    # Soft delete — DELETE flips deleted_at; the restore endpoint clears it.
    # List endpoints filter out non-null rows.
    deleted_at: datetime | None = Field(default=None, index=True)
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


class TutorNewsletterSubscriber(SQLModel, table=True):
    """A direct newsletter subscriber for a specific tutor — someone who
    filled in the public CTA form without necessarily having booked a
    lesson. Double-opt-in: the row stays unconfirmed (confirmed_at NULL)
    until the visitor clicks the link in the confirmation email; only
    confirmed rows enter the broadcast audience.

    Decoupled from the User table on purpose: a curious visitor signing
    up for "Vasso's Greek tips" shouldn't be forced to create a platform
    account. If the same email later registers as a User, the
    relationship can be reconciled at that point (out of scope for now).
    """

    __tablename__ = "tutor_newsletter_subscriber"
    __table_args__ = (
        UniqueConstraint(
            "tutor_id", "email", name="uq_newsletter_subscriber_pair"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    # We normalise to lowercase before insert.
    email: str = Field(max_length=320, index=True)
    name: str | None = Field(default=None, max_length=120)
    # Double-opt-in stamps. unsubscribed_at supersedes confirmed_at — a
    # subscriber who unsubscribes is removed from broadcasts even if
    # they re-confirm afterwards (they'd need to subscribe again).
    confirmed_at: datetime | None = Field(default=None, index=True)
    unsubscribed_at: datetime | None = Field(default=None, index=True)
    # Hashed confirmation token + TTL. Hashed in DB so a leaked dump
    # doesn't expose live links.
    confirmation_token_hash: str | None = Field(default=None, max_length=255)
    confirmation_expires_at: datetime | None = Field(default=None)
    # Forensic columns. The IP + UA at signup help if abuse needs to be
    # investigated (someone botting signups, etc.).
    ip: str | None = Field(default=None, max_length=64)
    user_agent: str | None = Field(default=None, max_length=400)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), index=True
    )


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
    # Set when a student submits this testimonial through the public
    # form (POST /testimonials/submit). Tutor-typed rows leave this
    # null. Used by the dashboard to flag "needs approval" rows + to
    # cross-check against the submitter's bookings before publish.
    submitted_by_user_id: int | None = Field(
        default=None, foreign_key="user.id", index=True
    )
    deleted_at: datetime | None = Field(default=None, index=True)
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
    # Optional tutor-written hook shown to non-subscribers viewing a
    # SUBSCRIBERS_ONLY article. If empty, the reader auto-falls-back to
    # the first ~200 words of body_markdown. Either way the non-
    # subscriber sees enough to decide whether to subscribe.
    preview_markdown: str | None = Field(default=None, max_length=10_000)
    # Piecemeal price for non-Plus students. 0 means "this article is
    # only available to Plus subscribers and module owners — no
    # one-shot purchase path". Plus subscribers always read free
    # regardless of price.
    price_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="eur", max_length=3)
    # Phase 1B engagement layer.
    # `comments_enabled` is opt-in per article: tutors flip it on when
    # they want a conversation under their piece. Default off so spam
    # surface is small.
    comments_enabled: bool = Field(default=False)
    # Denormalised rating summary so list views can sort/filter on
    # quality without joining the ratings table. Updated by the rating
    # endpoint on insert/update/delete.
    rating_avg: float | None = Field(default=None)
    rating_count: int = Field(default=0, ge=0)
    # Lexical editor state as JSON. Used by the reader for richer rendering
    # (clickable vocab tooltips, embedded media) without re-parsing
    # markdown. May be empty for articles created before Lexical landed
    # or saved by an older client — the reader falls back to body_markdown.
    lexical_json: str | None = Field(default=None)
    is_published: bool = Field(default=False, index=True)
    published_at: datetime | None = Field(default=None)
    deleted_at: datetime | None = Field(default=None, index=True)
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

    # ----- Team membership -----
    # Set when this tutor belongs to a TutorTeam (e.g. a school with a
    # shared Business subscription). Nullable for solo tutors. When set,
    # the team's owner is the billing payer; this tutor inherits Business
    # features and any team-wide custom theme.
    team_id: int | None = Field(
        default=None, foreign_key="tutor_team.id", index=True
    )
    # The custom design currently applied to this tutor's public site.
    # Populated when a CustomTheme is "applied" (phase 3 — custom theme
    # orders). Nullable means the tutor renders the platform default.
    active_theme_id: int | None = Field(default=None, index=True)

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
    cancellation_cutoff_hours: int = Field(default=48, ge=24, le=720)

    # ----- Booking lead time -----
    # Minimum gap (in minutes) between "now" and the start of a slot a
    # student is allowed to book. Tutors set this to protect prep time —
    # some want at least a day's notice, others are happy to take a
    # booking 30 minutes out. Range covers "any time, even 1 minute from
    # now" up to "a full month's notice required". The slot walker
    # filters anything earlier than `now + lead` before returning the
    # slot list; the booking POST re-checks at commit time.
    min_booking_lead_minutes: int = Field(default=120, ge=0, le=43_200)

    # ----- Theme -----
    # Pro+ tutors can pick from a curated set of colour bundles. The string
    # matches a CSS class on the frontend (theme-sage, theme-midnight, etc.).
    # Free + Plus tutors stay on the default — `sage` is what the platform
    # ships with, so nothing changes visually for them.
    theme: str = Field(default="sage", max_length=32)

    # ----- Newsletter signup CTA -----
    # Public lead-capture controls. The slim footer bar and the dedicated
    # homepage card can each be toggled independently; turning the master
    # switch off hides both. Title + description default to reasonable
    # placeholders so a tutor who never touches the dashboard still gets
    # a sensible CTA.
    newsletter_enabled: bool = Field(default=True)
    newsletter_show_in_footer: bool = Field(default=True)
    newsletter_show_homepage_section: bool = Field(default=True)
    newsletter_cta_title: str | None = Field(default=None, max_length=120)
    newsletter_cta_description: str | None = Field(default=None, max_length=400)

    # ----- Cross-promotion -----
    # When True (default), the tenant site renders a small "Browse
    # Kotobaseed" link so a curious visitor can wander into the wider
    # marketplace. Tutors with their own captive audience can flip this
    # off in settings — the marketplace shouldn't be in their visitor's
    # face if they don't want it to be. The flag is read on every page
    # render of the tenant site by the themed components, and the apex
    # marketplace surfaces ignore it entirely.
    show_kotobaseed_link: bool = Field(default=True)

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


# ---------------------------------------------------------------------------
# Multi-seat teams (Business subscription tier)
# ---------------------------------------------------------------------------


class TutorTeamInviteStatus(str, Enum):
    """Lifecycle of a single team invite."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"
    EXPIRED = "expired"


class TutorTeam(SQLModel, table=True):
    """A "school" — a Business subscriber that owns multiple Tutor seats.

    The owner is the user who pays the Business subscription. Other team
    members are tutors who accepted an invite; their Tutor rows carry
    `team_id` pointing here. Subscription-tier perks (0% lesson fee, etc.)
    flow through team membership — a member doesn't need their own paid
    subscription. The team is auto-created when the owner's Business
    subscription activates and torn down (or downgraded to a 1-seat
    archive) when it ends.

    Custom themes applied to a team are copied onto every member's
    TutorPageSection rows at apply time so all seats present the same
    brand to students.
    """

    __tablename__ = "tutor_team"

    id: int | None = Field(default=None, primary_key=True)
    owner_user_id: int = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)
    max_seats: int = Field(default=5, ge=1, le=100)

    # When a member leaves, students they taught while in this team can't
    # book the ex-member directly for this many days. Schools set this to
    # protect their client list. 0 = no protection. Owner can change it
    # at any time; new value applies only to future leave events.
    poaching_protection_days: int = Field(default=90, ge=0, le=365)

    # Stripe handles the base Business subscription on the owner User.
    # Extra seats are added as a subscription_item on that same sub; we
    # cache the item id here so we can update quantity without re-finding
    # it on every API call.
    stripe_seat_subscription_item_id: str | None = Field(
        default=None, max_length=128
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorProtectedStudent(SQLModel, table=True):
    """Non-compete record — a student who can't book this ex-tutor while
    the protection window is open.

    Created when a tutor leaves a TutorTeam (whether removed by the owner
    or self-leaving). For every distinct student the tutor taught while
    on that team, we stamp one of these rows with
    `protection_ends_at = now + team.poaching_protection_days`. Booking
    checkout for the ex-tutor checks this table and refuses with a
    helpful 403 until the window closes.

    Rows are kept after expiry as an audit trail — the booking check is
    a simple "still active?" comparison on protection_ends_at.
    """

    __tablename__ = "tutor_protected_student"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)
    student_user_id: int = Field(foreign_key="user.id", index=True)
    former_team_id: int = Field(foreign_key="tutor_team.id", index=True)

    protection_ends_at: datetime = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TutorTeamInvite(SQLModel, table=True):
    """One outstanding invite to join a TutorTeam.

    The token is a URL-safe random string; the accept link is
    `https://kotobaseed.net/onboarding/team-accept?token=...`. Invites
    expire after 14 days. Accepting flips status to ACCEPTED and stamps
    the new member's user id + their Tutor.team_id.
    """

    __tablename__ = "tutor_team_invite"

    id: int | None = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key="tutor_team.id", index=True)
    email: str = Field(max_length=255, index=True)
    token: str = Field(unique=True, index=True, max_length=80)

    invited_by_user_id: int = Field(foreign_key="user.id")
    status: TutorTeamInviteStatus = Field(
        default=TutorTeamInviteStatus.PENDING, index=True
    )

    expires_at: datetime
    accepted_at: datetime | None = None
    accepted_by_user_id: int | None = Field(default=None, foreign_key="user.id")

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


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
# Tutor site customization — landing-page sections
#
# Theme + per-tutor branding live on the Tutor row (`Tutor.theme`) and in
# services/themes.py (static catalogue). The old `Theme` table and
# `TutorBranding` table were scaffolded in an earlier refactor and never
# wired up — dropped in migration 20260611_drop_orphan_scaffolds.
# ---------------------------------------------------------------------------


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
# Custom designed themes (the paid bespoke service)
# ---------------------------------------------------------------------------


class CustomThemeStatus(str, Enum):
    DRAFT = "draft"        # built locally but not yet ready to apply
    READY = "ready"        # designer delivered + tutor approved + paid
    ARCHIVED = "archived"  # superseded (e.g. tutor commissioned a new theme)


class CustomTheme(SQLModel, table=True):
    """A finished bespoke design, owned by a User (personal) OR by a Team
    (school-wide). At least one of owner_user_id / owner_team_id must be
    set; both is not allowed (validated at write time).

    `design_payload_json` is the serialised TutorPageSection layout —
    a list of {section_type, position, is_visible, content} dicts that
    the apply helper writes onto every affected tutor's TutorPageSection
    rows on delivery.
    """

    __tablename__ = "custom_theme"

    id: int | None = Field(default=None, primary_key=True)
    owner_user_id: int | None = Field(
        default=None, foreign_key="user.id", index=True
    )
    owner_team_id: int | None = Field(
        default=None, foreign_key="tutor_team.id", index=True
    )

    name: str = Field(max_length=160)
    design_payload_json: str = Field(default="[]")
    status: CustomThemeStatus = Field(
        default=CustomThemeStatus.DRAFT, index=True
    )
    # Which order produced this theme — link back for support.
    source_order_id: int | None = Field(
        default=None, foreign_key="custom_theme_order.id", index=True
    )

    # ----- v2: scalable theme-upload system -----
    # When set, this theme is renderable by the runtime CustomThemeSite
    # component (Phase B). Older bespoke themes leave these null and
    # continue rendering through their dedicated React component.
    #
    # `theme_key` is the short slug the frontend matches against
    # `Tutor.theme` to decide whether to mount the v2 renderer.
    # Format: `custom-<slug>`. Indexed so the lookup at page-load is cheap.
    theme_key: str | None = Field(default=None, max_length=64, index=True)
    # CSS-variable palette + radii/shadow tokens, as a JSON dict. Values
    # are injected as inline styles on the themed root by the runtime
    # renderer. e.g. `{"--brand": "#0a4f8a", "--accent": "#e8b84b"}`.
    palette_json: str = Field(default="{}")
    # Google Fonts loader URL + per-role font-family choices. e.g.
    # `{"url": "https://fonts.googleapis.com/...", "display": "Commissioner",
    #   "body": "Manrope", "logo": "Syne"}`.
    fonts_json: str = Field(default="{}")
    # Admin-uploaded preview screenshot shown on the tutor's theme picker.
    preview_image_url: str | None = Field(default=None, max_length=2048)
    # When true, every tutor sees this theme in their picker (curated
    # catalogue). When false, only the owning user / team sees it.
    is_public_catalogue: bool = Field(default=False, index=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CustomThemePackage(str, Enum):
    """Two SKUs of the custom design service.

    STANDARD : 3 concepts, up to 2 revisions, full home-page layout
    PREMIUM  : everything in STANDARD + custom article templates, branded
               module covers, custom Daily.co welcome screen
    """

    STANDARD = "standard"
    PREMIUM = "premium"


class CustomThemeOrderStatus(str, Enum):
    """Order lifecycle.

    DRAFT          : tutor filled the brief, deposit not paid
    DEPOSIT_PAID   : 50% in escrow with us, queue waiting for designer
    CONCEPTS_READY : admin uploaded 3 preview links, tutor needs to review
    REVIEWING     : tutor is looking at the previews
    REVISING       : tutor asked for adjustments (count tracked in revision_count)
    APPROVED       : tutor picked a concept, ready for final payment
    FINAL_PAID     : 50% balance collected, theme application running
    DELIVERED      : theme written onto target tutor(s)' sections + active_theme_id
    CANCELLED      : explicit cancellation; deposit non-refundable per T&Cs
    """

    DRAFT = "draft"
    DEPOSIT_PAID = "deposit_paid"
    CONCEPTS_READY = "concepts_ready"
    REVIEWING = "reviewing"
    REVISING = "revising"
    APPROVED = "approved"
    FINAL_PAID = "final_paid"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class CustomThemeOrder(SQLModel, table=True):
    """One commission for a bespoke design.

    `target_team_id` is set when the order is for a team's shared theme
    (Business owners only). `target_tutor_id` is always set — for solo
    orders this is the customer themself; for team orders it's the
    initiator + a sentinel of "the theme will apply to every team member
    on delivery".
    """

    __tablename__ = "custom_theme_order"

    id: int | None = Field(default=None, primary_key=True)
    ordering_user_id: int = Field(foreign_key="user.id", index=True)
    target_tutor_id: int = Field(foreign_key="tutor.id", index=True)
    target_team_id: int | None = Field(
        default=None, foreign_key="tutor_team.id", index=True
    )

    package: CustomThemePackage = Field(default=CustomThemePackage.STANDARD)
    status: CustomThemeOrderStatus = Field(
        default=CustomThemeOrderStatus.DRAFT, index=True
    )

    # Pricing snapshot at order time (insulates against later tier changes).
    deposit_cents: int = Field(ge=0)
    final_cents: int = Field(ge=0)
    discount_percent: int = Field(default=0, ge=0, le=100)
    currency: str = Field(default="eur", max_length=8)

    # JSON-encoded brief from the intake form: audience, tone, languages,
    # color leanings, inspiration links, photo url, etc.
    brief_payload_json: str = Field(default="{}")
    # JSON-encoded list of 3 admin-uploaded concept descriptors:
    # [{"label": "Modern Sage", "image_url": "...", "notes": "..."}, ...]
    concept_previews_json: str = Field(default="[]")
    selected_concept_index: int | None = None

    revision_count: int = Field(default=0, ge=0, le=2)
    # Tutor's per-round feedback: list of {"round": N, "notes": "..."} dicts.
    revision_notes_json: str = Field(default="[]")
    designer_notes: str | None = Field(default=None, max_length=2000)

    # Stripe handles.
    stripe_deposit_session_id: str | None = Field(default=None, max_length=255)
    stripe_deposit_payment_intent_id: str | None = Field(
        default=None, max_length=255
    )
    stripe_final_session_id: str | None = Field(default=None, max_length=255)
    stripe_final_payment_intent_id: str | None = Field(
        default=None, max_length=255
    )

    delivered_theme_id: int | None = Field(
        default=None, foreign_key="custom_theme.id"
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deposit_paid_at: datetime | None = None
    concepts_ready_at: datetime | None = None
    approved_at: datetime | None = None
    final_paid_at: datetime | None = None
    delivered_at: datetime | None = None
    cancelled_at: datetime | None = None


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


class ReferralCodeKind(str, Enum):
    TUTOR_PEER = "tutor_peer"
    STUDENT_PEER = "student_peer"
    AFFILIATE = "affiliate"


class ReferralCode(SQLModel, table=True):
    """A user's personal referral code. One row per (user, kind) so a user
    can simultaneously have a tutor-peer code and a student-peer code."""

    __tablename__ = "referral_code"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    code: str = Field(unique=True, index=True, max_length=32)
    kind: ReferralCodeKind = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ReferralAttribution(SQLModel, table=True):
    """A user signed up with a referral code. Qualifies into reward rows
    once the referred user completes a qualifying action (first paid
    lesson, lifetime revenue milestone, etc.)."""

    __tablename__ = "referral_attribution"

    id: int | None = Field(default=None, primary_key=True)
    code_id: int = Field(foreign_key="referral_code.id", index=True)
    referrer_user_id: int = Field(foreign_key="user.id", index=True)
    referred_user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    kind: ReferralCodeKind = Field(index=True)
    first_qualified_at: datetime | None = Field(default=None, index=True)
    qualifying_amount_cents: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ReferralRewardKind(str, Enum):
    STUDENT_PEER_CREDIT = "student_peer_credit"
    TUTOR_PEER_MILESTONE = "tutor_peer_milestone"
    AFFILIATE_TUTOR = "affiliate_tutor"
    AFFILIATE_STUDENT = "affiliate_student"


class ReferralRewardStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    VOID = "void"


class ReferralReward(SQLModel, table=True):
    """Reward owed to a referrer for a qualified attribution + milestone."""

    __tablename__ = "referral_reward"

    id: int | None = Field(default=None, primary_key=True)
    referrer_user_id: int = Field(foreign_key="user.id", index=True)
    attribution_id: int = Field(foreign_key="referral_attribution.id", index=True)
    kind: ReferralRewardKind = Field(index=True)
    # `milestone_key` lets us dedupe — only one TUTOR_PEER_MILESTONE per
    # attribution per (e.g. "first_lesson", "rev_500", "rev_2000").
    milestone_key: str | None = Field(default=None, max_length=64, index=True)
    amount_cents: int = Field(ge=0)
    currency: str = Field(default="eur", max_length=3)
    status: ReferralRewardStatus = Field(
        default=ReferralRewardStatus.PENDING, index=True
    )
    earned_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    paid_at: datetime | None = Field(default=None)
    paid_via: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=500)


class AffiliateApplicationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AffiliateApplication(SQLModel, table=True):
    __tablename__ = "affiliate_application"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    website_url: str = Field(max_length=2048)
    audience_description: str = Field(max_length=4000)
    status: AffiliateApplicationStatus = Field(
        default=AffiliateApplicationStatus.PENDING, index=True
    )
    reviewed_by_user_id: int | None = Field(default=None, foreign_key="user.id")
    reviewed_at: datetime | None = Field(default=None)
    admin_notes: str | None = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LessonCredit(SQLModel, table=True):
    """Cash-equivalent credit toward a lesson booking (€10 from referring a
    friend, refund credits, promo etc.). Separate from PriorityCredit
    which only affects request queue position. Expires after 1 year."""

    __tablename__ = "lesson_credit"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    amount_cents: int = Field(ge=0)
    currency: str = Field(default="eur", max_length=3)
    source: str = Field(max_length=64, description="e.g. referral, refund, promo")
    source_id: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC) + timedelta(days=365),
    )
    used_at: datetime | None = Field(default=None)
    used_on_booking_id: int | None = Field(
        default=None, foreign_key="booking.id"
    )


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
# Tutor onboarding tutorial progress
# ---------------------------------------------------------------------------


class TutorOnboardingProgress(SQLModel, table=True):
    """Per-tutor state for the resumable onboarding walkthrough.

    The list of available modules + their content lives on the frontend
    (the wizard renders from a static catalogue). This row just records
    which module keys the tutor has marked complete and where to drop
    them back in when they return.
    """

    __tablename__ = "tutor_onboarding_progress"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", unique=True, index=True)

    # JSON-encoded list of module keys the tutor has marked complete.
    # We keep it as a string column so adding/removing modules in the
    # catalogue never requires a migration.
    completed_module_keys_json: str = Field(default="[]")

    # The last module the tutor opened — drives "Continue where you left
    # off" so closing the tab and coming back lands them on the same step.
    last_viewed_module_key: str | None = Field(default=None, max_length=64)

    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_viewed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None


# ---------------------------------------------------------------------------
# Admin comps / service grants
# ---------------------------------------------------------------------------


class AdminGrantKind(str, Enum):
    """What the comp gives the user.

    - TIER_UPGRADE: temporarily set User.subscription_tier (e.g. give a
      contracted reviewer Pro for 30 days). expires_at controls auto-revoke.
    - MINUTE_PACK: drop a MinutePack row of N scheduled-min minutes onto
      the target tutor's account. No expiry needed — pack expires when used.
    - LESSON_CREDIT: grant N free 1:1 lessons (waives the platform fee
      AND the student's Stripe charge). expires_at = use-by date.
    - DISCOUNT: apply a percent or amount off the user's next subscription
      invoice via a one-shot Stripe Coupon.

    For TIER_UPGRADE + LESSON_CREDIT, leaving expires_at NULL means
    "until an admin revokes."
    """

    TIER_UPGRADE = "tier_upgrade"
    MINUTE_PACK = "minute_pack"
    LESSON_CREDIT = "lesson_credit"
    DISCOUNT = "discount"


class AdminGrantStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"
    CONSUMED = "consumed"  # used up before expiry (e.g. all minutes spent)


class AdminGrant(SQLModel, table=True):
    """One admin-issued comp / service grant.

    Created via the admin panel for marketing / contract / testing
    arrangements. The cron sweeps time-gated rows to auto-flip them to
    EXPIRED and reverse any side effects (e.g. tier reversion). Revoking
    manually does the same immediately.
    """

    __tablename__ = "admin_grant"

    id: int | None = Field(default=None, primary_key=True)
    granted_to_user_id: int = Field(foreign_key="user.id", index=True)
    granted_by_user_id: int = Field(foreign_key="user.id")

    kind: AdminGrantKind = Field(index=True)
    # JSON-encoded payload — shape depends on `kind`:
    #   TIER_UPGRADE   {"tier": "pro"}
    #   MINUTE_PACK    {"minutes": 2000}
    #   LESSON_CREDIT  {"count": 3, "max_lesson_minutes": 60}
    #   DISCOUNT       {"percent_off": 50}  OR  {"amount_off_cents": 1000, "currency": "eur"}
    payload_json: str = Field(default="{}")

    # Optional expiry. None = until an admin revokes.
    expires_at: datetime | None = Field(default=None, index=True)

    status: AdminGrantStatus = Field(
        default=AdminGrantStatus.ACTIVE, index=True
    )
    reason: str | None = Field(
        default=None,
        max_length=500,
        description="Short note for the audit log: campaign, contract id, etc.",
    )

    # Backrefs we set when activation/revocation touches an existing row
    # — e.g. when a TIER_UPGRADE grants Pro, we remember what tier the
    # user had before so revocation can restore it cleanly.
    previous_tier: str | None = Field(default=None, max_length=32)
    # If the grant materialised side-effect rows (e.g. a MinutePack), we
    # stash the ids here so revoke can clean them up.
    side_effect_ids_json: str = Field(default="[]")

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    revoked_at: datetime | None = None
    expired_at: datetime | None = None


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


class MinutePack(SQLModel, table=True):
    """One-time top-up of classroom minutes on top of the tier quota.

    Granted via Stripe checkout (see backend/routers/minute_packs.py + the
    pledges webhook). Minutes are consumed FIFO across all of a tutor's
    active packs after the base tier quota is exhausted.

    `minutes_remaining` is decremented in place each time a booking
    eats from this pack. When it reaches zero the pack stays in the row
    history (audit trail) but no longer contributes to effective quota.
    """

    __tablename__ = "minute_pack"

    id: int | None = Field(default=None, primary_key=True)
    tutor_id: int = Field(foreign_key="tutor.id", index=True)

    minutes_purchased: int = Field(ge=1)
    minutes_remaining: int = Field(ge=0)

    price_cents: int = Field(ge=0)
    currency: str = Field(default="eur", max_length=8)

    stripe_checkout_session_id: str | None = Field(
        default=None, max_length=255, index=True
    )
    stripe_payment_intent_id: str | None = Field(default=None, max_length=255)

    purchased_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_used_at: datetime | None = None


# PlatformSubscription was scaffolded for tutor platform billing but the
# canonical fields ended up on User.subscription_tier + Tutor.stripe_*.
# The duplicate table was dropped in 20260611_drop_orphan_scaffolds.
