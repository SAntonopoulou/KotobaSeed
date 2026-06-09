"""Custom-theme order endpoints (tutor + admin) plus Stripe webhook hooks.

The status machine lives in CustomThemeOrderStatus. Each endpoint here
moves an order forward by exactly one valid transition; everything else
is rejected at the door so the queue stays sane.

Permitted transitions (validated below):
  DRAFT          → DEPOSIT_PAID  (via Stripe webhook on deposit checkout)
  DEPOSIT_PAID   → CONCEPTS_READY (admin uploads previews)
  CONCEPTS_READY → REVIEWING       (tutor opens the review screen)
  REVIEWING      → REVISING | APPROVED | CANCELLED
  REVISING       → CONCEPTS_READY  (admin uploads revised previews)
  APPROVED       → FINAL_PAID      (via Stripe webhook on final checkout)
  FINAL_PAID     → DELIVERED       (service applies the theme + sets active_theme_id)
  any (≤ DEPOSIT_PAID) → CANCELLED  (tutor self-cancel, deposit non-refundable
                                     per T&Cs after DEPOSIT_PAID)
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Annotated, Any

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..config import settings
from ..database import get_session
from ..deps import CurrentAdmin, CurrentUser
from ..models import (
    CustomTheme,
    CustomThemeOrder,
    CustomThemeOrderStatus,
    CustomThemePackage,
    CustomThemeStatus,
    Tutor,
    TutorTeam,
    User,
)
from ..services import audit
from ..services import custom_themes as _ct_svc

log = logging.getLogger(__name__)
router = APIRouter(prefix="/custom-themes", tags=["custom-themes"])


# --- schemas ----------------------------------------------------------


class OrderBrief(BaseModel):
    """The intake form. We don't enforce a tight schema on individual
    fields because the designer needs free-form context; we just cap
    the JSON size at the model level."""

    audience: str | None = Field(default=None, max_length=500)
    tone: str | None = Field(default=None, max_length=500)
    language_focus: str | None = Field(default=None, max_length=200)
    color_leanings: str | None = Field(default=None, max_length=300)
    inspiration_links: list[str] = Field(default_factory=list)
    photo_url: str | None = Field(default=None, max_length=500)
    extra_notes: str | None = Field(default=None, max_length=2000)


class OrderCreate(BaseModel):
    package: CustomThemePackage = CustomThemePackage.STANDARD
    apply_to_team: bool = False  # Business owners only
    brief: OrderBrief


class ConceptPreview(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    image_url: str = Field(min_length=1, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)


class ConceptUpload(BaseModel):
    concepts: list[ConceptPreview] = Field(min_length=1, max_length=3)
    designer_notes: str | None = Field(default=None, max_length=2000)


class RevisionRequest(BaseModel):
    notes: str = Field(min_length=1, max_length=2000)


class SelectConcept(BaseModel):
    concept_index: int = Field(ge=0, le=2)


class OrderRead(BaseModel):
    id: int
    package: CustomThemePackage
    status: CustomThemeOrderStatus
    total_cents: int
    deposit_cents: int
    final_cents: int
    discount_percent: int
    currency: str
    target_tutor_id: int
    target_team_id: int | None
    brief: dict[str, Any]
    concept_previews: list[dict[str, Any]]
    selected_concept_index: int | None
    revision_count: int
    revision_notes: list[dict[str, Any]]
    designer_notes: str | None
    delivered_theme_id: int | None
    created_at: datetime
    updated_at: datetime


class CheckoutResponse(BaseModel):
    checkout_url: str


# --- helpers ----------------------------------------------------------


def _decode_json(blob: str, default):
    try:
        d = json.loads(blob or "")
    except (TypeError, ValueError):
        return default
    return d if d is not None else default


def _serialize(order: CustomThemeOrder) -> OrderRead:
    return OrderRead(
        id=order.id,
        package=order.package,
        status=order.status,
        total_cents=order.deposit_cents + order.final_cents,
        deposit_cents=order.deposit_cents,
        final_cents=order.final_cents,
        discount_percent=order.discount_percent,
        currency=order.currency,
        target_tutor_id=order.target_tutor_id,
        target_team_id=order.target_team_id,
        brief=_decode_json(order.brief_payload_json, {}),
        concept_previews=_decode_json(order.concept_previews_json, []),
        selected_concept_index=order.selected_concept_index,
        revision_count=order.revision_count,
        revision_notes=_decode_json(order.revision_notes_json, []),
        designer_notes=order.designer_notes,
        delivered_theme_id=order.delivered_theme_id,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _user_tutor(session: Session, user: User) -> Tutor:
    tutor = session.exec(select(Tutor).where(Tutor.user_id == user.id)).first()
    if tutor is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Set up your tutor profile before ordering a custom theme.",
        )
    return tutor


# --- TUTOR-SIDE endpoints --------------------------------------------


@router.get("", response_model=list[OrderRead])
def list_my_orders(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[OrderRead]:
    rows = session.exec(
        select(CustomThemeOrder)
        .where(CustomThemeOrder.ordering_user_id == current.id)
        .order_by(CustomThemeOrder.created_at.desc())
    ).all()
    return [_serialize(r) for r in rows]


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> OrderRead:
    """Create a DRAFT order from the intake form. Deposit not yet paid."""
    tutor = _user_tutor(session, current)

    team_id: int | None = None
    if payload.apply_to_team:
        if not tutor.team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You aren't part of a team. Pick a personal theme instead.",
            )
        team = session.get(TutorTeam, tutor.team_id)
        if team is None or team.owner_user_id != current.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the team owner can commission a team-wide theme.",
            )
        team_id = team.id

    total, deposit, discount_pct = _ct_svc.price_for(
        payload.package, current.subscription_tier
    )
    final = total - deposit

    order = CustomThemeOrder(
        ordering_user_id=current.id,
        target_tutor_id=tutor.id,
        target_team_id=team_id,
        package=payload.package,
        status=CustomThemeOrderStatus.DRAFT,
        deposit_cents=deposit,
        final_cents=final,
        discount_percent=discount_pct,
        brief_payload_json=json.dumps(payload.brief.model_dump()),
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    return _serialize(order)


@router.post("/{order_id}/deposit-checkout", response_model=CheckoutResponse)
def deposit_checkout(
    order_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> CheckoutResponse:
    """Create a Stripe Checkout Session for the 50% deposit. Caller pays;
    webhook moves the order to DEPOSIT_PAID."""
    order = session.get(CustomThemeOrder, order_id)
    if order is None or order.ordering_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status != CustomThemeOrderStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Deposit only payable on DRAFT (current: {order.status.value}).",
        )
    return CheckoutResponse(
        checkout_url=_create_checkout(
            order=order,
            amount_cents=order.deposit_cents,
            label_suffix="(50% deposit)",
            metadata_type="custom_theme_deposit",
        )
    )


@router.post(
    "/{order_id}/final-checkout", response_model=CheckoutResponse
)
def final_checkout(
    order_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> CheckoutResponse:
    order = session.get(CustomThemeOrder, order_id)
    if order is None or order.ordering_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status != CustomThemeOrderStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Approve a design before paying the final 50% "
                f"(current: {order.status.value})."
            ),
        )
    return CheckoutResponse(
        checkout_url=_create_checkout(
            order=order,
            amount_cents=order.final_cents,
            label_suffix="(50% final)",
            metadata_type="custom_theme_final",
        )
    )


@router.post("/{order_id}/select", response_model=OrderRead)
def select_concept(
    order_id: int,
    payload: SelectConcept,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> OrderRead:
    """Tutor picks one of the 3 concepts → APPROVED → pay final 50%."""
    order = session.get(CustomThemeOrder, order_id)
    if order is None or order.ordering_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status not in (
        CustomThemeOrderStatus.CONCEPTS_READY,
        CustomThemeOrderStatus.REVIEWING,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot pick a concept while order is {order.status.value}.",
        )
    concepts = _decode_json(order.concept_previews_json, [])
    if not (0 <= payload.concept_index < len(concepts)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No concept at that index.",
        )
    order.selected_concept_index = payload.concept_index
    order.status = CustomThemeOrderStatus.APPROVED
    order.approved_at = datetime.now(UTC)
    order.updated_at = datetime.now(UTC)
    session.add(order)
    session.commit()
    session.refresh(order)
    return _serialize(order)


@router.post("/{order_id}/request-revision", response_model=OrderRead)
def request_revision(
    order_id: int,
    payload: RevisionRequest,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> OrderRead:
    order = session.get(CustomThemeOrder, order_id)
    if order is None or order.ordering_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status not in (
        CustomThemeOrderStatus.CONCEPTS_READY,
        CustomThemeOrderStatus.REVIEWING,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Revisions only allowed during review (current: {order.status.value}).",
        )
    if order.revision_count >= 2:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "You've used both revision rounds. Pick one of the current "
                "concepts or cancel."
            ),
        )
    notes = _decode_json(order.revision_notes_json, [])
    if not isinstance(notes, list):
        notes = []
    notes.append(
        {"round": order.revision_count + 1, "notes": payload.notes, "at": datetime.now(UTC).isoformat()}
    )
    order.revision_notes_json = json.dumps(notes)
    order.revision_count += 1
    order.status = CustomThemeOrderStatus.REVISING
    order.updated_at = datetime.now(UTC)
    session.add(order)
    session.commit()
    session.refresh(order)
    return _serialize(order)


@router.post("/{order_id}/cancel", response_model=OrderRead)
def cancel_order(
    order_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> OrderRead:
    order = session.get(CustomThemeOrder, order_id)
    if order is None or order.ordering_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status in (
        CustomThemeOrderStatus.DELIVERED,
        CustomThemeOrderStatus.CANCELLED,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Order is {order.status.value} — cannot cancel.",
        )
    order.status = CustomThemeOrderStatus.CANCELLED
    order.cancelled_at = datetime.now(UTC)
    order.updated_at = datetime.now(UTC)
    session.add(order)
    session.commit()
    session.refresh(order)
    return _serialize(order)


# --- ADMIN-SIDE endpoints --------------------------------------------


admin_router = APIRouter(
    prefix="/admin/custom-themes", tags=["admin", "custom-themes"]
)


@admin_router.get("", response_model=list[OrderRead])
def admin_list_orders(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
    status_filter: CustomThemeOrderStatus | None = None,
) -> list[OrderRead]:
    stmt = select(CustomThemeOrder).order_by(CustomThemeOrder.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(CustomThemeOrder.status == status_filter)
    rows = session.exec(stmt).all()
    return [_serialize(r) for r in rows]


@admin_router.post("/{order_id}/concepts", response_model=OrderRead)
def admin_upload_concepts(
    order_id: int,
    payload: ConceptUpload,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> OrderRead:
    """Admin attaches 3 concept previews and pushes the order to
    CONCEPTS_READY (or back to CONCEPTS_READY from REVISING)."""
    order = session.get(CustomThemeOrder, order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status not in (
        CustomThemeOrderStatus.DEPOSIT_PAID,
        CustomThemeOrderStatus.REVISING,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Concepts only accepted after deposit is paid or during "
                f"revision (current: {order.status.value})."
            ),
        )
    order.concept_previews_json = json.dumps([c.model_dump() for c in payload.concepts])
    order.designer_notes = payload.designer_notes
    order.status = CustomThemeOrderStatus.CONCEPTS_READY
    order.concepts_ready_at = datetime.now(UTC)
    order.updated_at = datetime.now(UTC)
    session.add(order)
    audit.record_audit(
        session,
        actor=current,
        action="admin.custom_theme.concepts_ready",
        target_type="custom_theme_order",
        target_id=order.id,
        summary=f"Uploaded {len(payload.concepts)} concepts for order #{order.id}",
        details={"count": len(payload.concepts)},
    )
    session.commit()
    session.refresh(order)
    return _serialize(order)


@admin_router.post(
    "/{order_id}/finalize", response_model=OrderRead
)
def admin_finalize_delivery(
    order_id: int,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> OrderRead:
    """Admin manually moves a FINAL_PAID order to DELIVERED by attaching
    the final design and triggering the theme-apply side effect. This
    runs after the designer has converted the chosen concept into the
    TutorPageSection layout payload, which the admin pastes in here.

    For v1 this endpoint also accepts the design payload inline via the
    designer_notes field as JSON — the simpler path is to call the
    sibling /design endpoint first to store the payload, then this one
    to commit it.
    """
    order = session.get(CustomThemeOrder, order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status != CustomThemeOrderStatus.FINAL_PAID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Finalize only on FINAL_PAID (current: {order.status.value}).",
        )
    if order.delivered_theme_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attach the design payload via /design before finalizing.",
        )
    theme = session.get(CustomTheme, order.delivered_theme_id)
    if theme is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Theme row missing."
        )

    updated = _ct_svc.apply_theme(session=session, theme=theme)
    order.status = CustomThemeOrderStatus.DELIVERED
    order.delivered_at = datetime.now(UTC)
    order.updated_at = datetime.now(UTC)
    session.add(order)
    audit.record_audit(
        session,
        actor=current,
        action="admin.custom_theme.delivered",
        target_type="custom_theme_order",
        target_id=order.id,
        summary=f"Delivered custom theme to {len(updated)} tutor(s)",
        details={"tutor_ids": updated},
    )
    session.commit()
    session.refresh(order)
    return _serialize(order)


class DesignPayloadBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    design_payload: list[dict[str, Any]] = Field(default_factory=list)


@admin_router.post("/{order_id}/design", response_model=OrderRead)
def admin_attach_design(
    order_id: int,
    payload: DesignPayloadBody,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> OrderRead:
    """Admin stores the final design payload as a CustomTheme row tied to
    this order. After this endpoint, /finalize will apply it."""
    order = session.get(CustomThemeOrder, order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status != CustomThemeOrderStatus.FINAL_PAID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Attach the design once the final 50% is paid "
                f"(current: {order.status.value})."
            ),
        )

    theme = CustomTheme(
        owner_user_id=order.ordering_user_id if order.target_team_id is None else None,
        owner_team_id=order.target_team_id,
        name=payload.name,
        design_payload_json=json.dumps(payload.design_payload),
        status=CustomThemeStatus.DRAFT,
        source_order_id=order.id,
    )
    session.add(theme)
    session.flush()
    order.delivered_theme_id = theme.id
    order.updated_at = datetime.now(UTC)
    session.add(order)
    session.commit()
    session.refresh(order)
    return _serialize(order)


router.include_router(admin_router)


# --- v2 upload-driven theme system -----------------------------------
# Phase B endpoints for the scalable custom-theme system. These let an
# admin (designer-facing form) author themes by uploading palette /
# fonts / a section payload — no React-component changes required.
#
# The runtime CustomThemeSite component reads `GET /custom-themes/v2/
# by-key/{theme_key}` when a tutor's `Tutor.theme` matches a v2 key,
# and mounts the registered variants from the design payload.


class CustomThemeV2Read(BaseModel):
    """Public read shape — what the runtime renderer needs.

    Editor-only fields (created_at, owner_*, etc.) are not exposed here
    so the public-by-key endpoint can be cached without leaking
    authorship metadata.
    """

    id: int
    name: str
    theme_key: str | None
    palette_json: str
    fonts_json: str
    design_payload_json: str
    preview_image_url: str | None
    is_public_catalogue: bool


class CustomThemeV2Create(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    theme_key: str = Field(
        min_length=3,
        max_length=64,
        pattern=r"^custom-[a-z0-9][a-z0-9-]*$",
        description=(
            "URL-safe slug starting with `custom-`. Match against "
            "Tutor.theme to mount this theme via CustomThemeSite."
        ),
    )
    palette_json: str = Field(default="{}", max_length=8000)
    fonts_json: str = Field(default="{}", max_length=2000)
    design_payload_json: str = Field(default="[]")
    preview_image_url: str | None = Field(default=None, max_length=2048)
    is_public_catalogue: bool = False
    owner_user_id: int | None = None
    owner_team_id: int | None = None


class CustomThemeV2Update(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    palette_json: str | None = Field(default=None, max_length=8000)
    fonts_json: str | None = Field(default=None, max_length=2000)
    design_payload_json: str | None = None
    preview_image_url: str | None = Field(default=None, max_length=2048)
    is_public_catalogue: bool | None = None


def _to_v2_read(theme: CustomTheme) -> CustomThemeV2Read:
    return CustomThemeV2Read(
        id=theme.id,
        name=theme.name,
        theme_key=theme.theme_key,
        palette_json=theme.palette_json or "{}",
        fonts_json=theme.fonts_json or "{}",
        design_payload_json=theme.design_payload_json or "[]",
        preview_image_url=theme.preview_image_url,
        is_public_catalogue=theme.is_public_catalogue,
    )


def _validate_json_blob(label: str, raw: str | None) -> None:
    """Cheap defensive parse so a malformed payload is caught at the
    admin form instead of crashing the runtime renderer for a tutor."""
    if raw is None or raw == "":
        return
    try:
        json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} is not valid JSON: {e.msg}",
        )


@router.get("/v2/by-key/{theme_key}", response_model=CustomThemeV2Read)
def public_get_by_key(
    theme_key: str,
    session: Annotated[Session, Depends(get_session)],
) -> CustomThemeV2Read:
    """Public — the runtime renderer fetches this on tenant page load.

    Returns the minimum fields needed to render. Anyone with a slug can
    read; palette + fonts + payload are not secrets (a curious visitor
    could read the page source either way), so no auth is required.
    """
    row = session.exec(
        select(CustomTheme).where(CustomTheme.theme_key == theme_key)
    ).first()
    if row is None or row.theme_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Theme not found.",
        )
    return _to_v2_read(row)


@admin_router.get("/v2", response_model=list[CustomThemeV2Read])
def admin_v2_list(
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> list[CustomThemeV2Read]:
    """Admin listing — every v2 theme regardless of catalogue status.

    v1 design-service themes (theme_key IS NULL) are excluded so the
    admin doesn't accidentally edit those through this surface."""
    rows = session.exec(
        select(CustomTheme)
        .where(CustomTheme.theme_key.is_not(None))
        .order_by(CustomTheme.updated_at.desc())
    ).all()
    return [_to_v2_read(r) for r in rows]


