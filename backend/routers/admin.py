from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_admin
from ..models import (
    Notification,
    Pledge,
    PledgeStatus,
    Project,
    ProjectStatus,
    TeacherVerification,
    User,
    UserRole,
    VerificationStatus,
)
from ..routers.projects import _cancel_project_logic, _create_project_read  # Corrected import
from ..schemas import ProjectRead  # Corrected import

router = APIRouter(prefix="/admin", tags=["admin"])


class VerificationReject(BaseModel):
    admin_notes: str | None = None


class VerificationRead(BaseModel):
    id: int
    language: str
    document_url: str
    status: VerificationStatus
    admin_notes: str | None
    created_at: datetime
    reviewed_at: datetime | None
    teacher_id: int
    teacher_name: str


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_admin), session: Session = Depends(get_session)
):
    user_count = session.exec(select(func.count(User.id))).one()
    project_count = session.exec(select(func.count(Project.id))).one()
    pledge_count = session.exec(select(func.count(Pledge.id))).one()

    total_funds_cents = (
        session.exec(
            select(func.sum(Pledge.amount)).where(Pledge.status == PledgeStatus.CAPTURED)
        ).one()
        or 0
    )

    return {
        "user_count": user_count,
        "project_count": project_count,
        "pledge_count": pledge_count,
        "total_funds_raised": total_funds_cents,
    }


@router.get("/users", response_model=list[User])
def list_users(
    current_user: User = Depends(get_current_admin), session: Session = Depends(get_session)
):
    users = session.exec(select(User)).all()
    return users


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    user_to_delete = session.get(User, user_id)
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
    if user_to_delete.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    deleted_user = session.exec(select(User).where(User.email == "deleted@system")).first()
    if not deleted_user:
        deleted_user = User(
            email="deleted@system",
            hashed_password="deleted",
            full_name="Deleted User",
            role=UserRole.STUDENT,
        )
        session.add(deleted_user)
        session.commit()
        session.refresh(deleted_user)

    for project in user_to_delete.taught_projects:
        project.teacher_id = deleted_user.id
    for pledge in user_to_delete.pledges:
        pledge.user_id = deleted_user.id
    for request in user_to_delete.requests:
        request.user_id = deleted_user.id

    session.delete(user_to_delete)
    session.commit()
    return


@router.get("/projects", response_model=list[ProjectRead])
def list_all_projects(
    current_user: User = Depends(get_current_admin), session: Session = Depends(get_session)
):
    projects = session.exec(
        select(Project)
        .where(Project.status != ProjectStatus.CANCELLED)  # Exclude cancelled projects
        .options(selectinload(Project.teacher))
    ).all()
    return [_create_project_read(p, current_user, session) for p in projects]


@router.post("/projects/cleanup-abandoned")
def cleanup_abandoned_projects(
    current_user: User = Depends(get_current_admin), session: Session = Depends(get_session)
):
    abandoned_projects = session.exec(
        select(Project)
        .join(User, Project.teacher_id == User.id)
        .where(User.deleted_at != None)
        .where(Project.status.not_in([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED]))
        .options(selectinload(Project.pledges))
    ).all()

    count = 0
    for project in abandoned_projects:
        _cancel_project_logic(project, session)
        count += 1

    session.commit()

    return {"message": f"Successfully cancelled and refunded {count} abandoned projects."}


@router.delete("/projects/{project_id}")
def admin_cancel_project(
    project_id: int,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    project = session.exec(
        select(Project).where(Project.id == project_id).options(selectinload(Project.pledges))
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status in [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED]:
        raise HTTPException(
            status_code=400,
            detail=f"Project is already {project.status.value} and cannot be cancelled.",
        )

    _cancel_project_logic(project, session)
    session.commit()
    session.refresh(project)
    return project


@router.get("/verifications", response_model=list[VerificationRead])
def list_verifications(
    current_user: User = Depends(get_current_admin), session: Session = Depends(get_session)
):
    statement = select(TeacherVerification).options(selectinload(TeacherVerification.teacher))
    verifications = session.exec(statement).all()
    return [
        VerificationRead(
            id=v.id,
            language=v.language,
            document_url=v.document_url,
            status=v.status,
            admin_notes=v.admin_notes,
            created_at=v.created_at,
            reviewed_at=v.reviewed_at,
            teacher_id=v.teacher_id,
            teacher_name=v.teacher.full_name,
        )
        for v in verifications
    ]


@router.post("/verifications/{verification_id}/approve", response_model=TeacherVerification)
def approve_verification(
    verification_id: int,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    verification = session.get(TeacherVerification, verification_id)
    if not verification:
        raise HTTPException(status_code=404, detail="Verification request not found")

    verification.status = VerificationStatus.APPROVED
    verification.reviewed_at = datetime.now(UTC)

    notification = Notification(
        user_id=verification.teacher_id,
        message=f"Your verification for {verification.language} has been approved!",
        link="/settings",
    )
    session.add(notification)
    session.add(verification)
    session.commit()
    session.refresh(verification)
    return verification


@router.post("/verifications/{verification_id}/reject", response_model=TeacherVerification)
def reject_verification(
    verification_id: int,
    rejection: VerificationReject,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    verification = session.get(TeacherVerification, verification_id)
    if not verification:
        raise HTTPException(status_code=404, detail="Verification request not found")

    verification.status = VerificationStatus.REJECTED
    verification.admin_notes = rejection.admin_notes
    verification.reviewed_at = datetime.now(UTC)

    rejection_note = (
        f"Reason: {rejection.admin_notes}" if rejection.admin_notes else "No reason provided."
    )
    notification = Notification(
        user_id=verification.teacher_id,
        message=f"Your verification for {verification.language} was rejected. {rejection_note}",
        link="/settings",
    )
    session.add(notification)
    session.add(verification)
    session.commit()
    session.refresh(verification)
    return verification
