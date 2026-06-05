from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/", response_model=list[Notification])
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
