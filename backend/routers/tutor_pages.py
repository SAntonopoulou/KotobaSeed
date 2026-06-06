"""Tutor landing-page builder — section list CRUD.

The public tutor site renders sections from this endpoint in order. When
a tutor has no stored sections, GET returns a default layout so the site
is never empty. PUT replaces the entire ordered list in one shot; this
keeps the position field internally consistent and avoids the patch-each-
section dance.

Write access is Pro+ only (User.is_pro_subscriber). Read is public so the
public site renderer can call it without auth.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import Tutor, TutorPageSection, TutorPageSectionType, User
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(tags=["tutor-pages"])


class PageSectionRead(BaseModel):
    id: int | None = None  # null for default-layout sections not yet persisted
    section_type: TutorPageSectionType
    position: int
    is_visible: bool
    content: dict[str, Any] = Field(default_factory=dict)


class PageSectionInput(BaseModel):
    section_type: TutorPageSectionType
    is_visible: bool = True
    content: dict[str, Any] = Field(default_factory=dict)


class PageSectionsReplace(BaseModel):
    sections: list[PageSectionInput]


# The default layout matches today's hard-coded TutorHome flow so existing
# tutors see no visual change until they edit. New tutors get this as a
# starter to customise.
_DEFAULT_LAYOUT: list[tuple[TutorPageSectionType, dict[str, Any]]] = [
    (TutorPageSectionType.HERO_PORTRAIT, {}),
    (TutorPageSectionType.ABOUT_PORTRAIT, {}),
    (TutorPageSectionType.REVIEWS_GRID, {}),
    (TutorPageSectionType.PRICING_GRID, {}),
]


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _require_pro(current: User) -> None:
    if not current.is_pro_subscriber:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="The page builder is a Pro feature. Upgrade your plan to enable.",
        )


def _decode_content(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _serialize(section: TutorPageSection) -> PageSectionRead:
    return PageSectionRead(
        id=section.id,
        section_type=section.section_type,
        position=section.position,
        is_visible=section.is_visible,
        content=_decode_content(section.content_json),
    )


def _default_sections() -> list[PageSectionRead]:
    return [
        PageSectionRead(
            id=None,
            section_type=section_type,
            position=index,
            is_visible=True,
            content=dict(content),
        )
        for index, (section_type, content) in enumerate(_DEFAULT_LAYOUT)
    ]


@router.get("/tutor/page-sections", response_model=list[PageSectionRead])
def list_page_sections(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[PageSectionRead]:
    """Public — anyone visiting the tenant subdomain gets the section list.

    When the tutor hasn't stored a custom layout, return the default so the
    site is always renderable. The frontend treats id=null as "not yet
    persisted" — handy in the page builder for distinguishing fresh defaults
    from saved sections.
    """
    stored = session.exec(
        select(TutorPageSection)
        .where(TutorPageSection.tutor_id == tutor.id)
        .order_by(TutorPageSection.position)
    ).all()
    if not stored:
        return _default_sections()
    return [_serialize(s) for s in stored]


@router.put("/tutor/page-sections", response_model=list[PageSectionRead])
def replace_page_sections(
    payload: PageSectionsReplace,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[PageSectionRead]:
    """Owner + Pro only — replace the tutor's section list in one shot."""
    _require_owner(tutor, current)
    _require_pro(current)

    existing = session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == tutor.id)
    ).all()
    for row in existing:
        session.delete(row)

    now = datetime.now(UTC)
    rows: list[TutorPageSection] = []
    for index, item in enumerate(payload.sections):
        row = TutorPageSection(
            tutor_id=tutor.id,
            section_type=item.section_type,
            position=index,
            is_visible=item.is_visible,
            content_json=json.dumps(item.content) if item.content else None,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        rows.append(row)

    session.commit()
    for row in rows:
        session.refresh(row)
    return [_serialize(r) for r in rows]


@router.delete("/tutor/page-sections", status_code=status.HTTP_204_NO_CONTENT)
def reset_page_sections(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Owner + Pro only — wipe stored sections so GET falls back to default."""
    _require_owner(tutor, current)
    _require_pro(current)
    existing = session.exec(
        select(TutorPageSection).where(TutorPageSection.tutor_id == tutor.id)
    ).all()
    for row in existing:
        session.delete(row)
    session.commit()