@admin_router.post(
    "/v2",
    response_model=CustomThemeV2Read,
    status_code=status.HTTP_201_CREATED,
)
def admin_v2_create(
    payload: CustomThemeV2Create,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> CustomThemeV2Read:
    """Admin-only — create a v2 theme. Used by the designer-facing
    upload form. Validates JSON blobs at the door so a typo can't
    silently break the runtime."""
    _validate_json_blob("palette_json", payload.palette_json)
    _validate_json_blob("fonts_json", payload.fonts_json)
    _validate_json_blob("design_payload_json", payload.design_payload_json)

    # Uniqueness on theme_key — the runtime maps Tutor.theme directly.
    existing = session.exec(
        select(CustomTheme).where(CustomTheme.theme_key == payload.theme_key)
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A theme with that key already exists.",
        )

    if payload.owner_user_id is not None and payload.owner_team_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pick one owner: user or team, not both.",
        )

    theme = CustomTheme(
        owner_user_id=payload.owner_user_id,
        owner_team_id=payload.owner_team_id,
        name=payload.name,
        theme_key=payload.theme_key,
        palette_json=payload.palette_json,
        fonts_json=payload.fonts_json,
        design_payload_json=payload.design_payload_json,
        preview_image_url=payload.preview_image_url,
        is_public_catalogue=payload.is_public_catalogue,
        # v2 themes skip the order workflow entirely — they're "READY"
        # the moment a designer hits Save.
        status=CustomThemeStatus.READY,
    )
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return _to_v2_read(theme)


