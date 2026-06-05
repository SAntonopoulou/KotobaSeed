from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user, require_role
from ..models import Notification, TeacherVerification, User, UserRole, VerificationStatus
from ..services.gamification import award_achievement

router = APIRouter(prefix="/verifications", tags=["verifications"])


class VerificationCreate(BaseModel):
    language: str
    document_url: str


@router.get("/", response_model=list[TeacherVerification])
def get_my_verifications(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    """
    Retrieves all verification requests for the current teacher.
    """
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view their verification requests.",
        )

    verifications = session.exec(
        select(TeacherVerification)
        .where(TeacherVerification.teacher_id == current_user.id)
        .order_by(TeacherVerification.created_at.desc())
    ).all()
    return verifications


@router.post("/", response_model=TeacherVerification, status_code=status.HTTP_201_CREATED)
def submit_verification(
    verification_in: VerificationCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Allows a teacher to submit a new language verification request.
    Requires a Pro subscription.
    """
    if not current_user.is_pro_subscriber:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a Pro subscriber to submit verification requests.",
        )

    # Check if a verification for this language already exists and is pending or approved
    existing_verification = session.exec(
        select(TeacherVerification)
        .where(TeacherVerification.teacher_id == current_user.id)
        .where(TeacherVerification.language == verification_in.language)
        .where(
            TeacherVerification.status.in_(
                [VerificationStatus.PENDING, VerificationStatus.APPROVED]
            )
        )
    ).first()

    if existing_verification:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A verification for {verification_in.language} is already {existing_verification.status.value}.",
        )

    verification = TeacherVerification(**verification_in.model_dump(), teacher_id=current_user.id)
    session.add(verification)

    # Notify all admins of the new verification request
    admins = session.exec(select(User).where(User.role == UserRole.ADMIN)).all()
    for admin in admins:
        notification = Notification(
            user_id=admin.id,
            message=f"New verification request from {current_user.full_name} for {verification.language}.",
            link="/admin/dashboard",
        )
        session.add(notification)

    session.commit()
    session.refresh(verification)
    return verification


@router.post("/{verification_id}/approve", response_model=TeacherVerification)
def approve_verification(
    verification_id: int,
    admin_user: User = Depends(require_role(UserRole.ADMIN)),
    session: Session = Depends(get_session),
):
    """
    Approves a teacher's verification request. (Admin only)
    """
    verification = session.get(TeacherVerification, verification_id)
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found.")

    if verification.status == VerificationStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Verification is already approved.")

    verification.status = VerificationStatus.APPROVED

    # Award achievement to the teacher
    teacher = session.get(User, verification.teacher_id)
    if teacher:
        award_achievement(user=teacher, achievement_key="certified_pro", session=session)

    session.add(verification)
    session.commit()
    session.refresh(verification)

    return verification
