"""Per-tutor article CRUD + public reader.

Tenant-scoped: every endpoint resolves the current tutor via the tenancy
middleware. Public endpoints (`GET /articles`, `GET /articles/{slug}`)
serve only published articles; owner endpoints include drafts.

Slugs are auto-generated from the title when not provided, then
deduped against existing rows for this tutor by appending `-2`, `-3`, etc.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import UTC, datetime
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser, get_current_user_optional
from ..models import Article, ArticlePurchase, PremiumArticleRead, Tutor, User
from ..services.content_access import has_article_access, is_plus_or_higher
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(prefix="/articles", tags=["articles"])

# Flat platform fee on piecemeal article purchases — applied regardless
# of the tutor's subscription_tier, unlike modules. Sophia's call: keep
# the per-article market accessible to all tutors at the same price
# point, rather than rewarding tier-climbing here.
ARTICLE_PLATFORM_FEE_BPS = 1000  # 10.00 %


# --- Slug helpers --------------------------------------------------------


_SLUG_NON_WORD = re.compile(r"[^a-z0-9-]+")
_SLUG_DASH_RUN = re.compile(r"-+")


def slugify(text: str) -> str:
    """Lossy lowercase → ASCII-ish slug. Latin diacritics get folded; non-
    Latin scripts (Greek, Japanese, etc.) get stripped — tutors can hand-
    edit the slug if the auto version is empty."""
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = ascii_text.lower()
    no_invalid = _SLUG_NON_WORD.sub("-", lowered)
    collapsed = _SLUG_DASH_RUN.sub("-", no_invalid).strip("-")
    return collapsed[:120]


def _unique_slug_for(
    base: str, tutor_id: int, session: Session, exclude_id: int | None = None
) -> str:
    """Return `base` if unique for this tutor, else `base-2`, `base-3`, ..."""
    candidate = base or "untitled"
    suffix = 1
    while True:
        attempt = candidate if suffix == 1 else f"{candidate}-{suffix}"
        q = select(Article).where(
            Article.tutor_id == tutor_id,
            Article.slug == attempt,
        )
        if exclude_id is not None:
            q = q.where(Article.id != exclude_id)
        existing = session.exec(q).first()
        if existing is None:
            return attempt
        suffix += 1


# --- Schemas -------------------------------------------------------------


class ArticleSummary(BaseModel):
    """Card-shaped payload for list views."""

    id: int
    slug: str
    title: str
    summary: str | None
    is_published: bool
    visibility: str
    published_at: datetime | None
    updated_at: datetime
    price_cents: int = 0
    currency: str = "eur"
    comments_enabled: bool = False
    rating_avg: float | None = None
    rating_count: int = 0


class ArticleRead(ArticleSummary):
    """Full article body for the reader.

    Returns both representations — the reader prefers lexical_json when
    present (richer rendering with custom blocks) and falls back to
    body_markdown for articles saved by an older client.

    `is_preview` is True when the body fields contain a preview hook
    rather than the full article — non-subscribers viewing a
    subscribers-only article get this shape so the frontend knows to
    render a paywall CTA below the content. `purchased` is True when
    the viewer has piecemeal-bought this article.
    """

    body_markdown: str
    lexical_json: str | None
    preview_markdown: str | None = None
    is_preview: bool = False
    purchased: bool = False


class ArticleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    body_markdown: str = Field(default="", max_length=200_000)
    lexical_json: str | None = Field(default=None, max_length=500_000)
    preview_markdown: str | None = Field(default=None, max_length=10_000)
    price_cents: int = Field(default=0, ge=0, le=10_000_00)
    currency: str = Field(default="eur", min_length=3, max_length=3)
    slug: str | None = Field(default=None, max_length=120)
    is_published: bool = False
    comments_enabled: bool = False
    visibility: str = Field(
        default="public",
        pattern=r"^(public|subscribers_only|module_only)$",
    )


class ArticleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=500)
    body_markdown: str | None = Field(default=None, max_length=200_000)
    lexical_json: str | None = Field(default=None, max_length=500_000)
    preview_markdown: str | None = Field(default=None, max_length=10_000)
    price_cents: int | None = Field(default=None, ge=0, le=10_000_00)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    slug: str | None = Field(default=None, max_length=120)
    is_published: bool | None = None
    comments_enabled: bool | None = None
    visibility: str | None = Field(
        default=None,
        pattern=r"^(public|subscribers_only|module_only)$",
    )


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _to_summary(article: Article) -> ArticleSummary:
    return ArticleSummary(
        id=article.id,
        slug=article.slug,
        title=article.title,
        summary=article.summary,
        is_published=article.is_published,
        visibility=article.visibility,
        published_at=article.published_at,
        updated_at=article.updated_at,
        price_cents=article.price_cents,
        currency=article.currency,
        comments_enabled=article.comments_enabled,
        rating_avg=article.rating_avg,
        rating_count=article.rating_count,
    )


def _to_read(article: Article, *, purchased: bool = False) -> ArticleRead:
    return ArticleRead(
        id=article.id,
        slug=article.slug,
        title=article.title,
        summary=article.summary,
        body_markdown=article.body_markdown,
        lexical_json=article.lexical_json,
        preview_markdown=article.preview_markdown,
        is_published=article.is_published,
        visibility=article.visibility,
        published_at=article.published_at,
        updated_at=article.updated_at,
        is_preview=False,
        purchased=purchased,
        price_cents=article.price_cents,
        currency=article.currency,
        comments_enabled=article.comments_enabled,
        rating_avg=article.rating_avg,
        rating_count=article.rating_count,
    )


PREVIEW_WORD_BUDGET = 200


def _first_n_words(text: str, n: int = PREVIEW_WORD_BUDGET) -> str:
    """Take the first N whitespace-separated tokens from text, then trim
    trailing punctuation so the preview doesn't end mid-bullet or
    half-way through a markdown block. Deliberately blunt — tutors who
    care about the cut should write their own preview_markdown."""
    if not text:
        return ""
    words = text.split()
    if len(words) <= n:
        return text
    truncated = " ".join(words[:n])
    return truncated.rstrip(".,;:!?、。") + "…"


def _to_preview(article: Article) -> ArticleRead:
    """Return the non-subscriber view: tutor-written preview if set,
    else first-N-words fallback. body_markdown carries the preview text
    (so the frontend renders normally) and is_preview=True signals the
    paywall CTA."""
    body = article.preview_markdown or _first_n_words(article.body_markdown)
    return ArticleRead(
        id=article.id,
        slug=article.slug,
        title=article.title,
        summary=article.summary,
        body_markdown=body,
        # Don't return the lexical tree for previews — it would leak
        # the full body to anyone willing to grep the API response.
        lexical_json=None,
        preview_markdown=article.preview_markdown,
        is_published=article.is_published,
        visibility=article.visibility,
        published_at=article.published_at,
        updated_at=article.updated_at,
        is_preview=True,
        purchased=False,
        price_cents=article.price_cents,
        currency=article.currency,
        comments_enabled=article.comments_enabled,
        rating_avg=article.rating_avg,
        rating_count=article.rating_count,
    )


# --- Public reads --------------------------------------------------------


@router.get("", response_model=list[ArticleSummary])
def list_published_articles(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[ArticleSummary]:
    """Public — published, PUBLICLY-visible articles only. Subscriber-only
    and module-only articles are intentionally hidden from this feed so
    the public articles index stays focused on the tutor's free content."""
    rows = session.exec(
        select(Article)
        .where(
            Article.tutor_id == tutor.id,
            Article.is_published == True,  # noqa: E712
            Article.visibility == "public",
            Article.deleted_at.is_(None),
        )
        .order_by(Article.published_at.desc())
    ).all()
    return [_to_summary(r) for r in rows]


