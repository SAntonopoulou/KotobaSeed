"""Admin → Comps & grants.

CRUD for one-off service grants (marketing comps, contracts, free
testing accounts). Every create + revoke event is audit-logged.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentAdmin
from ..models import AdminGrant, AdminGrantKind, AdminGrantStatus, User
from ..services import admin_grants as _grants_svc, audit

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/grants", tags=["admin", "grants"])


# --- schemas ----------------------------------------------------------


class GrantCreate(BaseModel):
    """Request body for POST /admin/grants.

    `target_email` resolves to a user; one of the four `kind` values
    drives which `payload` fields are required:

    - tier_upgrade : payload.tier ∈ {plus, pro, business}
    - minute_pack  : payload.minutes (int, ≥1)
    - lesson_credit: payload.count (int, ≥1), payload.max_lesson_minutes (optional)
    - discount     : payload.percent_off OR (payload.amount_off_cents + currency)
    """

    target_email: EmailStr
    kind: AdminGrantKind
    payload: dict[str, Any]
    expires_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=500)


class GrantRead(BaseModel):
    id: int
    target_email: str
    target_user_id: int
    kind: AdminGrantKind
    payload: dict[str, Any]
    expires_at: datetime | None
    status: AdminGrantStatus
    reason: str | None
    created_at: datetime
    updated_at: datetime
    revoked_at: datetime | None
    expired_at: datetime | None
    granted_by_user_id: int


def _serialize(session: Session, grant: AdminGrant) -> GrantRead:
    user = session.get(User, grant.granted_to_user_id)
    try:
        payload = json.loads(grant.payload_json or "{}")
    except (TypeError, ValueError):
        payload = {}
    return GrantRead(
        id=grant.id,
        target_email=user.email if user else "(missing)",
        target_user_id=grant.granted_to_user_id,
        kind=grant.kind,
        payload=payload,
        expires_at=grant.expires_at,
        status=grant.status,
        reason=grant.reason,
        created_at=grant.created_at,
        updated_at=grant.updated_at,
        revoked_at=grant.revoked_at,
        expired_at=grant.expired_at,
        granted_by_user_id=grant.granted_by_user_id,
    )


def _validate_payload(kind: AdminGrantKind, payload: dict[str, Any]) -> None:
    if kind == AdminGrantKind.TIER_UPGRADE:
        if str(payload.get("tier", "")).lower() not in ("plus", "pro", "business"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payload.tier must be plus|pro|business.",
            )
    elif kind == AdminGrantKind.MINUTE_PACK:
        m = payload.get("minutes")
        if not isinstance(m, int) or m < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payload.minutes must be a positive integer.",
            )
    elif kind == AdminGrantKind.LESSON_CREDIT:
        c = payload.get("count")
        if not isinstance(c, int) or c < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payload.count must be a positive integer.",
            )
    elif kind == AdminGrantKind.DISCOUNT:
        has_percent = isinstance(payload.get("percent_off"), (int, float))
        has_amount = (
            isinstance(payload.get("amount_off_cents"), int)
            and payload.get("currency") in ("eur", "usd")
        )
        if not (has_percent or has_amount):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "DISCOUNT needs payload.percent_off OR "
                    "(payload.amount_off_cents + payload.currency)."
                ),
            )


# --- endpoints --------------------------------------------------------


@router.get("", response_model=list[GrantRead])
def list_grants(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
    status_filter: AdminGrantStatus | None = None,
) -> list[GrantRead]:
    """Admin — list every grant, newest first. Optional status filter."""
    stmt = select(AdminGrant).order_by(AdminGrant.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(AdminGrant.status == status_filter)
    rows = session.exec(stmt).all()
    return [_serialize(session, r) for r in rows]


@router.post("", response_model=GrantRead, status_code=status.HTTP_201_CREATED)
def create_grant(
    payload: GrantCreate,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> GrantRead:
    """Admin — create + immediately activate a grant.

    The target user must already exist (we don't auto-create accounts
    via grants — admins create the user first if they need a new one).
    """
    _validate_payload(payload.kind, payload.payload)

    target_email = str(payload.target_email).strip().lower()
    user = session.exec(select(User).where(User.email == target_email)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No user with email {target_email}.",
        )

    grant = AdminGrant(
        granted_to_user_id=user.id,
        granted_by_user_id=current.id,
        kind=payload.kind,
        payload_json=json.dumps(payload.payload),
        expires_at=payload.expires_at,
        reason=payload.reason,
    )
    session.add(grant)
    session.flush()
    _grants_svc.activate_grant(session, grant)
    audit.record_audit(
        session,
        actor=current,
        action="admin.grant.created",
        target_type="user",
        target_id=user.id,
        summary=f"Granted {payload.kind.value} to {target_email}",
        details={"payload": payload.payload, "expires_at": payload.expires_at.isoformat() if payload.expires_at else None, "reason": payload.reason},
    )
    session.commit()
    session.refresh(grant)
    return _serialize(session, grant)


@router.post("/{grant_id}/revoke", response_model=GrantRead)
def revoke_grant_endpoint(
    grant_id: int,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> GrantRead:
    """Admin — revoke an active grant immediately. Side effects are
    reversed (tier restored, untouched packs deleted, etc.)."""
    grant = session.get(AdminGrant, grant_id)
    if grant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Grant not found."
        )
    if grant.status != AdminGrantStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Grant is already {grant.status.value}.",
        )
    _grants_svc.revoke_grant(session, grant, status_after=AdminGrantStatus.REVOKED)
    audit.record_audit(
        session,
        actor=current,
        action="admin.grant.revoked",
        target_type="grant",
        target_id=grant_id,
        summary=f"Revoked {grant.kind.value} grant #{grant_id}",
        details=None,
    )
    session.commit()
    session.refresh(grant)
    return _serialize(session, grant)
