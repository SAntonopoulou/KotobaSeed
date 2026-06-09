"""Helpers that answer "does this student have access to that piece of
premium content?"

Access is granted when:
- The student bought the specific item one-time
  (ArticlePurchase / ModulePurchase / HomeworkPurchase), OR
- They hold a Plus-tier-or-higher User.subscription_tier — the
  platform-level Plus tier is the only "subscriber" concept we expose.
  Per-tutor subscriptions exist as DB scaffolding but aren't surfaced
  in the product (see project_paid_previews_shipped memory note for
  context).
"""

from __future__ import annotations

from sqlmodel import Session, select

from ..models import (
    ArticlePurchase,
    HomeworkPurchase,
    ModulePurchase,
    SubscriptionTier,
    User,
)

# Platform tiers that unlock premium content. PLUS is the customer-facing
# entry point; PRO and BUSINESS are tutor-side tiers but they include
# everything Plus gets (tutors are also students of someone else's
# content, in practice).
PREMIUM_ACCESS_TIERS = (
    SubscriptionTier.PLUS,
    SubscriptionTier.PRO,
    SubscriptionTier.BUSINESS,
)


def is_plus_or_higher(user: User | None) -> bool:
    """True if this user holds a platform tier that unlocks premium
    content. Anonymous viewers always return False."""
    if user is None:
        return False
    return user.subscription_tier in PREMIUM_ACCESS_TIERS


def has_article_access(
    session: Session,
    *,
    article_id: int,
    student_user: User,
) -> bool:
    """Access to a single premium article.

    Granted when the user is Plus+ tier OR has bought this specific
    article one-shot. Refunded purchases don't count.
    """
    if is_plus_or_higher(student_user):
        return True
    bought = session.exec(
        select(ArticlePurchase).where(
            ArticlePurchase.article_id == article_id,
            ArticlePurchase.student_user_id == student_user.id,
        )
    ).first()
    return bought is not None and bought.refunded_at is None


def has_module_access(
    session: Session,
    *,
    module_id: int,
    tutor_id: int,
    student_user_id: int,
) -> bool:
    """Access to a paid lesson module."""
    bought = session.exec(
        select(ModulePurchase).where(
            ModulePurchase.module_id == module_id,
            ModulePurchase.student_user_id == student_user_id,
        )
    ).first()
    if bought is not None and bought.refunded_at is None:
        return True
    # Plus+ users get included module access as part of the tier perks.
    user = session.get(User, student_user_id)
    return is_plus_or_higher(user)


def has_homework_access(
    session: Session,
    *,
    template_id: int,
    tutor_id: int,
    student_user_id: int,
) -> bool:
    bought = session.exec(
        select(HomeworkPurchase).where(
            HomeworkPurchase.template_id == template_id,
            HomeworkPurchase.student_user_id == student_user_id,
        )
    ).first()
    if bought is not None and bought.refunded_at is None:
        return True
    user = session.get(User, student_user_id)
    return is_plus_or_higher(user)


# Backwards-compatible alias for any code that still imports the old
# name. It now answers the new question — "does this user hold a Plus+
# tier?" — rather than the old per-tutor question. Treat as deprecated;
# new call sites should use is_plus_or_higher() directly.
def has_active_subscription(
    session: Session, *, tutor_id: int, student_user_id: int
) -> bool:
    user = session.get(User, student_user_id)
    return is_plus_or_higher(user)
