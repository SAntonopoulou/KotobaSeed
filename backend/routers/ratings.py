from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import Notification, Pledge, PledgeStatus, Project, ProjectRating, ProjectStatus, User

router = APIRouter(prefix="/ratings", tags=["ratings"])


class RatingCreate(BaseModel):
    rating: int
    comment: str | None = None


class RatingResponse(BaseModel):
    response: str


class RatingRead(BaseModel):
    id: int
    rating: int
    comment: str | None
    created_at: datetime
    user_id: int
    user_name: str
    teacher_response: str | None = None
    response_created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


@router.post("/project/{project_id}", response_model=ProjectRating)
def rate_project(
    project_id: int,
    rating_in: RatingCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not (1 <= rating_in.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.status != ProjectStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Only completed projects can be rated.")

    pledge = session.exec(
        select(Pledge).where(
            Pledge.project_id == project_id,
            Pledge.user_id == current_user.id,
            Pledge.status == PledgeStatus.CAPTURED,
        )
    ).first()
    if not pledge:
        raise HTTPException(status_code=403, detail="You must be a backer to rate this project.")

    existing_rating = session.exec(
        select(ProjectRating).where(
            ProjectRating.project_id == project_id, ProjectRating.user_id == current_user.id
        )
    ).first()
    if existing_rating:
        raise HTTPException(status_code=400, detail="You have already rated this project.")

    rating = ProjectRating(**rating_in.model_dump(), project_id=project_id, user_id=current_user.id)
    session.add(rating)

    # Notify the teacher
    notification = Notification(
        user_id=project.teacher_id,
        message=f"You received a new {rating.rating}-star review for your project '{project.title}'.",
        link=f"/projects/{project.id}",
    )
    session.add(notification)

    session.commit()
    session.refresh(rating)
    return rating


@router.post("/{rating_id}/respond", response_model=ProjectRating)
def respond_to_rating(
    rating_id: int,
    response_in: RatingResponse,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rating = session.exec(
        select(ProjectRating)
        .options(selectinload(ProjectRating.project))
        .where(ProjectRating.id == rating_id)
    ).first()

    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")

    if rating.project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="You are not authorized to respond to this rating."
        )

    if rating.teacher_response:
        raise HTTPException(status_code=400, detail="You have already responded to this rating.")

    rating.teacher_response = response_in.response
    rating.response_created_at = datetime.now(UTC)
    session.add(rating)
    session.commit()
    session.refresh(rating)
    return rating


@router.get("/project/{project_id}", response_model=list[RatingRead])
def list_project_ratings(project_id: int, session: Session = Depends(get_session)):
    statement = (
        select(ProjectRating)
        .where(ProjectRating.project_id == project_id)
        .options(selectinload(ProjectRating.user))
        .order_by(ProjectRating.created_at.desc())
    )
    ratings = session.exec(statement).all()

    return [
        RatingRead(
            id=r.id,
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
            user_id=r.user_id,
            user_name=r.user.full_name if r.user else "Anonymous",
            teacher_response=r.teacher_response,
            response_created_at=r.response_created_at,
        )
        for r in ratings
    ]
