import os
from collections import defaultdict
from datetime import UTC, datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_user, get_current_user_optional
from ..models import (
    Booking,
    BookingStatus,
    Conversation,
    LessonPack,
    Message,
    Notification,
    Pledge,
    PledgeStatus,
    Project,
    ProjectRating,
    ProjectStatus,
    Request,
    TeacherFollower,
    TeacherVerification,
    Tutor,
    User,
    UserRole,
    VerificationStatus,
    VideoComment,
)
from ..routers.projects import _cancel_project_logic, _create_project_read
from ..schemas import FilterOptionsRead, LanguageLevelsRead, PaginatedProjectRead

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Single placeholder User that owns data orphaned by self-delete or admin
# delete. Lookup-by-email is the way to dedupe; previously this lived in two
# files with two different addresses and could collide.
DELETED_USER_EMAIL = "deleted-user@kotobaseed.internal"

router = APIRouter(prefix="/users", tags=["users"])


def _get_or_create_deleted_user(session: Session) -> User:
    """Return the singleton placeholder User that owns orphaned data.

    Idempotent — safe to call from both the self-delete and admin-delete paths.
    """
    placeholder = session.exec(
        select(User).where(User.email == DELETED_USER_EMAIL)
    ).first()
    if placeholder:
        return placeholder
    now = datetime.now(UTC)
    placeholder = User(
        email=DELETED_USER_EMAIL,
        hashed_password="placeholder_deleted_password",
        full_name="Deleted User",
        role=UserRole.STUDENT,
        is_active=False,
        created_at=now,
        updated_at=now,
        deleted_at=now,
    )
    session.add(placeholder)
    session.commit()
    session.refresh(placeholder)
    return placeholder


# Pydantic Models
class OnboardingResponse(BaseModel):
    onboarding_url: str


class TeacherRead(BaseModel):
    id: int
    full_name: str


class UserProfile(BaseModel):
    id: int
    full_name: str
    bio: str | None
    languages: str | None
    role: UserRole
    created_at: str
    average_rating: float | None = None
    intro_video_url: str | None = None
    sample_video_url: str | None = None
    avatar_url: str | None = None
    verified_languages: list[str] = []
    language_groups: list[str] = []
    follower_count: int = 0
    is_following: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    full_name: str | None = None
    bio: str | None = None
    languages: str | None = None
    intro_video_url: str | None = None
    sample_video_url: str | None = None
    avatar_url: str | None = None
    profile_public: bool | None = None


class ProjectInfoForRating(BaseModel):
    id: int
    title: str
    funding_goal: int
    language: str
    level: str
    tags: str | None = None


class TeacherRatingRead(BaseModel):
    rating: int
    comment: str | None
    created_at: datetime
    project: ProjectInfoForRating
    teacher_response: str | None = None
    response_created_at: datetime | None = None


class FollowerRead(BaseModel):
    id: int
    full_name: str
    avatar_url: str | None
    total_pledged: int


class FollowingTeacherRead(BaseModel):
    id: int
    full_name: str
    avatar_url: str | None
    total_pledged: int


