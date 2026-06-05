"""Lesson modules — per-tutor curriculum sold as one-time purchase.

A module bundles existing Articles + HomeworkTemplates into an ordered
sequence. The tutor sets a one-time price; students buy via Stripe
Connect with a tiered platform fee (10/7/5/0% by tier). On payment
success the webhook stamps a ModulePurchase, which gates access to the
content forever after.

This router covers:
- Tutor-side CRUD + item ordering (tenant-scoped, owner-only)
- Public storefront listing on the tutor's subdomain
- Stripe Connect checkout creation
- Student "my modules" feed (auth-only, cross-tenant)
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime
from typing import Annotated, Any

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser, get_current_user_optional
from ..models import (
    Article,
    HomeworkTemplate,
    LessonModule,
    ModulePurchase,
    Tutor,
    User,
)
from ..services.platform_fees import content_platform_fee
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(tags=["modules"])


_SLUG_NON_WORD = re.compile(r"[^a-z0-9-]+")
_SLUG_DASH_RUN = re.compile(r"-+")


def slugify(text: str) -> str:
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = ascii_text.lower()
    no_invalid = _SLUG_NON_WORD.sub("-", lowered)
    collapsed = _SLUG_DASH_RUN.sub("-", no_invalid).strip("-")
    return collapsed[:120] or "untitled"


def _unique_slug_for(base: str, tutor_id: int, session: Session, exclude_id: int | None = None) -> str:
    candidate = base or "untitled"
    suffix = 1
    while True:
        attempt = candidate if suffix == 1 else f"{candidate}-{suffix}"
        q = select(LessonModule).where(
            LessonModule.tutor_id == tutor_id, LessonModule.slug == attempt
        )
        if exclude_id is not None:
            q = q.where(LessonModule.id != exclude_id)
        if session.exec(q).first() is None:
            return attempt
        suffix += 1


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _parse_items(items_json: str) -> list[dict[str, Any]]:
    try:
        data = json.loads(items_json or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    valid: list[dict[str, Any]] = []
    for it in data:
        if not isinstance(it, dict):
            continue
        kind = it.get("kind")
        ref = it.get("ref_id")
        if kind not in ("article", "homework"):
            continue
        if not isinstance(ref, int):
            continue
        valid.append({"kind": kind, "ref_id": ref})
    return valid


def _validate_items(
    items: list[dict[str, Any]], tutor: Tutor, session: Session
) -> None:
    """Each referenced article/template must belong to this tutor."""
    article_ids = {it["ref_id"] for it in items if it["kind"] == "article"}
    hw_ids = {it["ref_id"] for it in items if it["kind"] == "homework"}
    if article_ids:
        owned = set(
            session.exec(
                select(Article.id).where(
                    Article.tutor_id == tutor.id, Article.id.in_(article_ids)
                )
            ).all()
        )
        missing = article_ids - owned
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Article(s) not yours or not found: {sorted(missing)}",
            )
    if hw_ids:
        owned = set(
            session.exec(
                select(HomeworkTemplate.id).where(
                    HomeworkTemplate.tutor_id == tutor.id,
                    HomeworkTemplate.id.in_(hw_ids),
                )
            ).all()
        )
        missing = hw_ids - owned
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Homework template(s) not yours or not found: {sorted(missing)}",
            )


# --- Schemas --------------------------------------------------------


class ModuleItem(BaseModel):
    kind: str = Field(pattern=r"^(article|homework)$")
    ref_id: int


class ModuleSummary(BaseModel):
    id: int
    slug: str
    title: str
    summary: str | None
    featured_image_url: str | None
    price_cents: int
    currency: str
    is_published: bool
    published_at: datetime | None
    item_count: int


class ModuleRead(ModuleSummary):
    description: str | None
    items: list[ModuleItem]
    purchased: bool = False


class ModuleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=4000)
    featured_image_url: str | None = Field(default=None, max_length=2048)
    items: list[ModuleItem] = Field(default_factory=list)
    price_cents: int = Field(default=0, ge=0, le=100_000_00)
    currency: str = Field(default="eur", min_length=3, max_length=3)
    is_published: bool = False
    slug: str | None = Field(default=None, max_length=120)


class ModuleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=4000)
    featured_image_url: str | None = Field(default=None, max_length=2048)
    items: list[ModuleItem] | None = None
    price_cents: int | None = Field(default=None, ge=0, le=100_000_00)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    is_published: bool | None = None
    slug: str | None = Field(default=None, max_length=120)


def _to_summary(m: LessonModule) -> ModuleSummary:
    items = _parse_items(m.items_json)
    return ModuleSummary(
        id=m.id,
        slug=m.slug,
        title=m.title,
        summary=m.summary,
        featured_image_url=m.featured_image_url,
        price_cents=m.price_cents,
        currency=m.currency,
        is_published=m.is_published,
        published_at=m.published_at,
        item_count=len(items),
    )


def _to_read(m: LessonModule, *, purchased: bool = False) -> ModuleRead:
    items = _parse_items(m.items_json)
    return ModuleRead(
        id=m.id,
        slug=m.slug,
        title=m.title,
        summary=m.summary,
        featured_image_url=m.featured_image_url,
        price_cents=m.price_cents,
        currency=m.currency,
        is_published=m.is_published,
        published_at=m.published_at,
        item_count=len(items),
        description=m.description,
        items=[ModuleItem(**it) for it in items],
        purchased=purchased,
    )


def _has_purchased(
    session: Session, *, module_id: int, student_id: int
) -> bool:
    return (
        session.exec(
            select(ModulePurchase).where(
                ModulePurchase.module_id == module_id,
                ModulePurchase.student_user_id == student_id,
            )
        ).first()
        is not None
    )


def _has_access(
    session: Session,
    *,
    module_id: int,
    tutor_id: int,
    student_id: int,
) -> bool:
    """Owns this module OR is subscribed to the tutor's content."""
    from ..services.content_access import has_module_access

    return has_module_access(
        session, module_id=module_id, tutor_id=tutor_id, student_user_id=student_id
    )


