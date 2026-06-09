"""Platform-wide announcement banners.

Two concerns sit in one router:

1. **Admin CRUD** — create, retract, list announcements. Used when
   Sophia needs to publish a 15-day notice (EU P2B Article 8) of a
   tutor-facing T&C change, or surface a DSA Article 14 disclosure of a
   moderation-policy change.

2. **Public active list** — every authed page fetches the current
   user's active banners. `severity=policy_change` banners are
   dismissible only via the acknowledge endpoint, which stamps a row in
   `announcement_dismissal` — that row is the legal proof the affected
   user was notified before `effective_at`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentAdmin, CurrentUser
from ..models import (
    AnnouncementDismissal,
    PlatformAnnouncement,
    PlatformAnnouncementAudience,
    PlatformAnnouncementSeverity,
    UserRole,
)
from ..services.audit import record_audit


router = APIRouter(tags=["announcements"])


# --- Schemas --------------------------------------------------------


class AnnouncementRead(BaseModel):
    id: int
    title: str
    body_md: str
    audience: PlatformAnnouncementAudience
    severity: PlatformAnnouncementSeverity
    publish_at: datetime
    effective_at: Optional[datetime]
    cta_label: Optional[str]
    cta_url: Optional[str]
    dismissible: bool
    is_retracted: bool
    created_at: datetime
    # Per-user — true once the current viewer has dismissed/ack'd it.
    dismissed: bool = False


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    body_md: str = Field(..., min_length=10, max_length=10_000)
    audience: PlatformAnnouncementAudience = PlatformAnnouncementAudience.ALL
    severity: PlatformAnnouncementSeverity = PlatformAnnouncementSeverity.INFO
    publish_at: Optional[datetime] = None
    effective_at: Optional[datetime] = None
    cta_label: Optional[str] = Field(default=None, max_length=80)
    cta_url: Optional[str] = Field(default=None, max_length=512)
    dismissible: bool = True


# --- Helpers --------------------------------------------------------


def _audience_matches(audience: PlatformAnnouncementAudience, user) -> bool:
    if audience == PlatformAnnouncementAudience.ALL:
        return True
    if audience == PlatformAnnouncementAudience.TUTORS_ONLY:
        return user.role in (UserRole.TUTOR, UserRole.ADMIN, UserRole.MANAGER)
    if audience == PlatformAnnouncementAudience.STUDENTS_ONLY:
        return user.role == UserRole.STUDENT
    return False


# --- Public (authed) endpoints -------------------------------------


@router.get("/platform/announcements/active", response_model=list[AnnouncementRead])
def list_active_announcements(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[AnnouncementRead]:
    """Active banners for the current user.

    "Active" means: published (publish_at <= now), not retracted, and
    audience-matched. We include announcements the user has already
    dismissed too, with `dismissed=True`, so the client can decide
    whether to still surface them (e.g. policy_change after the
    effective_at deadline can be safely hidden once acknowledged).
    """
    now = datetime.now(UTC)
    stmt = (
        select(PlatformAnnouncement)
        .where(
            PlatformAnnouncement.is_retracted.is_(False),
            PlatformAnnouncement.publish_at <= now,
        )
        .order_by(PlatformAnnouncement.publish_at.desc())
        .limit(50)
    )
    rows = session.exec(stmt).all()
    dismissed_ids = set(
        session.exec(
            select(AnnouncementDismissal.announcement_id).where(
                AnnouncementDismissal.user_id == current.id
            )
        ).all()
    )
    out: list[AnnouncementRead] = []
    for a in rows:
        if not _audience_matches(a.audience, current):
            continue
        out.append(
            AnnouncementRead(
                id=a.id,
                title=a.title,
                body_md=a.body_md,
                audience=a.audience,
                severity=a.severity,
                publish_at=a.publish_at,
                effective_at=a.effective_at,
                cta_label=a.cta_label,
                cta_url=a.cta_url,
                dismissible=a.dismissible,
                is_retracted=a.is_retracted,
                created_at=a.created_at,
                dismissed=a.id in dismissed_ids,
            )
        )
    return out


@router.post(
    "/platform/announcements/{announcement_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
)
def dismiss_announcement(
    announcement_id: int,
    request: Request,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Record a per-user dismissal/acknowledgement.

    For severity=policy_change this row is the legal proof the affected
    user saw the P2B 15-day notice. Idempotent — calling twice doesn't
    insert twice.
    """
    a = session.get(PlatformAnnouncement, announcement_id)
    if a is None or a.is_retracted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found."
        )
    if not a.dismissible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This announcement is not dismissible.",
        )
    existing = session.exec(
        select(AnnouncementDismissal).where(
            AnnouncementDismissal.announcement_id == announcement_id,
            AnnouncementDismissal.user_id == current.id,
        )
    ).first()
    if existing is not None:
        return None
    client_ip = request.client.host if request.client else None
    row = AnnouncementDismissal(
        announcement_id=announcement_id,
        user_id=current.id,
        ip=client_ip,
    )
    session.add(row)
    session.commit()
    return None


