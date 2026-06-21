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

import io
import json
import logging
import secrets
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import Tutor, TutorPageSection, TutorPageSectionType, TutorTeam, User
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


# --- Public team roster -----------------------------------------------
# Backing data for the TEAM_ROSTER section. Resolves the current tenant
# (tutor subdomain or custom domain) to its TutorTeam (if the tutor
# belongs to one) and returns a public-shape roster — name, slug, bio,
# headline, photo — so the renderer can drop in tutor cards without
# leaking team-management fields (invite tokens, emails, billing).


class PublicTeamMember(BaseModel):
    full_name: str
    tutor_slug: str
    bio: str | None = None
    headline: str | None = None
    photo_url: str | None = None
    is_owner: bool = False


class PublicTeamRead(BaseModel):
    team_name: str
    members: list[PublicTeamMember] = Field(default_factory=list)


@router.get("/tutor/public-team", response_model=PublicTeamRead | None)
def read_public_team(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PublicTeamRead | None:
    """Public — anyone visiting the tenant subdomain gets the roster.

    Returns null when the tenant tutor is not on a team — the renderer
    treats null as "hide the section" rather than rendering an empty
    state on a solo tutor's site.
    """
    if tutor.team_id is None:
        return None
    team = session.get(TutorTeam, tutor.team_id)
    if team is None:
        return None
    member_rows = session.exec(
        select(Tutor).where(Tutor.team_id == team.id)
    ).all()
    members: list[PublicTeamMember] = []
    for member in member_rows:
        u = session.get(User, member.user_id)
        if u is None or not u.is_active or u.deleted_at is not None:
            continue
        members.append(
            PublicTeamMember(
                full_name=u.full_name or member.tutor_slug,
                tutor_slug=member.tutor_slug,
                bio=u.bio,
                headline=getattr(u, "headline", None),
                photo_url=u.photo_url,
                is_owner=u.id == team.owner_user_id,
            )
        )
    # Owner first, then alphabetic — schools want the principal at top.
    members.sort(key=lambda m: (not m.is_owner, m.full_name.lower()))
    return PublicTeamRead(team_name=team.name, members=members)


# --- Page image upload ------------------------------------------------
# The rich-text editor + future image-block fields call this to host
# user-uploaded images on R2 and embed them by URL. Modeled on the avatar
# pipeline (Pillow decode → EXIF strip → resize → WebP → R2) so corrupt
# / over-sized / privacy-leaking inputs never make it through.

PAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024  # 10 MB hard cap
PAGE_IMAGE_MAX_LONG_EDGE = 1800           # px — large enough for hero bg
PAGE_IMAGE_ACCEPTED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}


class PageImageResponse(BaseModel):
    url: str


@router.post("/tutor/page-images", response_model=PageImageResponse)
async def upload_page_image(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    file: UploadFile = File(...),
) -> PageImageResponse:
    """Owner + Pro only — upload an image for use in the page builder.

    Returns a public R2 URL the rich-text editor can drop straight into an
    `<img>` tag. Per-tenant key prefix means a janitor can sweep a tenant's
    orphaned images on account closure later without rewriting bucket
    structure.
    """
    _require_owner(tutor, current)
    _require_pro(current)

    from ..services import storage

    if not storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File uploads aren't available on this deployment yet.",
        )

    if file.content_type not in PAGE_IMAGE_ACCEPTED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Please upload a JPEG, PNG, WebP, or HEIC image.",
        )

    raw = await file.read(PAGE_IMAGE_MAX_BYTES + 1)
    if len(raw) > PAGE_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image is too large — keep it under {PAGE_IMAGE_MAX_BYTES // (1024 * 1024)} MB.",
        )

    try:
        from PIL import Image, ImageOps, UnidentifiedImageError

        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        # Shrink only if the long edge exceeds the cap — keeps aspect.
        if max(img.size) > PAGE_IMAGE_MAX_LONG_EDGE:
            img.thumbnail(
                (PAGE_IMAGE_MAX_LONG_EDGE, PAGE_IMAGE_MAX_LONG_EDGE),
                Image.Resampling.LANCZOS,
            )
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=85, method=6)
        body = buf.getvalue()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read that image. Try a different file.",
        ) from None

    suffix = secrets.token_hex(4)
    key = f"tutor-pages/{tutor.id}/{suffix}.webp"
    public_url = storage.put_object(
        key=key, body=body, content_type="image/webp"
    )
    return PageImageResponse(url=public_url)
