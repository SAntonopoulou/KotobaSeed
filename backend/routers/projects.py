import logging
import os
from collections import defaultdict
from datetime import UTC, datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_user, get_current_user_optional
from ..models import (
    LanguageGroup,
    Notification,
    Pledge,
    PledgeStatus,
    Project,
    ProjectRating,
    ProjectStatus,
    ProjectUpdate,
    Request,
    RequestBlacklist,
    RequestStatus,
    TeacherFollower,
    TeacherVerification,
    User,
    UserRole,
    VerificationStatus,
)
from ..schemas import (
    BackerRead,
    FilterOptionsRead,
    LanguageLevelsRead,
    MyRatingRead,
    PaginatedProjectRead,
    ProjectCreate,
    ProjectRead,
    ProjectUpdateModel,
    UpdateCreate,
    UpdateRead,
)

logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
PLATFORM_FEE_PERCENT = float(os.getenv("PLATFORM_FEE_PERCENT", "0.15"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

router = APIRouter(prefix="/projects", tags=["projects"])


class TipRequest(BaseModel):
    amount: int


# Helper function to create ProjectRead from Project model
def _create_project_read(
    project: Project, current_user: User | None, session: Session
) -> ProjectRead:
    is_backed_by_user = False
    is_following_teacher = False
    my_rating = None
    if current_user:
        pledge = session.exec(
            select(Pledge)
            .where(Pledge.project_id == project.id)
            .where(Pledge.user_id == current_user.id)
            .where(Pledge.status == PledgeStatus.CAPTURED)
        ).first()
        if pledge:
            is_backed_by_user = True

        if project.teacher_id:
            follow = session.get(TeacherFollower, (project.teacher_id, current_user.id))
            if follow:
                is_following_teacher = True

        if project.status == ProjectStatus.COMPLETED:
            user_rating = session.exec(
                select(ProjectRating)
                .where(ProjectRating.project_id == project.id)
                .where(ProjectRating.user_id == current_user.id)
            ).first()
            if user_rating:
                my_rating = MyRatingRead(rating=user_rating.rating, comment=user_rating.comment)

    is_owner = current_user and project.teacher_id == current_user.id

    teacher_name = project.teacher.full_name if project.teacher else "Unknown"
    teacher_avatar_url = project.teacher.avatar_url if project.teacher else None
    teacher_stripe_account_id = project.teacher.stripe_account_id if project.teacher else None

    # Fetch average rating and total ratings
    avg_rating_result = session.exec(
        select(func.avg(ProjectRating.rating), func.count(ProjectRating.id)).where(
            ProjectRating.project_id == project.id
        )
    ).first()
    average_rating = avg_rating_result[0] if avg_rating_result and avg_rating_result[0] else None
    total_ratings = avg_rating_result[1] if avg_rating_result and avg_rating_result[1] else 0

    # Check teacher verification status and get verified languages
    is_teacher_verified = False
    teacher_verified_languages = []
    if project.teacher_id:
        verifications = session.exec(
            select(TeacherVerification)
            .where(TeacherVerification.teacher_id == project.teacher_id)
            .where(TeacherVerification.status == VerificationStatus.APPROVED)
        ).all()
        if verifications:
            is_teacher_verified = True
            teacher_verified_languages = [v.language for v in verifications]

    origin_request_title = None
    origin_request_student_name = None
    if project.origin_request_id and project.request:
        origin_request_title = project.request.title
        if project.request.user:
            origin_request_student_name = project.request.user.full_name

    return ProjectRead(
        id=project.id,
        title=project.title,
        description=project.description,
        language=project.language,
        level=project.level,
        tags=project.tags,
        funding_goal=project.funding_goal,
        current_funding=project.current_funding,
        total_tipped_amount=project.total_tipped_amount,
        deadline=project.deadline,
        delivery_days=project.delivery_days,
        status=project.status,
        is_private=project.is_private,
        created_at=project.created_at,
        updated_at=project.updated_at,
        funded_at=project.funded_at,
        completed_at=project.completed_at,
        teacher_id=project.teacher_id,
        teacher_name=teacher_name,
        teacher_avatar_url=teacher_avatar_url,
        teacher_stripe_account_id=teacher_stripe_account_id,
        teacher_verified_languages=teacher_verified_languages,
        origin_request_id=project.origin_request_id,
        origin_request_title=origin_request_title,
        origin_request_student_name=origin_request_student_name,
        videos=[video.url for video in project.videos],
        is_backed_by_user=is_backed_by_user,
        is_owner=is_owner,
        is_teacher_verified=is_teacher_verified,
        is_following_teacher=is_following_teacher,
        average_rating=average_rating,
        total_ratings=total_ratings,
        my_rating=my_rating,
        is_series=project.is_series,
        num_videos=project.num_videos,
        price_per_video=project.price_per_video,
        project_image_url=project.project_image_url,
        series_intro_video_url=project.series_intro_video_url,
    )


def _cancel_project_logic(project: Project, session: Session):
    """
    Helper function to encapsulate the logic for cancelling a project.
    This function does NOT commit the session.
    """
    for pledge in project.pledges:
        if pledge.status == PledgeStatus.CAPTURED:
            try:
                stripe.Refund.create(payment_intent=pledge.payment_intent_id)
                pledge.status = PledgeStatus.REFUNDED
                session.add(pledge)
                notification = Notification(
                    user_id=pledge.user_id,
                    message=f"Project '{project.title}' was cancelled and you have been refunded.",
                    link="/",
                )
                session.add(notification)
            except stripe.error.StripeError as e:
                logger.error(f"Failed to refund pledge {pledge.id}: {e}")

    project.status = ProjectStatus.CANCELLED
    session.add(project)

    if project.origin_request_id:
        request = session.get(Request, project.origin_request_id)
        if request:
            request.status = RequestStatus.OPEN
            request.target_teacher_id = None
            request.is_private = False
            session.add(request)
            notification = Notification(
                user_id=request.user_id,
                message=f"Project '{project.title}' was cancelled. Your request has been reopened.",
                link="/requests",
            )
            session.add(notification)

            # Blacklist the teacher who cancelled the project from this request
            if project.teacher_id:
                blacklist_entry = RequestBlacklist(
                    request_id=request.id, teacher_id=project.teacher_id
                )
                session.add(blacklist_entry)


@router.get("/filter-options", response_model=FilterOptionsRead)
def get_filter_options(session: Session = Depends(get_session)):
    query = (
        select(Project.language, Project.level)
        .where(Project.status == ProjectStatus.COMPLETED)
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


@router.get("/archive", response_model=PaginatedProjectRead)
def list_archive_projects(
    language: str | None = None,
    level: str | None = None,
    search: str | None = None,
    limit: int = 9,
    offset: int = 0,
    current_user: User | None = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    base_query = (
        select(Project)
        .join(User, Project.teacher_id == User.id)
        .where(Project.status == ProjectStatus.COMPLETED)
        .where(Project.is_private == False)
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
                Project.language.ilike(search_term),
                Project.level.ilike(search_term),
                User.full_name.ilike(search_term),
            )
        )

    count_statement = select(func.count()).select_from(base_query.subquery())
    total_count = session.exec(count_statement).one()

    projects_statement = (
        base_query.options(
            selectinload(Project.teacher),
            selectinload(Project.request).selectinload(Request.user),
            selectinload(Project.videos),
        )
        .offset(offset)
        .limit(limit)
    )
    projects = session.exec(projects_statement).all()

    return PaginatedProjectRead(
        projects=[_create_project_read(p, current_user, session) for p in projects],
        total_count=total_count,
    )


@router.post("/", response_model=Project)
def create_project(
    project_in: ProjectCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role != UserRole.TUTOR and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only teachers can create projects"
        )

    funding_goal = project_in.funding_goal
    if (
        project_in.is_series
        and project_in.price_per_video
        and project_in.num_videos
        and project_in.num_videos > 0
    ):
        funding_goal = project_in.price_per_video * project_in.num_videos
    elif project_in.is_series and (
        project_in.price_per_video is None
        or project_in.num_videos is None
        or project_in.num_videos <= 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="For series projects, price_per_video and num_videos must be provided and num_videos must be greater than 0.",
        )
    elif not project_in.is_series and (
        project_in.price_per_video is not None or project_in.num_videos is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="price_per_video and num_videos should not be provided for non-series projects.",
        )

    project = Project(
        **project_in.model_dump(exclude={"funding_goal"}),
        funding_goal=funding_goal,
        teacher_id=current_user.id,
        status=ProjectStatus.FUNDING,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    # Check if LanguageGroup exists, create if not
    language_group = session.exec(
        select(LanguageGroup).where(LanguageGroup.language_name == project.language)
    ).first()
    if not language_group:
        language_group = LanguageGroup(language_name=project.language)
        session.add(language_group)
        session.commit()  # Commit to get the ID for the new group
        session.refresh(language_group)
        logger.info(f"Created new LanguageGroup for: {language_group.language_name}")

    # Notify followers
    teacher = session.get(User, project.teacher_id, options=[selectinload(User.followers)])
    for follower in teacher.followers:
        notification = Notification(
            user_id=follower.id,
            message=f"Teacher {teacher.full_name} has created a new project: '{project.title}'",
            link=f"/projects/{project.id}",
        )
        session.add(notification)

    # Notify language group members
    # Re-fetch language_group with members loaded after potential creation
    language_group = session.exec(
        select(LanguageGroup)
        .where(LanguageGroup.language_name == project.language)
        .options(selectinload(LanguageGroup.members))
    ).first()
    if language_group:
        for member in language_group.members:
            if member.id != teacher.id:  # Don't notify the teacher about their own project
                notification = Notification(
                    user_id=member.id,
                    message=f"A new project in {project.language} has been posted: '{project.title}'",
                    link=f"/projects/{project.id}",
                )
                session.add(notification)

    session.commit()

    return project


@router.get("/", response_model=PaginatedProjectRead)
def list_projects(
    language: str | None = None,
    level: str | None = None,
    search: str | None = None,
    limit: int = 9,
    offset: int = 0,
    current_user: User | None = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    base_query = (
        select(Project)
        .join(User, Project.teacher_id == User.id)
        .where(
            (Project.status == ProjectStatus.FUNDING) | (Project.status == ProjectStatus.SUCCESSFUL)
        )
        .where(Project.is_private == False)
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
                Project.language.ilike(search_term),
                Project.level.ilike(search_term),
                User.full_name.ilike(search_term),
            )
        )

    count_statement = select(func.count()).select_from(base_query.subquery())
    total_count = session.exec(count_statement).one()

    projects_statement = (
        base_query.options(
            selectinload(Project.teacher),
            selectinload(Project.request).selectinload(Request.user),
            selectinload(Project.videos),
        )
        .offset(offset)
        .limit(limit)
    )
    projects = session.exec(projects_statement).all()

    return PaginatedProjectRead(
        projects=[_create_project_read(p, current_user, session) for p in projects],
        total_count=total_count,
    )


@router.get("/me", response_model=list[ProjectRead])
def list_my_projects(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    if current_user.role != UserRole.TUTOR and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only teachers can list their projects"
        )

    query = (
        select(Project)
        .where(Project.teacher_id == current_user.id)
        .options(
            selectinload(Project.teacher),
            selectinload(Project.request).selectinload(Request.user),
            selectinload(Project.videos),
        )
    )
    projects = session.exec(query).all()
    return [_create_project_read(p, current_user, session) for p in projects]


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    current_user: User | None = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    project = session.exec(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.teacher),
            selectinload(Project.request).selectinload(Request.user),
            selectinload(Project.videos),
        )
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = current_user and project.teacher_id == current_user.id
    is_admin = current_user and current_user.role == UserRole.ADMIN

    if project.status in [ProjectStatus.DRAFT, ProjectStatus.ON_HOLD] and not (
        is_owner or is_admin
    ):
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status == ProjectStatus.CANCELLED and not is_admin:
        raise HTTPException(status_code=404, detail="Project not found")

    return _create_project_read(project, current_user, session)


@router.post("/{project_id}/tip")
def create_tip_checkout_session(
    project_id: int,
    tip_in: TipRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    project = session.exec(
        select(Project).where(Project.id == project_id).options(selectinload(Project.teacher))
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    teacher = project.teacher
    if not teacher or not teacher.stripe_account_id:
        raise HTTPException(
            status_code=400, detail="This teacher is not set up to receive payments."
        )

    if tip_in.amount < 100:  # Minimum tip amount of 1 EUR
        raise HTTPException(status_code=400, detail="Tip amount must be at least €1.00")

    application_fee = int(tip_in.amount * PLATFORM_FEE_PERCENT)

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {
                            "name": f"Tip for '{project.title}'",
                        },
                        "unit_amount": tip_in.amount,
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=f"{FRONTEND_URL}/projects/{project.id}?tip_success=true",
            cancel_url=f"{FRONTEND_URL}/projects/{project.id}",
            payment_intent_data={
                "application_fee_amount": application_fee,
                "transfer_data": {
                    "destination": teacher.stripe_account_id,
                },
            },
            metadata={
                "type": "tip",
                "project_id": project.id,
                "teacher_id": teacher.id,
                "user_id": current_user.id,
            },
        )
        return {"checkout_url": checkout_session.url}
    except stripe.error.StripeError:
        logger.exception("Stripe error starting tip checkout for project %s", project.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout. Try again in a moment.",
        ) from None
    except Exception:
        logger.exception("Unexpected error starting tip checkout for project %s", project.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Something went wrong starting checkout. Please try again.",
        ) from None


@router.get("/{project_id}/backers", response_model=list[BackerRead])
def get_project_backers(project_id: int, session: Session = Depends(get_session)):
    statement = (
        select(User)
        .join(Pledge)
        .where(Pledge.project_id == project_id, Pledge.status == PledgeStatus.CAPTURED)
    )
    users = session.exec(statement).all()
    return users


@router.get("/{project_id}/related", response_model=list[ProjectRead])
def get_related_projects(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = (
        select(Project)
        .where(
            Project.language == project.language,
            Project.id != project_id,
            (Project.status == ProjectStatus.FUNDING)
            | (Project.status == ProjectStatus.SUCCESSFUL),
            Project.is_private == False,
        )
        .options(
            selectinload(Project.teacher),
            selectinload(Project.request).selectinload(Request.user),
            selectinload(Project.videos),
        )
        .limit(3)
    )

    projects = session.exec(query).all()
    return [_create_project_read(p, current_user, session) for p in projects]


@router.patch("/{project_id}", response_model=Project)
def update_project(
    project_id: int,
    project_in: ProjectUpdateModel,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.teacher_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this project"
        )

    project_data = project_in.model_dump(exclude_unset=True)
    if (
        "funding_goal" in project_data
        and project_data["funding_goal"] != project.funding_goal
        and (project.status != ProjectStatus.DRAFT or project.origin_request_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change the price of an active project or one created from a request",
        )

    for key, value in project_data.items():
        setattr(project, key, value)

    project.updated_at = datetime.now(UTC)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.post("/{project_id}/complete", response_model=Project)
def complete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.exec(
        select(Project).where(Project.id == project_id).options(selectinload(Project.videos))
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can complete the project",
        )
    if project.status != ProjectStatus.SUCCESSFUL:
        raise HTTPException(
            status_code=400, detail="Project must be SUCCESSFUL to be marked for completion"
        )

    # Video count validation
    if project.is_series:
        if project.num_videos is None or len(project.videos) != project.num_videos:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"For a series project, exactly {project.num_videos} videos must be uploaded. Currently {len(project.videos)}.",
            )
    else:
        if len(project.videos) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="For a single video project, exactly 1 video must be uploaded.",
            )

    project.status = ProjectStatus.PENDING_CONFIRMATION
    session.add(project)

    backers = session.exec(
        select(User)
        .join(Pledge)
        .where(Pledge.project_id == project_id, Pledge.status == PledgeStatus.CAPTURED)
    ).all()
    for backer in backers:
        notification = Notification(
            user_id=backer.id,
            message=f"Project '{project.title}' is ready for your review. Please confirm its completion.",
            link=f"/projects/{project.id}",
        )
        session.add(notification)

    session.commit()
    session.refresh(project)
    return project


@router.post("/{project_id}/confirm-completion", response_model=Project)
def confirm_completion(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != ProjectStatus.PENDING_CONFIRMATION:
        raise HTTPException(status_code=400, detail="Project is not awaiting confirmation.")

    pledge = session.exec(
        select(Pledge).where(
            Pledge.project_id == project.id,
            Pledge.user_id == current_user.id,
            Pledge.status == PledgeStatus.CAPTURED,
        )
    ).first()
    if not pledge:
        raise HTTPException(status_code=403, detail="You are not a backer of this project.")

    if project.stripe_transfer_id:
        raise HTTPException(status_code=400, detail="This project has already been paid out.")

    teacher = session.get(User, project.teacher_id)
    if not teacher or not teacher.stripe_account_id:
        raise HTTPException(
            status_code=400, detail="Teacher has not connected a Stripe account for payouts."
        )

    amount_collected = project.current_funding
    platform_fee = int(amount_collected * PLATFORM_FEE_PERCENT)
    payout_amount = amount_collected - platform_fee

    if payout_amount > 0:
        try:
            transfer = stripe.Transfer.create(
                amount=payout_amount,
                currency="eur",
                destination=teacher.stripe_account_id,
                metadata={"project_id": str(project.id)},
            )
            project.stripe_transfer_id = transfer.id
        except stripe.error.StripeError:
            logger.exception("Stripe payout failed for project %s", project.id)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Couldn't release the payout. Try again or contact support.",
            ) from None

    project.status = ProjectStatus.COMPLETED
    session.add(project)

    notification = Notification(
        user_id=project.teacher_id,
        message=f"Your funds for project '{project.title}' have been released.",
        link="/teacher/dashboard",
    )
    session.add(notification)

    session.commit()
    session.refresh(project)
    return project


@router.post("/{project_id}/cancel", response_model=Project)
def cancel_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.exec(
        select(Project).where(Project.id == project_id).options(selectinload(Project.pledges))
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.teacher_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can cancel the project",
        )
    if project.status == ProjectStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot cancel a completed project")

    _cancel_project_logic(project, session)

    session.commit()
    session.refresh(project)
    return project


@router.post("/{project_id}/updates", response_model=UpdateRead)
def add_project_update(
    project_id: int,
    update_in: UpdateCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can post updates")

    update = ProjectUpdate(content=update_in.content, project_id=project_id)
    session.add(update)
    session.commit()
    session.refresh(update)
    return update


@router.patch("/updates/{update_id}", response_model=UpdateRead)
def edit_project_update(
    update_id: int,
    update_in: UpdateCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    db_update = session.get(ProjectUpdate, update_id, options=[selectinload(ProjectUpdate.project)])
    if not db_update:
        raise HTTPException(status_code=404, detail="Update not found")
    if db_update.project.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this update")

    db_update.content = update_in.content
    session.add(db_update)
    session.commit()
    session.refresh(db_update)
    return db_update


@router.get("/{project_id}/updates", response_model=list[UpdateRead])
def list_project_updates(project_id: int, session: Session = Depends(get_session)):
    statement = (
        select(ProjectUpdate)
        .where(ProjectUpdate.project_id == project_id)
        .order_by(ProjectUpdate.created_at.desc())
    )
    updates = session.exec(statement).all()
    return updates