# --- Admin endpoints ------------------------------------------------


admin_router = APIRouter(
    prefix="/admin/announcements", tags=["admin-announcements"]
)


@admin_router.get("", response_model=list[AnnouncementRead])
def admin_list_announcements(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> list[AnnouncementRead]:
    rows = session.exec(
        select(PlatformAnnouncement)
        .order_by(PlatformAnnouncement.created_at.desc())
        .limit(200)
    ).all()
    return [
        AnnouncementRead(
            id=a.id,
            title=a.title,
            body_md=a.body_md,
            audience=a.audience,
            severity=a.severity,
            publish_at=a.publish_at,
            effective_at=a.effective_at,
            cta_label=a.cta_label,
            cta_url=a.cta_url,
            dismissible=a.dismissible,
            is_retracted=a.is_retracted,
            created_at=a.created_at,
            dismissed=False,
        )
        for a in rows
    ]


@admin_router.post("", response_model=AnnouncementRead, status_code=201)
def admin_create_announcement(
    payload: AnnouncementCreate,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> AnnouncementRead:
    now = datetime.now(UTC)
    publish_at = payload.publish_at or now
    # P2B Article 8 guard: a tutor-affecting policy_change must publish
    # at least 15 days before effective_at. We don't reject here (Sophia
    # may legitimately need to dispatch a same-day security notice), but
    # we stamp an audit warning so the dashboard can flag it.
    p2b_warning = False
    if (
        payload.audience
        in (PlatformAnnouncementAudience.ALL, PlatformAnnouncementAudience.TUTORS_ONLY)
        and payload.severity == PlatformAnnouncementSeverity.POLICY_CHANGE
        and payload.effective_at is not None
        and (payload.effective_at - publish_at).days < 15
    ):
        p2b_warning = True
    row = PlatformAnnouncement(
        title=payload.title,
        body_md=payload.body_md,
        audience=payload.audience,
        severity=payload.severity,
        publish_at=publish_at,
        effective_at=payload.effective_at,
        cta_label=payload.cta_label,
        cta_url=payload.cta_url,
        dismissible=payload.dismissible,
        created_at=now,
        created_by_user_id=current.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    record_audit(
        session,
        actor=current,
        action="announcement.create",
        target_type="announcement",
        target_id=row.id,
        summary=f"Announcement: {payload.title[:80]}",
        details={
            "audience": payload.audience.value,
            "severity": payload.severity.value,
            "p2b_short_notice_warning": p2b_warning,
        },
    )
    return AnnouncementRead(
        id=row.id,
        title=row.title,
        body_md=row.body_md,
        audience=row.audience,
        severity=row.severity,
        publish_at=row.publish_at,
        effective_at=row.effective_at,
        cta_label=row.cta_label,
        cta_url=row.cta_url,
        dismissible=row.dismissible,
        is_retracted=row.is_retracted,
        created_at=row.created_at,
        dismissed=False,
    )


@admin_router.post(
    "/{announcement_id}/retract", status_code=status.HTTP_204_NO_CONTENT
)
def admin_retract_announcement(
    announcement_id: int,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    row = session.get(PlatformAnnouncement, announcement_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found."
        )
    row.is_retracted = True
    session.add(row)
    session.commit()
    record_audit(
        session,
        actor=current,
        action="announcement.retract",
        target_type="announcement",
        target_id=announcement_id,
        summary=f"Retracted: {row.title[:80]}",
    )
    return None
