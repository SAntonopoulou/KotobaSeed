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


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user


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
