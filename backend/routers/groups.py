import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import LanguageGroup, Project, ProjectStatus, User, UserLanguageGroup

router = APIRouter(prefix="/language-groups", tags=["language-groups"])
logger = logging.getLogger(__name__)


class LanguageGroupRead(BaseModel):
    id: int
    language_name: str


@router.get("/", response_model=list[LanguageGroupRead])
def list_language_groups(session: Session = Depends(get_session)):
    # First, let's check if any LanguageGroups exist at all
    all_groups_statement = select(LanguageGroup.id, LanguageGroup.language_name)
    all_groups_results = session.exec(all_groups_statement).all()
    logger.info(f"All LanguageGroups found: {all_groups_results}")

    # Now, the original query to find groups with active projects
    statement = (
        select(LanguageGroup.id, LanguageGroup.language_name)
        .join(Project, LanguageGroup.language_name == Project.language)
        .where(
            Project.status.in_(
                [ProjectStatus.FUNDING, ProjectStatus.SUCCESSFUL, ProjectStatus.COMPLETED]
            )
        )
        .group_by(LanguageGroup.id, LanguageGroup.language_name)
        .order_by(LanguageGroup.language_name)
    )
    results = session.exec(statement).all()
    logger.info(f"Found language groups with active projects: {results}")
    return [LanguageGroupRead(id=id, language_name=language_name) for id, language_name in results]


@router.post("/{group_id}/join", status_code=status.HTTP_204_NO_CONTENT)
def join_language_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    group = session.get(LanguageGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Language group not found")

    user_group_link = session.get(UserLanguageGroup, (current_user.id, group_id))
    if user_group_link:
        return

    new_link = UserLanguageGroup(user_id=current_user.id, group_id=group_id)
    session.add(new_link)
    session.commit()


@router.delete("/{group_id}/join", status_code=status.HTTP_204_NO_CONTENT)
def leave_language_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user_group_link = session.get(UserLanguageGroup, (current_user.id, group_id))
    if not user_group_link:
        return

    session.delete(user_group_link)
    session.commit()


@router.get("/me", response_model=list[LanguageGroupRead])
def get_my_language_groups(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    user = session.get(User, current_user.id, options=[selectinload(User.language_groups)])
    return [
        LanguageGroupRead(id=group.id, language_name=group.language_name)
        for group in user.language_groups
    ]