@router.get("/all", response_model=list[ArticleSummary])
def list_all_articles(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[ArticleSummary]:
    """Owner-only — includes drafts, newest first by updated_at so works-in-
    progress stay at the top of the dashboard list. Excludes soft-deleted."""
    _require_owner(tutor, current)
    rows = session.exec(
        select(Article)
        .where(Article.tutor_id == tutor.id, Article.deleted_at.is_(None))
        .order_by(Article.updated_at.desc())
    ).all()
    return [_to_summary(r) for r in rows]


@router.get("/{slug}", response_model=ArticleRead)
def read_article_by_slug(
    slug: str,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
    current: Annotated[User | None, Depends(get_current_user_optional)] = None,
) -> ArticleRead:
    """Single published article by slug.

    Visibility rules:
    - public → anyone reads
    - subscribers_only → active subscribers (or the tutor) read full body;
      everyone else gets a preview shape so they can decide whether to
      subscribe
    - module_only → only students who own a module containing it OR
      active subscribers (or the tutor) read it; everyone else 404s
      because module-only articles aren't standalone — their preview
      lives inside the parent module's storefront page

    The deliberate split: subscribers-only articles are advertised
    individually (preview shape), module-only articles are advertised
    as part of a module (404 from this endpoint).
    """
    article = session.exec(
        select(Article).where(
            Article.tutor_id == tutor.id,
            Article.slug == slug,
            Article.is_published == True,  # noqa: E712
            Article.deleted_at.is_(None),
        )
    ).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    if article.visibility == "public":
        return _to_read(article)
    # The owner can always read their own articles regardless of visibility.
    if current is not None and current.id == tutor.user_id:
        return _to_read(article)
    # Subscribers-only articles show the preview shape to anyone — even
    # anonymous visitors — so prospects can sample before subscribing.
    # Unlock when: viewer has Plus+ tier OR bought this article piecemeal.
    if article.visibility == "subscribers_only":
        if current is None:
            return _to_preview(article)
        if has_article_access(
            session, article_id=article.id, student_user=current
        ):
            return _to_read(article, purchased=not is_plus_or_higher(current))
        return _to_preview(article)
    # Module-only path: the article doesn't have a standalone advertised
    # face, so we 404 anonymous and non-purchasers.
    if current is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    if is_plus_or_higher(current):
        return _to_read(article)
    if article.visibility == "module_only":
        # Find module purchases for this student against this tutor, then
        # see whether any of those module item lists references this article.
        from ..models import LessonModule, ModulePurchase
        from ..routers.modules import _parse_items

        purchase_rows = session.exec(
            select(ModulePurchase).where(
                ModulePurchase.tutor_id == tutor.id,
                ModulePurchase.student_user_id == current.id,
                ModulePurchase.refunded_at == None,  # noqa: E711
            )
        ).all()
        module_ids = [p.module_id for p in purchase_rows]
        if module_ids:
            owned_modules = session.exec(
                select(LessonModule).where(LessonModule.id.in_(module_ids))
            ).all()
            for m in owned_modules:
                for it in _parse_items(m.items_json):
                    if it["kind"] == "article" and it["ref_id"] == article.id:
                        return _to_read(article)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")


# --- Owner writes --------------------------------------------------------


@router.get("/{slug}/draft", response_model=ArticleRead)
def read_article_draft(
    slug: str,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    """Owner-only — fetch any article (draft or published) by slug for the
    editor. Separate path from the public reader so 404 stays unambiguous."""
    _require_owner(tutor, current)
    article = session.exec(
        select(Article).where(
            Article.tutor_id == tutor.id,
            Article.slug == slug,
            Article.deleted_at.is_(None),
        )
    ).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    return _to_read(article)


@router.post("", response_model=ArticleRead, status_code=status.HTTP_201_CREATED)
def create_article(
    payload: ArticleCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    _require_owner(tutor, current)
    base_slug = slugify(payload.slug) if payload.slug else slugify(payload.title)
    slug = _unique_slug_for(base_slug, tutor.id, session)
    now = datetime.now(UTC)
    article = Article(
        tutor_id=tutor.id,
        slug=slug,
        title=payload.title,
        summary=payload.summary,
        body_markdown=payload.body_markdown,
        lexical_json=payload.lexical_json,
        preview_markdown=payload.preview_markdown,
        price_cents=payload.price_cents,
        currency=payload.currency,
        comments_enabled=payload.comments_enabled,
        is_published=payload.is_published,
        visibility=payload.visibility,
        published_at=now if payload.is_published else None,
    )
    session.add(article)
    session.commit()
    session.refresh(article)
    return _to_read(article)


@router.patch("/{article_id}", response_model=ArticleRead)
def update_article(
    article_id: int,
    payload: ArticleUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    _require_owner(tutor, current)
    article = session.get(Article, article_id)
    if article is None or article.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        article.title = changes["title"]
    if "summary" in changes:
        article.summary = changes["summary"]
    if "body_markdown" in changes:
        article.body_markdown = changes["body_markdown"]
    if "lexical_json" in changes:
        article.lexical_json = changes["lexical_json"]
    if "preview_markdown" in changes:
        article.preview_markdown = changes["preview_markdown"]
    if "price_cents" in changes:
        article.price_cents = changes["price_cents"]
    if "currency" in changes:
        article.currency = changes["currency"]
    if "comments_enabled" in changes and changes["comments_enabled"] is not None:
        article.comments_enabled = bool(changes["comments_enabled"])
    if "slug" in changes:
        new_base = slugify(changes["slug"])
        # Dedup against everyone but this article's own row.
        article.slug = _unique_slug_for(new_base, tutor.id, session, exclude_id=article.id)
    if "is_published" in changes:
        was_published = article.is_published
        article.is_published = bool(changes["is_published"])
        if article.is_published and not was_published:
            # First time publishing — stamp now. Re-publishing later
            # preserves the original published_at so syndication readers
            # don't re-surface old posts as new.
            article.published_at = datetime.now(UTC)
    if "visibility" in changes:
        article.visibility = changes["visibility"]
    article.updated_at = datetime.now(UTC)
    session.add(article)
    session.commit()
    session.refresh(article)
    return _to_read(article)


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Owner-only — soft delete. List endpoints filter `deleted_at IS NOT NULL`
    so the article disappears from the dashboard + public site immediately.
    POST /:id/restore brings it back; deleted articles past 30 days could be
    hard-purged by a cron job later but we don't do that yet."""
    _require_owner(tutor, current)
    article = session.get(Article, article_id)
    if article is None or article.tutor_id != tutor.id or article.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    article.deleted_at = datetime.now(UTC)
    article.updated_at = datetime.now(UTC)
    session.add(article)
    session.commit()


@router.post("/{article_id}/restore", response_model=ArticleRead)
def restore_article(
    article_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleRead:
    """Undo a soft delete. Owner only."""
    _require_owner(tutor, current)
    article = session.get(Article, article_id)
    if article is None or article.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    if article.deleted_at is None:
        return _to_read(article)
    article.deleted_at = None
    article.updated_at = datetime.now(UTC)
    session.add(article)
    session.commit()
    session.refresh(article)
    return _to_read(article)


# --- Piecemeal purchase + read tracking -----------------------------------


class ArticleCheckoutResponse(BaseModel):
    checkout_url: str


class ArticleCheckoutBody(BaseModel):
    # EU Consumer Rights Directive 2011/83 Article 16(m): for digital
    # content delivered immediately, the buyer must give prior express
    # consent waiving the 14-day right of withdrawal. We require an
    # explicit True before letting the Stripe session start.
    waive_withdrawal: bool = False


def _tenant_url(tutor: Tutor, path: str) -> str:
    from ..config import settings

    frontend = settings.frontend_url.rstrip("/")
    if "localhost" in frontend:
        return f"http://{tutor.tutor_slug}.localhost:5173{path}"
    if "://" in frontend:
        scheme, rest = frontend.split("://", 1)
        return f"{scheme}://{tutor.tutor_slug}.{rest}{path}"
    return f"https://{tutor.tutor_slug}.{frontend}{path}"


@router.post("/{article_id}/checkout", response_model=ArticleCheckoutResponse)
def start_article_checkout(
    article_id: int,
    payload: ArticleCheckoutBody,
    request: Request,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ArticleCheckoutResponse:
    """Student initiates a piecemeal Stripe Connect checkout for one
    subscribers-only article.

    Free students hit this path; Plus+ subscribers don't — their gate
    opens via tier. We collect a flat 10% platform fee regardless of
    tutor tier and route the rest to the tutor's connected account.
    """
    if not payload.waive_withdrawal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Please confirm you want immediate access and waive your "
                "14-day right of withdrawal before purchasing."
            ),
        )
    article = session.get(Article, article_id)
    if (
        article is None
        or article.tutor_id != tutor.id
        or not article.is_published
        or article.deleted_at is not None
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    if article.visibility != "subscribers_only":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only subscriber-only articles can be purchased piecemeal.",
        )
    if article.price_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This article isn't available for piecemeal purchase. Plus subscribers can read it free.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't buy your own article.",
        )
    if is_plus_or_higher(current):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your Plus subscription already unlocks this article.",
        )
    existing = session.exec(
        select(ArticlePurchase).where(
            ArticlePurchase.article_id == article.id,
            ArticlePurchase.student_user_id == current.id,
        )
    ).first()
    if existing is not None and existing.refunded_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already own this article.",
        )
    if not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tutor hasn't finished Stripe setup yet.",
        )

    fee = (article.price_cents * ARTICLE_PLATFORM_FEE_BPS) // 10_000
    waiver_at = datetime.now(UTC).isoformat()
    waiver_ip = (request.client.host if request.client else "") or ""
    try:
        sess = stripe.checkout.Session.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": article.currency,
                        "product_data": {"name": article.title},
                        "unit_amount": article.price_cents,
                    },
                    "quantity": 1,
                }
            ],
            payment_intent_data={
                "application_fee_amount": fee,
                "transfer_data": {"destination": tutor.stripe_connect_account_id},
            },
            success_url=_tenant_url(tutor, f"/articles/{article.slug}?paid=1"),
            cancel_url=_tenant_url(tutor, f"/articles/{article.slug}"),
            customer_email=current.email,
            metadata={
                "type": "article",
                "article_id": str(article.id),
                "tutor_id": str(tutor.id),
                "student_user_id": str(current.id),
                "platform_fee_cents": str(fee),
                "withdrawal_waiver_at": waiver_at,
                "withdrawal_waiver_ip": waiver_ip[:64],
            },
        )
    except stripe.error.StripeError as exc:
        log.exception("Stripe error creating article checkout")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {exc.user_message or 'try again later.'}",
        ) from exc
    if not sess.url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe didn't return a checkout URL.",
        )
    return ArticleCheckoutResponse(checkout_url=sess.url)


