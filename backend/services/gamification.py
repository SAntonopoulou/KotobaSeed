import logging

from sqlmodel import Session, select

from backend.models import Achievement, Notification, User, UserAchievement

log = logging.getLogger(__name__)


def award_achievement(user: User, achievement_key: str, session: Session) -> None:
    """Award an achievement to a user if they don't already have it.

    Does not commit — the caller is responsible.
    """
    # Check if the user already has the achievement by joining with the Achievement table
    statement = (
        select(UserAchievement)
        .join(Achievement)
        .where(
            UserAchievement.user_id == user.id,
            Achievement.key == achievement_key,
        )
    )
    existing_user_achievement = session.exec(statement).first()

    if existing_user_achievement:
        return  # User already has this achievement

    # Find the achievement
    statement = select(Achievement).where(Achievement.key == achievement_key)
    achievement = session.exec(statement).one_or_none()

    if not achievement:
        log.warning("Achievement with key %r not found", achievement_key)
        return

    # Create the link table entry
    user_achievement = UserAchievement(user_id=user.id, achievement_id=achievement.id)
    session.add(user_achievement)

    # Create a notification for the user
    notification = Notification(
        user_id=user.id,
        message=f"You've unlocked a new achievement: {achievement.name}!",
        link="/profile/me?tab=achievements",
    )
    session.add(notification)

    # The calling function is responsible for session.commit()