# API Endpoints
@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return the User row plus a `tutor_slug` (or null) so the apex
    Navbar knows whether to show "My site" / "My dashboard" entries.
    """
    tutor = session.exec(select(Tutor).where(Tutor.user_id == current_user.id)).first()
    payload = current_user.model_dump(exclude={"hashed_password"})
    payload["tutor_slug"] = tutor.tutor_slug if tutor else None
    return payload


@router.patch("/me", response_model=User)
def update_me(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user_data = user_in.model_dump(exclude_unset=True)
    for key, value in user_data.items():
        setattr(current_user, key, value)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


class StudentBookingRead(BaseModel):
    id: int
    tutor_slug: str | None
    tutor_display_name: str | None
    pack_name: str | None
    scheduled_at: datetime
    duration_minutes: int
    price_cents: int
    currency: str
    status: BookingStatus
    paid_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    refunded_at: datetime | None


@router.get("/me/bookings", response_model=list[StudentBookingRead])
def list_my_bookings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """All bookings (across all tutors) for the current student. Newest first."""
    rows = session.exec(
        select(Booking)
        .where(Booking.student_user_id == current_user.id)
        .order_by(Booking.scheduled_at.desc())
    ).all()
    tutor_ids = {b.tutor_id for b in rows}
    pack_ids = {b.lesson_pack_id for b in rows}
    tutors = {
        t.id: t for t in session.exec(select(Tutor).where(Tutor.id.in_(tutor_ids))).all()
    } if tutor_ids else {}
    packs = {
        p.id: p for p in session.exec(select(LessonPack).where(LessonPack.id.in_(pack_ids))).all()
    } if pack_ids else {}
    return [
        StudentBookingRead(
            id=b.id,
            tutor_slug=tutors.get(b.tutor_id).tutor_slug if tutors.get(b.tutor_id) else None,
            tutor_display_name=tutors.get(b.tutor_id).display_name if tutors.get(b.tutor_id) else None,
            pack_name=packs.get(b.lesson_pack_id).name if packs.get(b.lesson_pack_id) else None,
            scheduled_at=b.scheduled_at,
            duration_minutes=b.duration_minutes,
            price_cents=b.price_cents,
            currency=b.currency,
            status=b.status,
            paid_at=b.paid_at,
            completed_at=b.completed_at,
            cancelled_at=b.cancelled_at,
            refunded_at=b.refunded_at,
        )
        for b in rows
    ]


@router.post("/me/bookings/{booking_id}/cancel", response_model=StudentBookingRead)
def cancel_my_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Cancel a future, confirmed booking and refund via Stripe.

    Rules:
      - Only the student who paid can cancel.
      - Past lessons (scheduled_at <= now) cannot be cancelled — talk to
        the tutor for an after-the-fact resolution.
      - PENDING_PAYMENT bookings get marked CANCELLED without a refund
        (no money moved yet).
      - CONFIRMED bookings get refunded via Stripe with the Application
        Fee reversed and the transfer pulled back from the Connect
        account. The status flips to REFUNDED.
    """
    booking = session.get(Booking, booking_id)
    if not booking or booking.student_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    now = datetime.now(UTC)
    if booking.scheduled_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That lesson has already started or is in the past.",
        )
    if booking.status == BookingStatus.PENDING_PAYMENT:
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = now
        booking.updated_at = now
        session.add(booking)
        session.commit()
        session.refresh(booking)
    elif booking.status == BookingStatus.CONFIRMED:
        if not booking.stripe_payment_intent_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Booking has no payment intent on file — contact support.",
            )
        try:
            stripe.Refund.create(
                api_key=os.environ.get("STRIPE_SECRET_KEY"),
                payment_intent=booking.stripe_payment_intent_id,
                reverse_transfer=True,
                refund_application_fee=True,
            )
        except stripe.error.StripeError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Stripe refund failed. Try again or contact support.",
            ) from None
        booking.status = BookingStatus.REFUNDED
        booking.cancelled_at = now
        booking.refunded_at = now
        booking.updated_at = now
        session.add(booking)
        session.commit()
        session.refresh(booking)
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Booking is {booking.status.value}; cannot cancel.",
        )

    tutor = session.get(Tutor, booking.tutor_id)
    pack = session.get(LessonPack, booking.lesson_pack_id)
    return StudentBookingRead(
        id=booking.id,
        tutor_slug=tutor.tutor_slug if tutor else None,
        tutor_display_name=tutor.display_name if tutor else None,
        pack_name=pack.name if pack else None,
        scheduled_at=booking.scheduled_at,
        duration_minutes=booking.duration_minutes,
        price_cents=booking.price_cents,
        currency=booking.currency,
        status=booking.status,
        paid_at=booking.paid_at,
        completed_at=booking.completed_at,
        cancelled_at=booking.cancelled_at,
        refunded_at=booking.refunded_at,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    # 1. Find or create the singleton deleted-user placeholder
    deleted_user = _get_or_create_deleted_user(session)

    # If the user is a teacher, cancel their non-completed projects
    if current_user.role == UserRole.CREATOR:
        teacher_projects = session.exec(
            select(Project)
            .where(Project.teacher_id == current_user.id)
            .options(selectinload(Project.pledges))
        ).all()
        for project in teacher_projects:
            if project.status not in [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED]:
                _cancel_project_logic(project, session)

    # 2. Reassign all associated data to the 'deleted@system' user
    # Projects
    for project in session.exec(select(Project).where(Project.teacher_id == current_user.id)).all():
        project.teacher_id = deleted_user.id
        session.add(project)
    # Pledges
    for pledge in session.exec(select(Pledge).where(Pledge.user_id == current_user.id)).all():
        pledge.user_id = deleted_user.id
        session.add(pledge)
    # Requests
    for request_obj in session.exec(
        select(Request).where(Request.user_id == current_user.id)
    ).all():
        request_obj.user_id = deleted_user.id
        session.add(request_obj)
    # ProjectRatings
    for rating in session.exec(
        select(ProjectRating).where(ProjectRating.user_id == current_user.id)
    ).all():
        rating.user_id = deleted_user.id
        session.add(rating)
    # VideoComments
    for comment in session.exec(
        select(VideoComment).where(VideoComment.user_id == current_user.id)
    ).all():
        comment.user_id = deleted_user.id
        session.add(comment)
    # Notifications
    for notification in session.exec(
        select(Notification).where(Notification.user_id == current_user.id)
    ).all():
        notification.user_id = deleted_user.id
        session.add(notification)
    # TeacherVerifications
    if current_user.role == UserRole.CREATOR:
        for verification in session.exec(
            select(TeacherVerification).where(TeacherVerification.teacher_id == current_user.id)
        ).all():
            verification.teacher_id = deleted_user.id
            session.add(verification)

    # Conversations and Messages
    for conv in session.exec(
        select(Conversation).where(Conversation.student_id == current_user.id)
    ).all():
        conv.student_demo_video_url = None
        conv.student_id = deleted_user.id
        session.add(conv)
    for conv in session.exec(
        select(Conversation).where(Conversation.teacher_id == current_user.id)
    ).all():
        conv.teacher_id = deleted_user.id
        session.add(conv)
    for msg in session.exec(select(Message).where(Message.sender_id == current_user.id)).all():
        msg.sender_id = deleted_user.id
        session.add(msg)

    # 3. Anonymize the current_user's data (soft delete)
    now = datetime.now(UTC)
    current_user.full_name = "Deleted User"
    current_user.email = f"deleted_{current_user.id}_{int(now.timestamp())}@system.com"
    current_user.hashed_password = "deleted"
    current_user.bio = None
    current_user.languages = None
    current_user.intro_video_url = None
    current_user.sample_video_url = None
    current_user.avatar_url = None
    current_user.stripe_account_id = None
    current_user.deleted_at = now
    current_user.role = UserRole.STUDENT

    session.add(current_user)
    session.commit()
    session.refresh(current_user)


@router.get("/{user_id}/profile", response_model=UserProfile)
def get_user_profile(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
):
    user = session.get(User, user_id, options=[selectinload(User.language_groups)])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Privacy: students who opted out are hidden from anyone but themselves.
    # Teachers and tutors are always public (their business face). 404 (not
    # 403) so we don't leak whether the slug exists.
    if (
        user.role == UserRole.STUDENT
        and not user.profile_public
        and (current_user is None or current_user.id != user.id)
    ):
        raise HTTPException(status_code=404, detail="User not found")

    average_rating = None
    verified_languages = []
    follower_count = 0
    if user.role == UserRole.CREATOR:
        # Calculate average rating
        rating_statement = (
            select(func.avg(ProjectRating.rating))
            .join(Project)
            .where(Project.teacher_id == user.id)
        )
        avg_rating_result = session.exec(rating_statement).first()
        if avg_rating_result:
            average_rating = round(avg_rating_result, 1)

        verification_statement = select(TeacherVerification.language).where(
            TeacherVerification.teacher_id == user.id,
            TeacherVerification.status == VerificationStatus.APPROVED,
        )
        verified_languages = session.exec(verification_statement).all()

        # Calculate follower count
        follower_count = session.exec(
            select(func.count(TeacherFollower.student_id)).where(
                TeacherFollower.teacher_id == user.id
            )
        ).one()

    is_following = False
    if current_user and current_user.id != user.id:
        is_following = session.get(TeacherFollower, (user.id, current_user.id)) is not None

    return UserProfile(
        id=user.id,
        full_name=user.full_name,
        bio=user.bio,
        languages=user.languages,
        role=user.role,
        created_at=user.created_at.isoformat(),
        average_rating=average_rating,
        intro_video_url=user.intro_video_url,
        sample_video_url=user.sample_video_url,
        avatar_url=user.avatar_url,
        verified_languages=verified_languages,
        language_groups=[group.language_name for group in user.language_groups],
        follower_count=follower_count,
        is_following=is_following,
    )


@router.post("/{teacher_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def follow_teacher(
    teacher_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.id == teacher_id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself.")

    teacher = session.get(User, teacher_id)
    if not teacher or teacher.role != UserRole.CREATOR:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    follow = session.get(TeacherFollower, (teacher_id, current_user.id))
    if follow:
        return

    new_follow = TeacherFollower(teacher_id=teacher_id, student_id=current_user.id)
    session.add(new_follow)

    # Notify the teacher
    notification = Notification(
        user_id=teacher_id,
        message=f"{current_user.full_name} is now following you.",
        link=f"/profile/{current_user.id}",
    )
    session.add(notification)
    session.commit()


@router.delete("/{teacher_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_teacher(
    teacher_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    follow = session.get(TeacherFollower, (teacher_id, current_user.id))
    if not follow:
        return

    session.delete(follow)
    session.commit()


@router.get("/{teacher_id}/followers", response_model=list[FollowerRead])
def get_teacher_followers(
    teacher_id: int, limit: int = 10, offset: int = 0, session: Session = Depends(get_session)
):
    teacher = session.get(User, teacher_id)
    if not teacher or teacher.role != UserRole.CREATOR:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    followers_statement = (
        select(User, func.sum(Pledge.amount).label("total_pledged"))
        .join(TeacherFollower, User.id == TeacherFollower.student_id)
        .join(
            Pledge,
            and_(User.id == Pledge.user_id, Pledge.status == PledgeStatus.CAPTURED),
            isouter=True,
        )
        .join(
            Project,
            and_(Pledge.project_id == Project.id, Project.teacher_id == teacher_id),
            isouter=True,
        )
        .where(TeacherFollower.teacher_id == teacher_id)
        .group_by(User.id)
        .order_by(func.sum(Pledge.amount).desc().nulls_last())
        .limit(limit)
        .offset(offset)
    )

    results = session.exec(followers_statement).all()

    return [
        FollowerRead(
            id=user.id,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            total_pledged=total_pledged or 0,
        )
        for user, total_pledged in results
    ]


@router.get("/{user_id}/following", response_model=list[FollowingTeacherRead])
def get_user_following(user_id: int, session: Session = Depends(get_session)):
    """
    Get a list of teachers a specific user is following, ranked by how much that user has pledged to them.
    """
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    statement = (
        select(User, func.sum(Pledge.amount).label("total_pledged"))
        .join(TeacherFollower, User.id == TeacherFollower.teacher_id)
        .join(Project, User.id == Project.teacher_id, isouter=True)
        .join(
            Pledge,
            and_(
                Project.id == Pledge.project_id,
                Pledge.user_id == user_id,  # Use the user_id from the path
                Pledge.status == PledgeStatus.CAPTURED,
            ),
            isouter=True,
        )
        .where(TeacherFollower.student_id == user_id)  # Use the user_id from the path
        .group_by(User.id)
        .order_by(func.sum(Pledge.amount).desc().nulls_last())
    )
    results = session.exec(statement).all()
    return [
        FollowingTeacherRead(
            id=teacher.id,
            full_name=teacher.full_name,
            avatar_url=teacher.avatar_url,
            total_pledged=total_pledged or 0,
        )
        for teacher, total_pledged in results
    ]


@router.get("/{user_id}/backed-projects", response_model=PaginatedProjectRead)
def get_user_backed_projects(
    user_id: int,
    limit: int = 10,
    offset: int = 0,
    current_user: User | None = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    base_query = select(Project).join(Pledge).where(Pledge.user_id == user_id)

    count_statement = select(func.count()).select_from(base_query.subquery())
    total_count = session.exec(count_statement).one()

    projects_statement = (
        base_query.options(selectinload(Project.teacher), selectinload(Project.videos))
        .offset(offset)
        .limit(limit)
    )
    projects = session.exec(projects_statement).all()

    return PaginatedProjectRead(
        projects=[_create_project_read(p, current_user, session) for p in projects],
        total_count=total_count,
    )


@router.get("/{user_id}/completed-projects", response_model=PaginatedProjectRead)
def get_teacher_completed_projects(
    user_id: int,
    language: str | None = None,
    level: str | None = None,
    search: str | None = None,
    limit: int = 10,
    offset: int = 0,
    current_user: User | None = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    teacher = session.get(User, user_id)
    if not teacher or teacher.role != UserRole.CREATOR:
        raise HTTPException(status_code=404, detail="Teacher not found")

    base_query = select(Project).where(
        Project.teacher_id == user_id, Project.status == ProjectStatus.COMPLETED
    )

    if language:
        base_query = base_query.where(Project.language == language)
    if level:
        base_query = base_query.where(Project.level == level)
    if search:
        search_term = f"%{search}%"
        base_query = base_query.where(
            or_(
                Project.title.ilike(search_term),
                Project.description.ilike(search_term),
                Project.tags.ilike(search_term),
            )
        )

    count_statement = select(func.count()).select_from(base_query.subquery())
    total_count = session.exec(count_statement).one()

    projects_statement = (
        base_query.options(selectinload(Project.teacher), selectinload(Project.videos))
        .offset(offset)
        .limit(limit)
    )
    projects = session.exec(projects_statement).all()

    return PaginatedProjectRead(
        projects=[_create_project_read(p, current_user, session) for p in projects],
        total_count=total_count,
    )


@router.get("/{user_id}/completed-projects/filter-options", response_model=FilterOptionsRead)
def get_teacher_completed_projects_filter_options(
    user_id: int, session: Session = Depends(get_session)
):
    teacher = session.get(User, user_id)
    if not teacher or teacher.role != UserRole.CREATOR:
        raise HTTPException(status_code=404, detail="Teacher not found")

    query = (
        select(Project.language, Project.level)
        .where(Project.teacher_id == user_id, Project.status == ProjectStatus.COMPLETED)
        .distinct()
    )
    results = session.exec(query).all()

    language_levels = defaultdict(set)
    for lang, level in results:
        language_levels[lang].add(level)

    languages_list = [
        LanguageLevelsRead(language=lang, levels=sorted(levels))
        for lang, levels in language_levels.items()
    ]

    return FilterOptionsRead(languages=sorted(languages_list, key=lambda x: x.language))


@router.get("/{user_id}/ratings", response_model=list[TeacherRatingRead])
def get_teacher_ratings(user_id: int, session: Session = Depends(get_session)):
    teacher = session.get(User, user_id)
    if not teacher or teacher.role != UserRole.CREATOR:
        raise HTTPException(status_code=404, detail="Teacher not found")

    statement = (
        select(ProjectRating)
        .join(Project)
        .where(Project.teacher_id == teacher.id)  # Corrected from user.id to teacher.id
        .options(selectinload(ProjectRating.project))
        .order_by(ProjectRating.created_at.desc())
    )

    ratings = session.exec(statement).all()

    return [
        TeacherRatingRead(
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
            project=ProjectInfoForRating(
                id=r.project.id,
                title=r.project.title,
                funding_goal=r.project.funding_goal,
                language=r.project.language,
                level=r.project.level,
                tags=r.project.tags,
            ),
            teacher_response=r.teacher_response,
            response_created_at=r.response_created_at,
        )
        for r in ratings
    ]


@router.get("/teachers", response_model=list[TeacherRead])
def search_teachers(query: str = Query(..., min_length=1), session: Session = Depends(get_session)):
    statement = (
        select(User).where(User.role == UserRole.CREATOR).where(User.full_name.ilike(f"%{query}%"))
    )
    teachers = session.exec(statement).all()
    return [TeacherRead(id=t.id, full_name=t.full_name) for t in teachers]


@router.post("/stripe-onboarding-link", response_model=OnboardingResponse)
def create_stripe_onboarding_link(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    if current_user.role != UserRole.CREATOR:
        raise HTTPException(
            status_code=403, detail="Only teachers can create Stripe onboarding links."
        )

    try:
        if not current_user.stripe_account_id:
            account = stripe.Account.create(type="express", email=current_user.email)
            current_user.stripe_account_id = account.id
            session.add(current_user)
            session.commit()
            session.refresh(current_user)

        account_link = stripe.AccountLink.create(
            account=current_user.stripe_account_id,
            refresh_url=f"{FRONTEND_URL}/settings?stripe_reauth=true",
            return_url=f"{FRONTEND_URL}/teacher/dashboard?stripe_return=true",
            type="account_onboarding",
        )

        return {"onboarding_url": account_link.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