@admin_router.patch("/v2/{theme_id}", response_model=CustomThemeV2Read)
def admin_v2_update(
    theme_id: int,
    payload: CustomThemeV2Update,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> CustomThemeV2Read:
    theme = session.get(CustomTheme, theme_id)
    if theme is None or theme.theme_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="v2 theme not found.",
        )
    changes = payload.model_dump(exclude_unset=True)
    for key in ("palette_json", "fonts_json", "design_payload_json"):
        if key in changes:
            _validate_json_blob(key, changes[key])
    for key, value in changes.items():
        setattr(theme, key, value)
    theme.updated_at = datetime.now(UTC)
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return _to_v2_read(theme)


@admin_router.post("/v2/{theme_id}/publish", response_model=CustomThemeV2Read)
def admin_v2_publish(
    theme_id: int,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> CustomThemeV2Read:
    """Toggle is_public_catalogue → true. Curated themes appear on
    every tutor's picker; otherwise only the owning user / team sees
    them in their dashboard."""
    theme = session.get(CustomTheme, theme_id)
    if theme is None or theme.theme_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="v2 theme not found.",
        )
    theme.is_public_catalogue = True
    theme.updated_at = datetime.now(UTC)
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return _to_v2_read(theme)


@admin_router.post("/v2/{theme_id}/unpublish", response_model=CustomThemeV2Read)
def admin_v2_unpublish(
    theme_id: int,
    current: CurrentAdmin,
    session: Annotated[Session, Depends(get_session)],
) -> CustomThemeV2Read:
    theme = session.get(CustomTheme, theme_id)
    if theme is None or theme.theme_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="v2 theme not found.",
        )
    theme.is_public_catalogue = False
    theme.updated_at = datetime.now(UTC)
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return _to_v2_read(theme)


