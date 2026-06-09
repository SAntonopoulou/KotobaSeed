from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import get_current_admin
from ..models import (
    AuditLog,
    ConversationReport,
    ConversationReportReason,
    ConversationReportStatus,
    Notification,
    PlatformSetting,
    Pledge,
    PledgeStatus,
    Project,
    ProjectStatus,
    TeacherVerification,
    User,
    UserRole,
    VerificationStatus,
)
from ..routers.projects import _cancel_project_logic, _create_project_read
from ..schemas import ProjectRead
from ..services.audit import record_audit

router = APIRouter(prefix="/admin", tags=["admin"])


class VerificationReject(BaseModel):
    admin_notes: str | None = None


class AuditLogRead(BaseModel):
    id: int
    actor_user_id: int | None
    actor_label: str
    action: str
    target_type: str | None
    target_id: int | None
    summary: str
    details_json: str | None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogRead]
    total: int


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
    user_count = session.exec(
        select(func.count(User.id)).where(User.deleted_at.is_(None))
    ).one()
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
    users = session.exec(
        select(User).where(User.deleted_at.is_(None))
    ).all()
    return users


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Soft-delete a user.

    Hard-delete is impossible without rewriting every FK constraint:
    `user.id` is referenced by ~40 tables (purchases, bookings,
    pledges, audit log, payment records, etc.) and several of those
    can't be reassigned to a sentinel without scrambling financial
    history. We scramble PII, mark `deleted_at`, bump
    `token_invalidation_at` (logs them out of every device), and leave
    the row in place. The tenancy + auth layers treat
    `deleted_at IS NOT NULL` as "doesn't exist".
    """
    user_to_delete = session.get(User, user_id)
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
    if user_to_delete.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    original_email = user_to_delete.email
    original_role = user_to_delete.role.value
    now = datetime.now(UTC)

    # Anonymise PII. We keep the rest of the row so financial
    # history (purchases, payouts, invoices) still references *something*.
    user_to_delete.email = f"deleted-{user_id}@deleted.local"
    user_to_delete.full_name = "(deleted user)"
    user_to_delete.bio = None
    user_to_delete.avatar_url = None
    user_to_delete.languages = None
    user_to_delete.intro_video_url = None
    user_to_delete.sample_video_url = None
    user_to_delete.hashed_password = "!"  # bcrypt never produces "!"
    user_to_delete.is_active = False
    user_to_delete.deleted_at = now
    user_to_delete.token_invalidation_at = now
    user_to_delete.newsletter_opt_in = False
    user_to_delete.updated_at = now

    session.add(user_to_delete)
    session.commit()

    record_audit(
        session,
        actor=current_user,
        action="user.deleted",
        target_type="user",
        target_id=user_id,
        summary=f"Admin soft-deleted user {original_email} (role={original_role}).",
    )
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
    cancelled_ids: list[int] = []
    for project in abandoned_projects:
        _cancel_project_logic(project, session)
        cancelled_ids.append(project.id)
        count += 1

    session.commit()
    record_audit(
        session,
        actor=current_user,
        action="projects.cleanup_abandoned",
        target_type="project",
        target_id=None,
        summary=f"Cancelled {count} abandoned project(s) from deleted teachers.",
        details={"project_ids": cancelled_ids},
    )

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

    project_title = project.title
    _cancel_project_logic(project, session)
    session.commit()
    session.refresh(project)
    record_audit(
        session,
        actor=current_user,
        action="project.cancelled",
        target_type="project",
        target_id=project_id,
        summary=f"Admin cancelled project: {project_title}.",
    )
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
    record_audit(
        session,
        actor=current_user,
        action="verification.approved",
        target_type="verification",
        target_id=verification_id,
        summary=f"Approved {verification.language} verification for teacher #{verification.teacher_id}.",
    )
    return verification


@router.get("/audit-log", response_model=AuditLogPage)
def list_audit_log(
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
    action: str | None = Query(default=None),
    target_type: str | None = Query(default=None),
    actor: str | None = Query(default=None, description="Filter by actor email or substring"),
    actor_user_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Most recent admin + system actions first. Filterable by action prefix
    (e.g. `verification.`, `support.`, `settings.`), target_type, or actor
    (by user id or label substring). Use the actor filter to audit a
    specific staff member's history.
    """
    filters = []
    if action:
        filters.append(AuditLog.action.like(f"{action}%"))
    if target_type:
        filters.append(AuditLog.target_type == target_type)
    if actor_user_id is not None:
        filters.append(AuditLog.actor_user_id == actor_user_id)
    if actor:
        filters.append(AuditLog.actor_label.like(f"%{actor}%"))

    total = session.exec(
        select(func.count(AuditLog.id)).where(*filters)
    ).one()
    rows = session.exec(
        select(AuditLog).where(*filters).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return AuditLogPage(
        items=[AuditLogRead.model_validate(r, from_attributes=True) for r in rows],
        total=total,
    )


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
    record_audit(
        session,
        actor=current_user,
        action="verification.rejected",
        target_type="verification",
        target_id=verification_id,
        summary=f"Rejected {verification.language} verification for teacher #{verification.teacher_id}.",
        details={"admin_notes": rejection.admin_notes} if rejection.admin_notes else None,
    )
    return verification


# ---- Platform settings ------------------------------------------------------


class PlatformSettingRead(BaseModel):
    key: str
    value: object | None  # decoded JSON
    updated_at: datetime
    updated_by_user_id: int | None


class PlatformSettingWrite(BaseModel):
    value: object | None


@router.get("/settings", response_model=list[PlatformSettingRead])
def list_platform_settings(
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> list[PlatformSettingRead]:
    """Admin-only — every stored setting + last-write metadata."""
    import json

    rows = session.exec(select(PlatformSetting).order_by(PlatformSetting.key)).all()
    out: list[PlatformSettingRead] = []
    for r in rows:
        try:
            decoded = json.loads(r.value_json) if r.value_json else None
        except (TypeError, ValueError):
            decoded = None
        out.append(
            PlatformSettingRead(
                key=r.key,
                value=decoded,
                updated_at=r.updated_at,
                updated_by_user_id=r.updated_by_user_id,
            )
        )
    return out


# ---- Staff management -------------------------------------------------------


class StaffUserRead(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: UserRole
    created_at: datetime
    is_active: bool


class StaffRoleUpdate(BaseModel):
    role: UserRole


@router.get("/staff", response_model=list[StaffUserRead])
def list_staff(
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> list[StaffUserRead]:
    """Admin-only — every staff user (support / manager / admin / legacy moderator)."""
    rows = session.exec(
        select(User)
        .where(
            User.deleted_at.is_(None),
            User.role.in_(
                [
                    UserRole.SUPPORT,
                    UserRole.MANAGER,
                    UserRole.ADMIN,
                    UserRole.MODERATOR,
                ]
            ),
        )
        .order_by(User.role, User.email)
    ).all()
    return [
        StaffUserRead(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            created_at=u.created_at,
            is_active=u.is_active,
        )
        for u in rows
    ]


@router.put("/users/{user_id}/role", response_model=StaffUserRead)
def set_user_role(
    user_id: int,
    payload: StaffRoleUpdate,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> StaffUserRead:
    """Admin-only — change any user's role.

    Cannot change your own role (otherwise you could lock yourself out).
    Every change is audit-logged with before/after.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't change your own role.",
        )
    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
        )
    if target.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change role on a deleted account.",
        )
    previous = target.role
    target.role = payload.role
    target.updated_at = datetime.now(UTC)
    session.add(target)
    session.commit()
    session.refresh(target)
    record_audit(
        session,
        actor=current_user,
        action="user.role_changed",
        target_type="user",
        target_id=target.id,
        summary=f"Changed role for {target.email} from {previous.value} to {target.role.value}.",
        details={"from": previous.value, "to": target.role.value},
    )
    return StaffUserRead(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=target.role,
        created_at=target.created_at,
        is_active=target.is_active,
    )


@router.get("/users/search", response_model=list[StaffUserRead])
def search_users_for_staff_promotion(
    q: str = Query(min_length=2, max_length=120),
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> list[StaffUserRead]:
    """Admin-only — search non-staff users by email/name so admin can
    promote them. Limits results so an empty query can't dump the whole
    user table.
    """
    pattern = f"%{q.lower()}%"
    rows = session.exec(
        select(User)
        .where(
            User.deleted_at.is_(None),
            (func.lower(User.email).like(pattern))
            | (func.lower(User.full_name).like(pattern)),
        )
        .limit(20)
    ).all()
    return [
        StaffUserRead(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            created_at=u.created_at,
            is_active=u.is_active,
        )
        for u in rows
    ]


@router.put("/settings/{key}", response_model=PlatformSettingRead)
def set_platform_setting(
    key: str,
    payload: PlatformSettingWrite,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> PlatformSettingRead:
    """Admin-only — upsert a setting. Audit-logged.

    The endpoint accepts any JSON-serialisable value. The frontend knows
    which keys it edits (social.*, platform.support_email, etc.); it's
    intentionally loose here so we don't need a code change every time we
    add a new setting key.
    """
    from ..services.platform_settings import set_setting

    set_setting(session, key, payload.value, updated_by_user_id=current_user.id)
    record_audit(
        session,
        actor=current_user,
        action="settings.updated",
        target_type="platform_setting",
        summary=f"Updated platform setting {key}.",
        details={"key": key, "value": payload.value},
    )
    return PlatformSettingRead(
        key=key,
        value=payload.value,
        updated_at=datetime.now(UTC),
        updated_by_user_id=current_user.id,
    )



class ConversationReportAdminRead(BaseModel):
    id: int
    conversation_id: int
    message_id: int | None
    reporter_user_id: int
    reporter_name: str | None
    reported_user_id: int
    reported_name: str | None
    reason: ConversationReportReason
    note: str | None
    status: ConversationReportStatus
    resolution_note: str | None
    resolved_at: datetime | None
    created_at: datetime


class ReportResolution(BaseModel):
    status: ConversationReportStatus
    resolution_note: str | None = None


def _serialize_report(report: ConversationReport, session: Session) -> ConversationReportAdminRead:
    reporter = session.get(User, report.reporter_user_id)
    reported = session.get(User, report.reported_user_id)
    return ConversationReportAdminRead(
        id=report.id,
        conversation_id=report.conversation_id,
        message_id=report.message_id,
        reporter_user_id=report.reporter_user_id,
        reporter_name=reporter.full_name if reporter else None,
        reported_user_id=report.reported_user_id,
        reported_name=reported.full_name if reported else None,
        reason=report.reason,
        note=report.note,
        status=report.status,
        resolution_note=report.resolution_note,
        resolved_at=report.resolved_at,
        created_at=report.created_at,
    )


@router.get("/reports", response_model=list[ConversationReportAdminRead])
def list_conversation_reports(
    status_filter: ConversationReportStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Admin queue for chat moderation. Defaults to OPEN-only."""
    stmt = select(ConversationReport).order_by(ConversationReport.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(ConversationReport.status == status_filter)
    else:
        stmt = stmt.where(ConversationReport.status == ConversationReportStatus.OPEN)
    reports = session.exec(stmt).all()
    return [_serialize_report(r, session) for r in reports]


@router.post("/reports/{report_id}", response_model=ConversationReportAdminRead)
def resolve_conversation_report(
    report_id: int,
    payload: ReportResolution,
    current_user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Mark a report resolved or dismissed. Audit-logged."""
    report = session.get(ConversationReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    if payload.status == ConversationReportStatus.OPEN:
        raise HTTPException(status_code=400, detail="Use the queue to reopen — this endpoint resolves.")
    report.status = payload.status
    report.resolution_note = payload.resolution_note
    report.resolved_by_user_id = current_user.id
    report.resolved_at = datetime.now(UTC)
    session.add(report)
    record_audit(
        session,
        actor=current_user,
        action="report.resolved" if payload.status == ConversationReportStatus.RESOLVED else "report.dismissed",
        target_type="conversation_report",
        target_id=report.id,
        summary=f"Conversation report #{report.id} → {payload.status.value}.",
        details={"note": payload.resolution_note, "conversation_id": report.conversation_id},
    )
    session.commit()
    session.refresh(report)
    return _serialize_report(report, session)
