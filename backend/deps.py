from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlmodel import Session

from .database import get_session
from .models import User, UserRole
from .security import ALGORITHM, SECRET_KEY

reusable_oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/token")

reusable_oauth2_optional = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


class TokenPayload(BaseModel):
    sub: str | None = None


def get_current_user(
    token: str = Depends(reusable_oauth2), session: Session = Depends(get_session)
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        token_data = TokenPayload(**payload)
        if not token_data.sub:
            raise ValueError("No subject in token")
        user_id = int(token_data.sub)
    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        ) from None

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_email_verified(current_user: User = Depends(get_current_user)) -> User:
    """Gate endpoints behind email verification.

    Admins bypass — they're seeded server-side and don't go through the
    verification flow.
    """
    if current_user.role == UserRole.ADMIN:
        return current_user
    if current_user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required.",
        )
    return current_user


CurrentVerifiedUser = Annotated[User, Depends(require_email_verified)]


def get_current_user_optional(
    token: str | None = Depends(reusable_oauth2_optional), session: Session = Depends(get_session)
) -> User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        token_data = TokenPayload(**payload)
        if not token_data.sub:
            return None
        user_id = int(token_data.sub)
    except (JWTError, ValueError, TypeError):
        return None

    user = session.get(User, user_id)
    return user


# --- Staff role hierarchy --------------------------------------------------
# The integer ranks below order the staff tiers so we can do single-pass
# comparisons. Add a new tier only by updating this table.

_ROLE_RANK: dict[UserRole, int] = {
    UserRole.STUDENT: 0,
    UserRole.CREATOR: 1,
    UserRole.MODERATOR: 1,  # legacy peer of CREATOR — outside the new ladder
    UserRole.SUPPORT: 2,
    UserRole.MANAGER: 3,
    UserRole.ADMIN: 4,
}


def role_rank(role: UserRole) -> int:
    return _ROLE_RANK.get(role, 0)


def is_staff(user: User) -> bool:
    """Any tier of staff (support, manager, admin, or legacy moderator)."""
    return user.role in (
        UserRole.SUPPORT,
        UserRole.MANAGER,
        UserRole.ADMIN,
        UserRole.MODERATOR,
    )


def is_manager_or_above(user: User) -> bool:
    return user.role in (UserRole.MANAGER, UserRole.ADMIN)


def is_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user


def get_current_manager(
    current_user: User = Depends(get_current_user),
) -> User:
    """Allows MANAGER and ADMIN — manager-tier endpoints (close tickets,
    refund bookings, etc.)."""
    if not is_manager_or_above(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user


def get_current_staff(
    current_user: User = Depends(get_current_user),
) -> User:
    """Allows any staff role — support, manager, admin (and legacy moderator).
    Used by support-tier endpoints like reading the ticket queue."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user


CurrentAdmin = Annotated[User, Depends(get_current_admin)]
CurrentManager = Annotated[User, Depends(get_current_manager)]
CurrentStaff = Annotated[User, Depends(get_current_staff)]


def require_role(role: UserRole) -> Callable[[User], User]:
    """
    Returns a dependency that requires the current user to have a specific role.
    """

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"The user must have the '{role.value}' role",
            )
        return current_user

    return role_checker