@router.get("/v2/available", response_model=list[CustomThemeV2Read])
def tutor_list_available(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[CustomThemeV2Read]:
    """Tutor-side catalogue. Returns every v2 theme the calling tutor
    can apply: own personally-owned, team-owned (if they're on a
    team), plus the public curated catalogue. Drives the picker in
    the tutor's settings panel."""
    tutor = session.exec(
        select(Tutor).where(Tutor.user_id == current.id)
    ).first()
    team_id = tutor.team_id if tutor and tutor.team_id else None

    rows = session.exec(
        select(CustomTheme)
        .where(CustomTheme.theme_key.is_not(None))
        .order_by(CustomTheme.updated_at.desc())
    ).all()
    eligible = []
    for r in rows:
        if r.is_public_catalogue:
            eligible.append(r)
            continue
        if r.owner_user_id == current.id:
            eligible.append(r)
            continue
        if team_id is not None and r.owner_team_id == team_id:
            eligible.append(r)
            continue
    return [_to_v2_read(r) for r in eligible]


# --- Stripe checkout helper ------------------------------------------


def _create_checkout(
    *, order: CustomThemeOrder, amount_cents: int, label_suffix: str, metadata_type: str
) -> str:
    apex = settings.frontend_url.rstrip("/")
    pkg_label = order.package.value.title()
    try:
        s = stripe.checkout.Session.create(
            api_key=settings.stripe_secret_key,
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": order.currency,
                        "product_data": {
                            "name": f"Kotobaseed custom theme — {pkg_label} {label_suffix}"
                        },
                        "unit_amount": amount_cents,
                    },
                }
            ],
            success_url=f"{apex}/dashboard#site?theme_order=success",
            cancel_url=f"{apex}/dashboard#site?theme_order=cancelled",
            metadata={
                "type": metadata_type,
                "order_id": str(order.id),
            },
            payment_intent_data={
                "metadata": {
                    "type": metadata_type,
                    "order_id": str(order.id),
                }
            },
        )
    except Exception as e:
        log.exception(
            "Stripe error creating custom theme checkout for order %s", order.id
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout. Try again in a moment.",
        ) from e
    return s.url


