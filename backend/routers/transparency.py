"""DSA Article 24 transparency-report aggregation.

Counters pull from the Report table + AuditLog. We're not yet over the
50-employee / €10M-turnover threshold so the published transparency
report is voluntary, but we collect the numbers from day one so the
first official report has a full historical baseline.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from statistics import median
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..database import get_session
from ..deps import CurrentAdmin
from ..models import AuditLog, Report, ReportStatus


router = APIRouter(prefix="/admin/transparency", tags=["admin-transparency"])


class TransparencySnapshot(BaseModel):
    year: int
    # Reporting period — typically a full calendar year.
    period_start: datetime
    period_end: datetime
    notices_received: int
    notices_open: int
    notices_actioned: int
    notices_dismissed: int
    notices_acknowledged: int
    trusted_flagger_notices: int
    # Audit-log derived counters. Actions named "user.suspend" / "user.terminate"
    # / "appeal.uphold" by convention.
    accounts_suspended: int
    accounts_terminated: int
    appeals_received: int
    appeals_upheld: int
    # Hours from notice receipt to first decision. Computed only over
    # reports that have a decision in the period.
    median_response_hours: Optional[float]
    p50_response_hours: Optional[float]
    p90_response_hours: Optional[float]


def _hours_between(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 3600.0


@router.get("/year/{year}", response_model=TransparencySnapshot)
def transparency_year(
    year: int,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> TransparencySnapshot:
    """Aggregate DSA Article 24 numbers for a calendar year."""
    period_start = datetime(year, 1, 1, tzinfo=UTC)
    period_end = datetime(year + 1, 1, 1, tzinfo=UTC)

    notices_in_window = session.exec(
        select(Report).where(
            Report.created_at >= period_start,
            Report.created_at < period_end,
        )
    ).all()

    notices_received = len(notices_in_window)
    notices_open = sum(1 for r in notices_in_window if r.status == ReportStatus.OPEN)
    notices_actioned = sum(
        1 for r in notices_in_window if r.status == ReportStatus.ACTIONED
    )
    notices_dismissed = sum(
        1 for r in notices_in_window if r.status == ReportStatus.DISMISSED
    )
    notices_acknowledged = sum(
        1 for r in notices_in_window if r.status == ReportStatus.ACKNOWLEDGED
    )
    trusted_flagger_notices = sum(
        1 for r in notices_in_window if r.is_trusted_flagger
    )

    response_hours = [
        _hours_between(r.created_at, r.decided_at)
        for r in notices_in_window
        if r.decided_at is not None
    ]

    def _pct(p: float) -> Optional[float]:
        if not response_hours:
            return None
        srt = sorted(response_hours)
        idx = max(0, min(len(srt) - 1, int(p * (len(srt) - 1))))
        return round(srt[idx], 2)

    median_hours = round(median(response_hours), 2) if response_hours else None

    audit_counters = {
        "user.suspend": 0,
        "user.terminate": 0,
        "appeal.open": 0,
        "appeal.uphold": 0,
    }
    audit_rows = session.exec(
        select(AuditLog.action, func.count(AuditLog.id)).where(
            AuditLog.created_at >= period_start,
            AuditLog.created_at < period_end,
            AuditLog.action.in_(list(audit_counters.keys())),
        ).group_by(AuditLog.action)
    ).all()
    for action, count in audit_rows:
        audit_counters[action] = int(count)

    return TransparencySnapshot(
        year=year,
        period_start=period_start,
        period_end=period_end,
        notices_received=notices_received,
        notices_open=notices_open,
        notices_actioned=notices_actioned,
        notices_dismissed=notices_dismissed,
        notices_acknowledged=notices_acknowledged,
        trusted_flagger_notices=trusted_flagger_notices,
        accounts_suspended=audit_counters["user.suspend"],
        accounts_terminated=audit_counters["user.terminate"],
        appeals_received=audit_counters["appeal.open"],
        appeals_upheld=audit_counters["appeal.uphold"],
        median_response_hours=median_hours,
        p50_response_hours=_pct(0.5),
        p90_response_hours=_pct(0.9),
    )
