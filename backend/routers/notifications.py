from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import update
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import Notification, User
from ..schemas import _utc_aware

router = APIRouter(prefix="/notifications", tags=["notifications"])


# Explicit Read schema so created_at always serializes as a UTC-aware
# ISO string. Exposing the SQLModel directly drops tzinfo on the way
# out and clients render the timestamp at their local offset minus a
# guessed UTC shift — wrong by an hour for any user in CEST.
class NotificationRead(BaseModel):
    id: int | None
    message: str
    is_read: bool
    link: str | None
    user_id: int | None
    created_at: datetime

    @field_validator("created_at", mode="before")
    @classmethod
    def _ensure_utc(cls, v):
        return _utc_aware(v)

    model_config = ConfigDict(from_attributes=True)


@router.get("/", response_model=list[NotificationRead])
def list_notifications(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    """
    Get all notifications for the current user.
    """
    statement = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
    )
    notifications = session.exec(statement).all()
    return notifications


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Mark a specific notification as read.
    """
    notification = session.get(Notification, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this notification")

    notification.is_read = True
    session.add(notification)
    session.commit()
    return


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    """
    Mark all of the user's notifications as read.
    """
    statement = (
        update(Notification).where(Notification.user_id == current_user.id).values(is_read=True)
    )
    session.execute(statement)
    session.commit()
    return
