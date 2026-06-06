"""Public platform endpoints — small surface curated for unauthenticated
clients (the apex footer, marketing site). Everything reachable here is
explicitly safe to expose without auth.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from ..database import get_session
from ..services import platform_settings as settings_service

router = APIRouter(prefix="/platform", tags=["platform"])


class FooterConfig(BaseModel):
    social_links: dict[str, str]
    support_email: str | None = None
    tagline: str | None = None


@router.get("/footer", response_model=FooterConfig)
def get_footer_config(
    session: Annotated[Session, Depends(get_session)],
) -> FooterConfig:
    """Public — what the apex footer + tutor footers need to render."""
    return FooterConfig(
        social_links=settings_service.get_social_links(session),
        support_email=settings_service.get_setting(
            session, settings_service.SETTING_SUPPORT_EMAIL
        ),
        tagline=settings_service.get_setting(
            session, settings_service.SETTING_FOOTER_TAGLINE
        ),
    )
