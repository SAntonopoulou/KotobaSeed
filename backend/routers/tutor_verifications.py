"""Tutor verification records — multi-kind credentials shown as badges on
the tutor's public site and the marketplace listing.

Supersedes the older `routers/verifications.py` (which was tied to
User.id and only knew about language proficiency). The new table is tied
to Tutor.id and supports three kinds:

- LANGUAGE_PROFICIENCY — DELE C2, JLPT N1, native speaker certificates
- TEACHING_CREDENTIAL — CELTA, DELTA, university degree in education
- IDENTITY — auto-granted when Stripe Connect KYC completes

Evidence is stored as a URL (Google Drive / Dropbox / a personal page). A
proper file-upload pipeline can come later; the URL field stays so older
records keep working when it does.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentAdmin, CurrentUser
from ..models import (
    Notification,
    Tutor,
    TutorVerification,
    TutorVerificationKind,
    User,
    UserRole,
    VerificationStatus,
)
from ..tenancy import CurrentTutor

router = APIRouter(tags=["tutor-verifications"])


# --- schemas -----------------------------------------------------------


class VerificationRead(BaseModel):
    id: int
    tutor_id: int
    kind: TutorVerificationKind
    description: str
    language: str | None
    evidence_file_path: str | None
    status: VerificationStatus
    review_notes: str | None
    created_at: datetime
    reviewed_at: datetime | None


class VerificationCreate(BaseModel):
    kind: TutorVerificationKind
    description: str = Field(min_length=1, max_length=300)
    language: str | None = Field(default=None, max_length=40)
    evidence_file_path: str | None = Field(default=None, max_length=512)


class VerificationReviewAction(BaseModel):
    notes: str | None = Field(default=None, max_length=1000)


# --- helpers -----------------------------------------------------------


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _serialize(row: TutorVerification) -> VerificationRead:
    return VerificationRead(
        id=row.id,
        tutor_id=row.tutor_id,
        kind=row.kind,
        description=row.description,
        language=row.language,
        evidence_file_path=row.evidence_file_path,
        status=row.status,
        review_notes=row.review_notes,
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
    )


# --- owner endpoints (tenant-scoped) ----------------------------------


@router.get("/tutor/verifications", response_model=list[VerificationRead])
def list_my_verifications(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[VerificationRead]:
    """Tutor reads their own verification records (any status). Pro+ only —
    Free tutors don't get badges (consistent with the rest of the gating)."""
    _require_owner(tutor, current)
    if not current.is_pro_subscriber:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Verified credentials are a Pro feature.",
        )
    rows = session.exec(
        select(TutorVerification)
        .where(TutorVerification.tutor_id == tutor.id)
        .order_by(TutorVerification.created_at.desc())
    ).all()
    return [_serialize(r) for r in rows]


@router.post(
    "/tutor/verifications",
    response_model=VerificationRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_verification(
    payload: VerificationCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> VerificationRead:
    """Tutor submits a new credential for admin review."""
    _require_owner(tutor, current)
    if not current.is_pro_subscriber:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Verified credentials are a Pro feature.",
        )
    if payload.kind == TutorVerificationKind.IDENTITY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Identity verification is auto-granted by Stripe Connect — "
                "you can't submit it manually."
            ),
        )
    if payload.kind == TutorVerificationKind.LANGUAGE_PROFICIENCY and not (
        payload.language and payload.language.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Language is required for language-proficiency credentials.",
        )

    # Block duplicates: PENDING or APPROVED of the same (kind, language).
    existing = session.exec(
        select(TutorVerification).where(
            TutorVerification.tutor_id == tutor.id,
            TutorVerification.kind == payload.kind,
            TutorVerification.language == payload.language,
            TutorVerification.status.in_(
                [VerificationStatus.PENDING, VerificationStatus.APPROVED]
            ),
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"You already have a {existing.status.value} "
                f"{payload.kind.value.replace('_', ' ')} credential."
            ),
        )

    row = TutorVerification(
        tutor_id=tutor.id,
        kind=payload.kind,
        description=payload.description.strip(),
        language=payload.language.strip() if payload.language else None,
        evidence_file_path=payload.evidence_file_path,
        status=VerificationStatus.PENDING,
    )
    session.add(row)

    # Page the admins.
    admins = session.exec(
        select(User).where(User.role.in_([UserRole.ADMIN, UserRole.MANAGER]))
    ).all()
    for admin in admins:
        session.add(
            Notification(
                user_id=admin.id,
                message=(
                    f"New credential to review for {tutor.display_name}: "
                    f"{payload.kind.value.replace('_', ' ')}"
                ),
                link="/admin/verifications",
            )
        )

    session.commit()
    session.refresh(row)
    return _serialize(row)


