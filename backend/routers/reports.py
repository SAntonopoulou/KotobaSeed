"""DSA Article 16 notice + action endpoint + admin moderation surface.

Anyone — user or non-user — can report content they believe is illegal.
We persist the report into the `report` table so we can reply to the
reporter, issue a statement of reasons to the affected user, handle
appeals, and aggregate transparency stats.

When platform reach grows beyond DSA Article 24 thresholds (50 employees
+ €10M turnover) the annual transparency report pulls directly from this
table — see routers/transparency.py.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentAdmin
from ..models import Report, ReportStatus
from ..services.audit import record_audit

router = APIRouter(prefix="/reports", tags=["reports"])

log = logging.getLogger(__name__)


class IllegalContentReport(BaseModel):
    """DSA Article 16 notice."""

    reporter_email: Optional[str] = Field(default=None, max_length=320)
    content_url: str = Field(..., max_length=2048)
    legal_basis: Optional[str] = Field(default=None, max_length=512)
    description: str = Field(..., min_length=10, max_length=8000)
    is_trusted_flagger: bool = False
    acting_on_behalf_of: Optional[str] = Field(default=None, max_length=300)


class IllegalContentReportAck(BaseModel):
    received: bool
    received_at: datetime
    reference: str


@router.post("/illegal-content", response_model=IllegalContentReportAck)
def report_illegal_content(
    payload: IllegalContentReport,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
):
    """Accept a DSA Article 16 illegal-content notice and persist it."""
    now = datetime.now(UTC)
    reference = (
        f"DSA-{now.strftime('%Y%m%d%H%M%S')}-"
        f"{hash((payload.content_url, now.isoformat())) & 0xFFFF:04x}"
    )

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:400]

    row = Report(
        reference=reference,
        reporter_email=payload.reporter_email or None,
        content_url=payload.content_url,
        legal_basis=payload.legal_basis or None,
        description=payload.description,
        is_trusted_flagger=payload.is_trusted_flagger,
        acting_on_behalf_of=payload.acting_on_behalf_of or None,
        ip=client_ip,
        user_agent=user_agent,
        status=ReportStatus.OPEN,
        created_at=now,
    )
    session.add(row)
    session.commit()

    # Mirror to logs so it surfaces in Sentry/email-on-error too — keeps
    # the existing notification path working while the DB grows.
    log.info(
        "DSA notice received reference=%s reporter=%s url=%s trusted_flagger=%s",
        reference,
        payload.reporter_email or "(anonymous)",
        payload.content_url,
        payload.is_trusted_flagger,
    )

    return IllegalContentReportAck(
        received=True,
        received_at=now,
        reference=reference,
    )


# --- Admin surface --------------------------------------------------


admin_router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])


class AdminReportRead(BaseModel):
    id: int
    reference: str
    reporter_email: Optional[str]
    content_url: str
    legal_basis: Optional[str]
    description: str
    is_trusted_flagger: bool
    acting_on_behalf_of: Optional[str]
    ip: Optional[str]
    user_agent: Optional[str]
    status: ReportStatus
    created_at: datetime
    decided_at: Optional[datetime]
    decided_by_user_id: Optional[int]
    decision_reason: Optional[str]


@admin_router.get("", response_model=list[AdminReportRead])
def list_reports(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
    status_filter: Optional[ReportStatus] = None,
    limit: int = 100,
) -> list[AdminReportRead]:
    """Admin: list reports, newest first. Optionally filter by status."""
    stmt = select(Report).order_by(Report.created_at.desc()).limit(min(limit, 500))
    if status_filter is not None:
        stmt = (
            select(Report)
            .where(Report.status == status_filter)
            .order_by(Report.created_at.desc())
            .limit(min(limit, 500))
        )
    rows = session.exec(stmt).all()
    return [AdminReportRead(**row.model_dump()) for row in rows]


class ReportDecision(BaseModel):
    status: ReportStatus
    decision_reason: str = Field(..., min_length=3, max_length=2000)


@admin_router.post("/{report_id}/decide", response_model=AdminReportRead)
def decide_report(
    report_id: int,
    payload: ReportDecision,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> AdminReportRead:
    """Admin: move a report off OPEN with a decision + statement of
    reasons. We require a non-empty reason so the DSA Article 17 statement
    is never blank."""
    if payload.status == ReportStatus.OPEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A decision must move the report off OPEN.",
        )
    row = session.get(Report, report_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )
    now = datetime.now(UTC)
    row.status = payload.status
    row.decided_at = now
    row.decided_by_user_id = current.id
    row.decision_reason = payload.decision_reason
    session.add(row)
    session.commit()
    session.refresh(row)
    record_audit(
        session,
        actor=current,
        action="report.decide",
        target_type="report",
        target_id=row.id,
        summary=f"Report {row.reference} → {payload.status.value}",
        details={"reason": payload.decision_reason[:500]},
    )
    return AdminReportRead(**row.model_dump())