class ReadRegisterPayload(BaseModel):
    """Client reports how long they spent + how far they scrolled.
    We enforce both as a soft anti-gaming gate before we count it."""

    dwell_seconds: int = Field(ge=0, le=86_400)
    scroll_percent: int = Field(ge=0, le=100)


class ReadRegisterResponse(BaseModel):
    counted: bool
    reason: str | None = None


# Anti-gaming thresholds. Sized so a serious reader hits them easily on
# a typical article but a refresh-spam loop can't.
READ_MIN_DWELL_SECONDS = 30
READ_MIN_SCROLL_PERCENT = 50


@router.post("/{article_id}/read", response_model=ReadRegisterResponse)
def register_premium_read(
    article_id: int,
    payload: ReadRegisterPayload,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ReadRegisterResponse:
    """Mark a premium article as read by this user (this month) so the
    end-of-month creator-pool payout can credit the tutor.

    Only Plus+ subscribers can generate reads — piecemeal buyers don't
    contribute to the pool (their purchase already paid the tutor).
    The frontend gates the POST behind a dwell timer + scroll
    threshold; we re-check those server-side as a belt-and-braces step.
    """
    if not is_plus_or_higher(current):
        return ReadRegisterResponse(counted=False, reason="not_plus")
    if payload.dwell_seconds < READ_MIN_DWELL_SECONDS:
        return ReadRegisterResponse(counted=False, reason="dwell_too_short")
    if payload.scroll_percent < READ_MIN_SCROLL_PERCENT:
        return ReadRegisterResponse(counted=False, reason="scroll_too_shallow")
    article = session.get(Article, article_id)
    if (
        article is None
        or article.tutor_id != tutor.id
        or article.visibility != "subscribers_only"
        or not article.is_published
        or article.deleted_at is not None
    ):
        return ReadRegisterResponse(counted=False, reason="not_premium")
    if current.id == tutor.user_id:
        # Self-reads don't count — the tutor reading their own work
        # shouldn't move money.
        return ReadRegisterResponse(counted=False, reason="own_article")
    bucket = datetime.now(UTC).strftime("%Y-%m")
    existing = session.exec(
        select(PremiumArticleRead).where(
            PremiumArticleRead.article_id == article.id,
            PremiumArticleRead.student_user_id == current.id,
            PremiumArticleRead.year_month == bucket,
        )
    ).first()
    if existing is not None:
        # Already counted this month — return the original record.
        return ReadRegisterResponse(counted=True, reason="already_counted")
    row = PremiumArticleRead(
        article_id=article.id,
        tutor_id=tutor.id,
        student_user_id=current.id,
        year_month=bucket,
        dwell_seconds=payload.dwell_seconds,
        scroll_percent=payload.scroll_percent,
    )
    session.add(row)
    session.commit()

    # Phase 4 — award leaderboard points + check badge ladder.
    from ..services.engagement import record_activity

    record_activity(
        session,
        user=current,
        kind="article_read",
        article=article,
        dedupe_key=f"article:{article.id}",
    )
    return ReadRegisterResponse(counted=True)