@router.delete(
    "/tutor/verifications/{verification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def withdraw_verification(
    verification_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Tutor withdraws a verification (any status). Hard-delete because
    they're cheap to re-submit and we don't want to clutter the queue.
    """
    _require_owner(tutor, current)
    row = session.get(TutorVerification, verification_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found."
        )
    session.delete(row)
    session.commit()


# --- public read (used by tutor site + marketplace) -------------------


@router.get("/tutor/verifications/public", response_model=list[VerificationRead])
def list_public_verifications(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[VerificationRead]:
    """Public — approved credentials only. Powers the verified-badge
    cluster on the tutor's site + marketplace card.
    """
    rows = session.exec(
        select(TutorVerification)
        .where(
            TutorVerification.tutor_id == tutor.id,
            TutorVerification.status == VerificationStatus.APPROVED,
        )
        .order_by(TutorVerification.reviewed_at.desc())
    ).all()
    return [_serialize(r) for r in rows]


# --- admin review (apex-scoped) ---------------------------------------


admin_router = APIRouter(
    prefix="/admin/tutor-verifications", tags=["admin", "tutor-verifications"]
)


@admin_router.get("", response_model=list[VerificationRead])
def admin_list_verifications(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
    status_filter: VerificationStatus | None = None,
) -> list[VerificationRead]:
    """All verifications across all tutors. Filter by status for the queue."""
    stmt = select(TutorVerification).order_by(TutorVerification.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(TutorVerification.status == status_filter)
    rows = session.exec(stmt).all()
    return [_serialize(r) for r in rows]


@admin_router.post(
    "/{verification_id}/approve", response_model=VerificationRead
)
def admin_approve_verification(
    verification_id: int,
    payload: VerificationReviewAction,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> VerificationRead:
    row = session.get(TutorVerification, verification_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found."
        )
    if row.status != VerificationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Already {row.status.value}.",
        )
    row.status = VerificationStatus.APPROVED
    row.reviewed_at = datetime.now(UTC)
    row.reviewed_by_user_id = current.id
    row.review_notes = payload.notes
    row.updated_at = datetime.now(UTC)
    session.add(row)

    tutor = session.get(Tutor, row.tutor_id)
    if tutor is not None:
        session.add(
            Notification(
                user_id=tutor.user_id,
                message=f"Your {row.kind.value.replace('_', ' ')} credential was approved.",
                link="/dashboard#site",
            )
        )
    session.commit()
    session.refresh(row)
    return _serialize(row)


@admin_router.post(
    "/{verification_id}/reject", response_model=VerificationRead
)
def admin_reject_verification(
    verification_id: int,
    payload: VerificationReviewAction,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> VerificationRead:
    row = session.get(TutorVerification, verification_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found."
        )
    if row.status != VerificationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Already {row.status.value}.",
        )
    row.status = VerificationStatus.REJECTED
    row.reviewed_at = datetime.now(UTC)
    row.reviewed_by_user_id = current.id
    row.review_notes = payload.notes
    row.updated_at = datetime.now(UTC)
    session.add(row)

    tutor = session.get(Tutor, row.tutor_id)
    if tutor is not None:
        message = "Your credential needs more documentation."
        if payload.notes:
            message = f"{message} Note from admin: {payload.notes[:120]}"
        session.add(
            Notification(
                user_id=tutor.user_id,
                message=message,
                link="/dashboard#site",
            )
        )
    session.commit()
    session.refresh(row)
    return _serialize(row)


router.include_router(admin_router)
