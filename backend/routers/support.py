"""Support ticket system.

Endpoints split between user-facing and staff-facing:
- /support/tickets         — user creates, lists their own, reads
- /support/tickets/{id}/reply — user OR staff add a public message
- /staff/support/...       — staff queue, read any ticket, status / escalate /
  assign / internal note (role-gated by tier)

Status workflow:
    OPEN ─► IN_PROGRESS ─► RESOLVED ─► CLOSED
              │   ▲             │
              ▼   │             ▼
         ESCALATED               (reopen)

Permissions:
- Any logged-in user: create, list-own, read-own, reply-own
- Support: read any, reply, mark in_progress / resolved, escalate, add notes
- Manager: everything support can + close + reopen + assign + escalate to admin
- Admin: everything + reassign across staff + force any transition
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import (
    CurrentUser,
    get_current_admin,
    get_current_manager,
    get_current_staff,
    is_manager_or_above,
    is_staff,
)
from ..models import (
    SupportTicket,
    SupportTicketCategory,
    SupportTicketMessage,
    SupportTicketPriority,
    SupportTicketStatus,
    User,
)
from ..services import support_emails
from ..services.audit import record_audit

log = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["support"])
staff_router = APIRouter(prefix="/staff/support", tags=["staff-support"])


# --- Schemas --------------------------------------------------------------


class TicketMessageRead(BaseModel):
    id: int
    author_user_id: int | None
    author_label: str
    body: str
    is_internal: bool
    created_at: datetime


class TicketRead(BaseModel):
    id: int
    subject: str
    body: str
    submitted_by_user_id: int | None
    submitted_by_email: str
    submitted_by_name: str | None
    status: SupportTicketStatus
    priority: SupportTicketPriority
    category: SupportTicketCategory
    escalation_level: int
    assigned_to_user_id: int | None
    related_user_id: int | None
    related_booking_id: int | None
    related_tutor_id: int | None
    created_at: datetime
    updated_at: datetime
    last_activity_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
    messages: list[TicketMessageRead] = []


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=10, max_length=10000)
    category: SupportTicketCategory = SupportTicketCategory.OTHER
    priority: SupportTicketPriority | None = None  # users default to NORMAL
    related_booking_id: int | None = None
    related_tutor_id: int | None = None


class TicketReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class TicketInternalNoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class TicketStatusUpdate(BaseModel):
    status: SupportTicketStatus


class TicketAssign(BaseModel):
    assigned_to_user_id: int | None  # null = unassign


class TicketPriorityUpdate(BaseModel):
    priority: SupportTicketPriority


# --- Helpers --------------------------------------------------------------


def _staff_label(user: User) -> str:
    return f"{user.full_name or user.email} ({user.role.value})"


def _user_label(user: User) -> str:
    return user.full_name or user.email


def _serialize_message(m: SupportTicketMessage) -> TicketMessageRead:
    return TicketMessageRead(
        id=m.id,
        author_user_id=m.author_user_id,
        author_label=m.author_label,
        body=m.body,
        is_internal=m.is_internal,
        created_at=m.created_at,
    )


def _serialize_ticket(
    ticket: SupportTicket,
    messages: list[SupportTicketMessage],
    *,
    include_internal: bool,
) -> TicketRead:
    visible = [m for m in messages if include_internal or not m.is_internal]
    return TicketRead(
        id=ticket.id,
        subject=ticket.subject,
        body=ticket.body,
        submitted_by_user_id=ticket.submitted_by_user_id,
        submitted_by_email=ticket.submitted_by_email,
        submitted_by_name=ticket.submitted_by_name,
        status=ticket.status,
        priority=ticket.priority,
        category=ticket.category,
        escalation_level=ticket.escalation_level,
        assigned_to_user_id=ticket.assigned_to_user_id,
        related_user_id=ticket.related_user_id,
        related_booking_id=ticket.related_booking_id,
        related_tutor_id=ticket.related_tutor_id,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        last_activity_at=ticket.last_activity_at,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        messages=[_serialize_message(m) for m in visible],
    )


def _load_messages(session: Session, ticket_id: int) -> list[SupportTicketMessage]:
    return list(
        session.exec(
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id == ticket_id)
            .order_by(SupportTicketMessage.created_at)
        ).all()
    )


def _can_read_ticket(user: User, ticket: SupportTicket) -> bool:
    if is_staff(user):
        return True
    return ticket.submitted_by_user_id == user.id


def _touch_ticket(ticket: SupportTicket) -> None:
    now = datetime.now(UTC)
    ticket.updated_at = now
    ticket.last_activity_at = now


# --- User-facing endpoints ------------------------------------------------


@router.post("/tickets", response_model=TicketRead, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    """Any logged-in user can open a ticket. Anonymous submissions go via
    a contact form not built here — we expect users to be signed in for
    threading + reply notifications."""
    ticket = SupportTicket(
        subject=payload.subject.strip(),
        body=payload.body.strip(),
        submitted_by_user_id=current.id,
        submitted_by_email=current.email,
        submitted_by_name=current.full_name,
        status=SupportTicketStatus.OPEN,
        priority=payload.priority or SupportTicketPriority.NORMAL,
        category=payload.category,
        related_booking_id=payload.related_booking_id,
        related_tutor_id=payload.related_tutor_id,
    )
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    support_emails.send_new_ticket_to_staff(session, ticket)
    return _serialize_ticket(ticket, [], include_internal=False)


@router.get("/tickets/mine", response_model=list[TicketRead])
def list_my_tickets(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[TicketRead]:
    rows = session.exec(
        select(SupportTicket)
        .where(SupportTicket.submitted_by_user_id == current.id)
        .order_by(SupportTicket.last_activity_at.desc())
    ).all()
    return [_serialize_ticket(t, [], include_internal=False) for t in rows]


@router.get("/tickets/{ticket_id}", response_model=TicketRead)
def read_ticket(
    ticket_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None or not _can_read_ticket(current, ticket):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    messages = _load_messages(session, ticket.id)
    return _serialize_ticket(ticket, messages, include_internal=is_staff(current))


@router.post("/tickets/{ticket_id}/reply", response_model=TicketRead)
def reply_to_ticket(
    ticket_id: int,
    payload: TicketReplyIn,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    """Either side (creator or any staff) can add a public reply.

    If the ticket is CLOSED, replies are blocked unless the actor is
    manager+. RESOLVED tickets automatically flip back to IN_PROGRESS on
    a creator reply — that's the lightweight "reopen" path.
    """
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None or not _can_read_ticket(current, ticket):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    if ticket.status == SupportTicketStatus.CLOSED and not is_manager_or_above(current):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This ticket is closed. Open a new one if you need more help.",
        )

    is_author = current.id == ticket.submitted_by_user_id
    label = (
        _staff_label(current)
        if is_staff(current)
        else _user_label(current)
    )
    message = SupportTicketMessage(
        ticket_id=ticket.id,
        author_user_id=current.id,
        author_label=label,
        body=payload.body.strip(),
        is_internal=False,
    )
    session.add(message)

    # Creator replying to a resolved ticket reopens it automatically.
    if is_author and ticket.status == SupportTicketStatus.RESOLVED:
        ticket.status = SupportTicketStatus.IN_PROGRESS
        ticket.resolved_at = None
    # Staff replying to an open ticket flips it to in_progress so the
    # queue reflects that someone's on it.
    elif is_staff(current) and ticket.status == SupportTicketStatus.OPEN:
        ticket.status = SupportTicketStatus.IN_PROGRESS

    _touch_ticket(ticket)
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    # Notify the other side. Staff replying → email user; user replying →
    # email the staff inbox so it bumps to the top of someone's queue.
    if is_staff(current):
        support_emails.send_reply_to_user(session, ticket, payload.body)
        # Also push a bell-icon notification + WS event so the user sees
        # the new reply without polling.
        if ticket.submitted_by_user_id:
            from ..models import Notification
            from ..services import realtime

            note_message = (
                f"Reply on your support ticket #{ticket.id}: {ticket.subject}"
            )
            note_link = f"/support/{ticket.id}"
            session.add(
                Notification(
                    user_id=ticket.submitted_by_user_id,
                    message=note_message,
                    link=note_link,
                )
            )
            session.commit()
            realtime.push_notification_event(
                ticket.submitted_by_user_id,
                message=note_message,
                link=note_link,
            )
    elif is_author:
        support_emails.send_new_ticket_to_staff(session, ticket)
    messages = _load_messages(session, ticket.id)
    return _serialize_ticket(ticket, messages, include_internal=is_staff(current))


# --- Staff endpoints ------------------------------------------------------


@staff_router.get("/tickets", response_model=list[TicketRead])
def list_tickets_for_staff(
    current: Annotated[User, Depends(get_current_staff)],
    session: Annotated[Session, Depends(get_session)],
    status_filter: SupportTicketStatus | None = Query(default=None, alias="status"),
    priority: SupportTicketPriority | None = None,
    category: SupportTicketCategory | None = None,
    assigned_to_me: bool = False,
    search: str | None = None,
) -> list[TicketRead]:
    """Staff queue with simple filters. Ordered by most recent activity so
    fresh replies bubble to the top — newest tickets land there too."""
    q = select(SupportTicket)
    if status_filter is not None:
        q = q.where(SupportTicket.status == status_filter)
    if priority is not None:
        q = q.where(SupportTicket.priority == priority)
    if category is not None:
        q = q.where(SupportTicket.category == category)
    if assigned_to_me:
        q = q.where(SupportTicket.assigned_to_user_id == current.id)
    if search and search.strip():
        pattern = f"%{search.strip().lower()}%"
        from sqlalchemy import func as _func

        q = q.where(_func.lower(SupportTicket.subject).like(pattern))
    q = q.order_by(SupportTicket.last_activity_at.desc()).limit(200)
    rows = session.exec(q).all()
    return [
        _serialize_ticket(t, [], include_internal=False) for t in rows
    ]


@staff_router.post("/tickets/{ticket_id}/note", response_model=TicketRead)
def add_internal_note(
    ticket_id: int,
    payload: TicketInternalNoteIn,
    current: Annotated[User, Depends(get_current_staff)],
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    """Staff-only internal note — invisible to the ticket creator."""
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    message = SupportTicketMessage(
        ticket_id=ticket.id,
        author_user_id=current.id,
        author_label=_staff_label(current),
        body=payload.body.strip(),
        is_internal=True,
    )
    session.add(message)
    _touch_ticket(ticket)
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    messages = _load_messages(session, ticket.id)
    return _serialize_ticket(ticket, messages, include_internal=True)


def _validate_status_transition(
    current_user: User,
    ticket: SupportTicket,
    new_status: SupportTicketStatus,
) -> None:
    """Raise 403 if the actor can't perform the transition.

    - Support: can move to IN_PROGRESS, ESCALATED, RESOLVED
    - Manager: above + CLOSED, plus can reopen RESOLVED → IN_PROGRESS
    - Admin: any transition
    """
    if current_user.role.value == "admin":
        return
    if is_manager_or_above(current_user):
        # Manager can do almost anything except moving an already-CLOSED
        # ticket back to OPEN. Reopen path: CLOSED → IN_PROGRESS only,
        # which avoids ambiguity about who originally opened.
        if (
            ticket.status == SupportTicketStatus.CLOSED
            and new_status == SupportTicketStatus.OPEN
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reopen closed tickets via IN_PROGRESS, not OPEN.",
            )
        return
    # Support tier
    allowed = {
        SupportTicketStatus.IN_PROGRESS,
        SupportTicketStatus.ESCALATED,
        SupportTicketStatus.RESOLVED,
    }
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers + admins can change the ticket to this status.",
        )


@staff_router.post("/tickets/{ticket_id}/status", response_model=TicketRead)
def change_ticket_status(
    ticket_id: int,
    payload: TicketStatusUpdate,
    current: Annotated[User, Depends(get_current_staff)],
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    _validate_status_transition(current, ticket, payload.status)
    if payload.status == ticket.status:
        # No-op — return the current state without an audit row.
        messages = _load_messages(session, ticket.id)
        return _serialize_ticket(ticket, messages, include_internal=True)

    previous = ticket.status
    ticket.status = payload.status
    now = datetime.now(UTC)
    if payload.status == SupportTicketStatus.RESOLVED:
        ticket.resolved_at = now
    if payload.status == SupportTicketStatus.CLOSED:
        ticket.closed_at = now
    if (
        payload.status == SupportTicketStatus.IN_PROGRESS
        and ticket.status == SupportTicketStatus.IN_PROGRESS
    ):
        ticket.resolved_at = None
    _touch_ticket(ticket)
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    record_audit(
        session,
        actor=current,
        action="support.status_changed",
        target_type="support_ticket",
        target_id=ticket.id,
        summary=(
            f"Support ticket #{ticket.id} {previous.value} → {ticket.status.value}."
        ),
        details={"from": previous.value, "to": ticket.status.value},
    )
    support_emails.send_status_change_to_user(session, ticket, ticket.status)
    messages = _load_messages(session, ticket.id)
    return _serialize_ticket(ticket, messages, include_internal=True)


@staff_router.post("/tickets/{ticket_id}/escalate", response_model=TicketRead)
def escalate_ticket(
    ticket_id: int,
    current: Annotated[User, Depends(get_current_staff)],
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    """Bump escalation_level and flip status to ESCALATED.

    Support: escalates to manager (level 0 → 1).
    Manager: escalates to admin (level 1 → 2).
    Admin: nothing to escalate to — returns 400.
    """
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    if current.role.value == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins are the top tier — nothing to escalate to.",
        )
    if ticket.escalation_level >= 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket is already at the admin tier.",
        )
    previous_level = ticket.escalation_level
    ticket.escalation_level = min(ticket.escalation_level + 1, 2)
    ticket.status = SupportTicketStatus.ESCALATED
    # Clear assignment — the new tier needs to pick it up.
    ticket.assigned_to_user_id = None
    _touch_ticket(ticket)
    session.add(ticket)
    # Audit + leave an internal note so the next-tier staff sees who
    # escalated and when (the audit log is admin-only; the note is
    # visible to all staff).
    session.add(
        SupportTicketMessage(
            ticket_id=ticket.id,
            author_user_id=current.id,
            author_label=_staff_label(current),
            body=f"Escalated from level {previous_level} to level {ticket.escalation_level}.",
            is_internal=True,
        )
    )
    session.commit()
    session.refresh(ticket)
    record_audit(
        session,
        actor=current,
        action="support.escalated",
        target_type="support_ticket",
        target_id=ticket.id,
        summary=f"Escalated ticket #{ticket.id} to level {ticket.escalation_level}.",
    )
    messages = _load_messages(session, ticket.id)
    return _serialize_ticket(ticket, messages, include_internal=True)


@staff_router.post("/tickets/{ticket_id}/assign", response_model=TicketRead)
def assign_ticket(
    ticket_id: int,
    payload: TicketAssign,
    current: Annotated[User, Depends(get_current_manager)],
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    """Manager+ can assign or unassign. Assignee must be staff."""
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    if payload.assigned_to_user_id is not None:
        assignee = session.get(User, payload.assigned_to_user_id)
        if assignee is None or not is_staff(assignee):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee must be a staff user.",
            )
    ticket.assigned_to_user_id = payload.assigned_to_user_id
    _touch_ticket(ticket)
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    record_audit(
        session,
        actor=current,
        action="support.assigned",
        target_type="support_ticket",
        target_id=ticket.id,
        summary=(
            f"Assigned ticket #{ticket.id} to user {payload.assigned_to_user_id}"
            if payload.assigned_to_user_id
            else f"Unassigned ticket #{ticket.id}."
        ),
    )
    messages = _load_messages(session, ticket.id)
    return _serialize_ticket(ticket, messages, include_internal=True)


@staff_router.post("/tickets/{ticket_id}/priority", response_model=TicketRead)
def change_priority(
    ticket_id: int,
    payload: TicketPriorityUpdate,
    current: Annotated[User, Depends(get_current_staff)],
    session: Annotated[Session, Depends(get_session)],
) -> TicketRead:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
    previous = ticket.priority
    ticket.priority = payload.priority
    _touch_ticket(ticket)
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    record_audit(
        session,
        actor=current,
        action="support.priority_changed",
        target_type="support_ticket",
        target_id=ticket.id,
        summary=f"Priority {previous.value} → {ticket.priority.value} on #{ticket.id}.",
    )
    messages = _load_messages(session, ticket.id)
    return _serialize_ticket(ticket, messages, include_internal=True)


class StaffListEntry(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str


@staff_router.get("/staff-list", response_model=list[StaffListEntry])
def list_staff_for_assignment(
    current: Annotated[User, Depends(get_current_manager)],
    session: Annotated[Session, Depends(get_session)],
) -> list[StaffListEntry]:
    """Manager+ — slim staff roster, used by the ticket-detail assign
    dropdown. Distinct from `/admin/staff` which is admin-only and returns
    the full editable user row."""
    from ..models import UserRole

    rows = session.exec(
        select(User)
        .where(
            User.role.in_(
                [
                    UserRole.SUPPORT,
                    UserRole.MANAGER,
                    UserRole.ADMIN,
                    UserRole.MODERATOR,
                ]
            ),
            User.deleted_at.is_(None),
            User.is_active,
        )
        .order_by(User.role, User.email)
    ).all()
    return [
        StaffListEntry(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
        )
        for u in rows
    ]


# Admin-only deletion — exists for GDPR right-to-erasure side cases. Soft
# delete is preferred for the audit trail; we expose a true delete only for
# when retention isn't justifiable.
@staff_router.delete("/tickets/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(
    ticket_id: int,
    current: Annotated[User, Depends(get_current_admin)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        return
    for m in _load_messages(session, ticket.id):
        session.delete(m)
    session.delete(ticket)
    session.commit()
    record_audit(
        session,
        actor=current,
        action="support.deleted",
        target_type="support_ticket",
        target_id=ticket_id,
        summary=f"Permanently deleted support ticket #{ticket_id}.",
    )