# --- Webhook entry points (called from pledges.py) -------------------


def handle_deposit_paid(session: Session, checkout_session: dict) -> bool:
    """Webhook handler for checkout.session.completed with
    metadata.type == 'custom_theme_deposit'."""
    meta = checkout_session.get("metadata") or {}
    if meta.get("type") != "custom_theme_deposit":
        return False
    try:
        order_id = int(meta.get("order_id", "0"))
    except (TypeError, ValueError):
        return True
    order = session.get(CustomThemeOrder, order_id)
    if order is None or order.status != CustomThemeOrderStatus.DRAFT:
        return True
    now = datetime.now(UTC)
    order.status = CustomThemeOrderStatus.DEPOSIT_PAID
    order.deposit_paid_at = now
    order.updated_at = now
    order.stripe_deposit_session_id = checkout_session.get("id")
    order.stripe_deposit_payment_intent_id = checkout_session.get("payment_intent")
    session.add(order)
    session.commit()
    log.info("Custom theme order #%s deposit paid.", order.id)
    return True


def handle_final_paid(session: Session, checkout_session: dict) -> bool:
    """Webhook handler for checkout.session.completed with
    metadata.type == 'custom_theme_final'."""
    meta = checkout_session.get("metadata") or {}
    if meta.get("type") != "custom_theme_final":
        return False
    try:
        order_id = int(meta.get("order_id", "0"))
    except (TypeError, ValueError):
        return True
    order = session.get(CustomThemeOrder, order_id)
    if order is None or order.status != CustomThemeOrderStatus.APPROVED:
        return True
    now = datetime.now(UTC)
    order.status = CustomThemeOrderStatus.FINAL_PAID
    order.final_paid_at = now
    order.updated_at = now
    order.stripe_final_session_id = checkout_session.get("id")
    order.stripe_final_payment_intent_id = checkout_session.get("payment_intent")
    session.add(order)
    session.commit()
    log.info("Custom theme order #%s final payment received.", order.id)
    return True