# --- Owner: CRUD ----------------------------------------------------


owner_router = APIRouter(prefix="/tutor/modules")


@owner_router.get("", response_model=list[ModuleSummary])
def list_owner_modules(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[ModuleSummary]:
    _require_owner(tutor, current)
    rows = session.exec(
        select(LessonModule)
        .where(LessonModule.tutor_id == tutor.id)
        .order_by(LessonModule.updated_at.desc())
    ).all()
    return [_to_summary(m) for m in rows]


@owner_router.post(
    "", response_model=ModuleRead, status_code=status.HTTP_201_CREATED
)
def create_module(
    payload: ModuleCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ModuleRead:
    _require_owner(tutor, current)
    items_dicts = [it.model_dump() for it in payload.items]
    _validate_items(items_dicts, tutor, session)
    base = slugify(payload.slug) if payload.slug else slugify(payload.title)
    slug = _unique_slug_for(base, tutor.id, session)
    now = datetime.now(UTC)
    row = LessonModule(
        tutor_id=tutor.id,
        slug=slug,
        title=payload.title,
        summary=payload.summary,
        description=payload.description,
        featured_image_url=payload.featured_image_url,
        items_json=json.dumps(items_dicts),
        price_cents=payload.price_cents,
        currency=payload.currency,
        is_published=payload.is_published,
        published_at=now if payload.is_published else None,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@owner_router.patch("/{module_id}", response_model=ModuleRead)
def update_module(
    module_id: int,
    payload: ModuleUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ModuleRead:
    _require_owner(tutor, current)
    row = session.get(LessonModule, module_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "items" in changes:
        items_dicts = [
            {"kind": it["kind"], "ref_id": int(it["ref_id"])} for it in changes["items"]
        ]
        _validate_items(items_dicts, tutor, session)
        row.items_json = json.dumps(items_dicts)
    if "slug" in changes:
        row.slug = _unique_slug_for(
            slugify(changes["slug"]), tutor.id, session, exclude_id=row.id
        )
    for field in (
        "title",
        "summary",
        "description",
        "featured_image_url",
        "price_cents",
        "currency",
    ):
        if field in changes:
            setattr(row, field, changes[field])
    if "is_published" in changes:
        was = row.is_published
        row.is_published = bool(changes["is_published"])
        if row.is_published and not was:
            row.published_at = datetime.now(UTC)
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


@owner_router.delete("/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(
    module_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Soft-delete via unpublish — purchases stay valid so the student
    keeps access to what they paid for."""
    _require_owner(tutor, current)
    row = session.get(LessonModule, module_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    row.is_published = False
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()


router.include_router(owner_router)


# --- Public storefront ----------------------------------------------


storefront_router = APIRouter(prefix="/modules")


@storefront_router.get("", response_model=list[ModuleSummary])
def list_public_modules(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[ModuleSummary]:
    rows = session.exec(
        select(LessonModule)
        .where(
            LessonModule.tutor_id == tutor.id,
            LessonModule.is_published == True,  # noqa: E712
        )
        .order_by(LessonModule.published_at.desc())
    ).all()
    return [_to_summary(m) for m in rows]


@storefront_router.get("/{slug}", response_model=ModuleRead)
def read_public_module(
    slug: str,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> ModuleRead:
    row = session.exec(
        select(LessonModule).where(
            LessonModule.tutor_id == tutor.id,
            LessonModule.slug == slug,
            LessonModule.is_published == True,  # noqa: E712
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    purchased = False
    if current is not None:
        purchased = _has_access(
            session, module_id=row.id, tutor_id=tutor.id, student_id=current.id
        )
    return _to_read(row, purchased=purchased)


router.include_router(storefront_router)


# --- Stripe checkout ------------------------------------------------


class ModuleCheckoutResponse(BaseModel):
    checkout_url: str


def _tenant_url(tutor: Tutor, path: str) -> str:
    from ..config import settings

    frontend = settings.frontend_url.rstrip("/")
    if "localhost" in frontend:
        return f"http://{tutor.tutor_slug}.localhost:5173{path}"
    if "://" in frontend:
        scheme, rest = frontend.split("://", 1)
        return f"{scheme}://{tutor.tutor_slug}.{rest}{path}"
    return f"https://{tutor.tutor_slug}.{frontend}{path}"


@router.post(
    "/tutor/modules/{module_id}/checkout",
    response_model=ModuleCheckoutResponse,
)
def start_module_checkout(
    module_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ModuleCheckoutResponse:
    """Student initiates Stripe Connect checkout for a published module.

    Idempotent on the student side: if they already own this module
    the endpoint returns 409 rather than creating a duplicate session.
    """
    module = session.get(LessonModule, module_id)
    if module is None or module.tutor_id != tutor.id or not module.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    if module.price_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This module isn't for sale.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't buy your own module.",
        )
    if _has_purchased(session, module_id=module.id, student_id=current.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already own this module.",
        )
    # If they're already a subscriber to this tutor's content, redirect
    # them to use that instead of double-charging.
    from ..services.content_access import has_active_subscription

    if has_active_subscription(
        session, tutor_id=tutor.id, student_user_id=current.id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already get this module through your subscription.",
        )
    if not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tutor hasn't finished Stripe setup yet.",
        )

    fee = content_platform_fee(tutor.user, module.price_cents)
    try:
        sess = stripe.checkout.Session.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": module.currency,
                        "product_data": {"name": module.title},
                        "unit_amount": module.price_cents,
                    },
                    "quantity": 1,
                }
            ],
            payment_intent_data={
                "application_fee_amount": fee,
                "transfer_data": {"destination": tutor.stripe_connect_account_id},
            },
            success_url=_tenant_url(tutor, f"/modules/{module.slug}?paid=1"),
            cancel_url=_tenant_url(tutor, f"/modules/{module.slug}"),
            customer_email=current.email,
            metadata={
                "type": "module",
                "module_id": str(module.id),
                "tutor_id": str(tutor.id),
                "student_user_id": str(current.id),
                "platform_fee_cents": str(fee),
            },
        )
    except stripe.error.StripeError as exc:
        log.exception("Stripe error creating module checkout")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {exc.user_message or 'try again later.'}",
        ) from exc
    if not sess.url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe didn't return a checkout URL.",
        )
    return ModuleCheckoutResponse(checkout_url=sess.url)


# --- Premium homework checkout --------------------------------------


class PremiumHomeworkCheckoutResponse(BaseModel):
    checkout_url: str


@router.post(
    "/tutor/homework/templates/{template_id}/checkout",
    response_model=PremiumHomeworkCheckoutResponse,
)
def start_premium_homework_checkout(
    template_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PremiumHomeworkCheckoutResponse:
    """Student initiates Stripe Connect checkout for a premium homework
    template. On success the webhook creates a HomeworkPurchase row +
    a fresh HomeworkAssignment so the student can start it immediately."""
    template = session.get(HomeworkTemplate, template_id)
    if (
        template is None
        or template.tutor_id != tutor.id
        or not template.is_active
        or not template.is_premium
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found."
        )
    if template.price_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This homework isn't for sale.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't buy your own homework.",
        )
    from ..models import HomeworkPurchase

    existing = session.exec(
        select(HomeworkPurchase).where(
            HomeworkPurchase.template_id == template.id,
            HomeworkPurchase.student_user_id == current.id,
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already own this homework.",
        )
    from ..services.content_access import has_active_subscription

    if has_active_subscription(
        session, tutor_id=tutor.id, student_user_id=current.id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already get this homework through your subscription.",
        )
    if not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tutor hasn't finished Stripe setup yet.",
        )

    fee = content_platform_fee(tutor.user, template.price_cents)
    try:
        sess = stripe.checkout.Session.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": template.currency,
                        "product_data": {"name": template.title},
                        "unit_amount": template.price_cents,
                    },
                    "quantity": 1,
                }
            ],
            payment_intent_data={
                "application_fee_amount": fee,
                "transfer_data": {"destination": tutor.stripe_connect_account_id},
            },
            success_url=_tenant_url(tutor, "/student/assignments?paid=1"),
            cancel_url=_tenant_url(tutor, "/modules"),
            customer_email=current.email,
            metadata={
                "type": "homework",
                "template_id": str(template.id),
                "tutor_id": str(tutor.id),
                "student_user_id": str(current.id),
                "platform_fee_cents": str(fee),
            },
        )
    except stripe.error.StripeError as exc:
        log.exception("Stripe error creating homework checkout")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {exc.user_message or 'try again later.'}",
        ) from exc
    if not sess.url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe didn't return a checkout URL.",
        )
    return PremiumHomeworkCheckoutResponse(checkout_url=sess.url)


# --- Student: my purchases -----------------------------------------


student_router = APIRouter(prefix="/users/me/modules")


class StudentModulePurchaseRead(BaseModel):
    purchase_id: int
    module_id: int
    tutor_slug: str | None
    tutor_display_name: str | None
    title: str
    slug: str
    summary: str | None
    featured_image_url: str | None
    paid_at: datetime


@student_router.get("", response_model=list[StudentModulePurchaseRead])
def list_my_module_purchases(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[StudentModulePurchaseRead]:
    rows = session.exec(
        select(ModulePurchase)
        .where(ModulePurchase.student_user_id == current.id)
        .order_by(ModulePurchase.paid_at.desc())
    ).all()
    if not rows:
        return []
    module_ids = {r.module_id for r in rows}
    modules = {
        m.id: m
        for m in session.exec(
            select(LessonModule).where(LessonModule.id.in_(module_ids))
        ).all()
    }
    tutor_ids = {r.tutor_id for r in rows}
    tutors = {
        t.id: t for t in session.exec(select(Tutor).where(Tutor.id.in_(tutor_ids))).all()
    }
    out: list[StudentModulePurchaseRead] = []
    for r in rows:
        m = modules.get(r.module_id)
        t = tutors.get(r.tutor_id)
        if m is None:
            continue
        out.append(
            StudentModulePurchaseRead(
                purchase_id=r.id,
                module_id=m.id,
                tutor_slug=t.tutor_slug if t else None,
                tutor_display_name=t.display_name if t else None,
                title=m.title,
                slug=m.slug,
                summary=m.summary,
                featured_image_url=m.featured_image_url,
                paid_at=r.paid_at,
            )
        )
    return out


router.include_router(student_router)
