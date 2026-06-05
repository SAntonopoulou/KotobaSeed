"""Helpers that answer "does this student have access to that tutor's
premium content?"

Access is granted when:
- The student bought the specific item one-time (ModulePurchase /
  HomeworkPurchase), OR
- They have an active subscription to that tutor's content (status in
  active/past_due AND current_period_end > now). PAST_DUE counts as
  active so a delayed renewal doesn't lock them out mid-month — Stripe
  will mark them UNPAID / CANCELLED eventually if it doesn't recover.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import Session, select

from ..models import (
    HomeworkPurchase,
    ModulePurchase,
    StudentTutorSubscription,
    TutorSubscriptionStatus,
)

_ACCESS_GRANTING_STATUSES = (
    TutorSubscriptionStatus.ACTIVE,
    TutorSubscriptionStatus.PAST_DUE,
)


def has_active_subscription(
    session: Session, *, tutor_id: int, student_user_id: int
) -> bool:
    sub = session.exec(
        select(StudentTutorSubscription).where(
            StudentTutorSubscription.tutor_id == tutor_id,
            StudentTutorSubscription.student_user_id == student_user_id,
        )
    ).first()
    if sub is None or sub.status not in _ACCESS_GRANTING_STATUSES:
        return False
    period_end = sub.current_period_end
    if period_end is None:
        # No end stamped yet — be conservative and treat as inactive.
        return False
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=UTC)
    return period_end > datetime.now(UTC)


def has_module_access(
    session: Session, *, module_id: int, tutor_id: int, student_user_id: int
) -> bool:
    bought = session.exec(
        select(ModulePurchase).where(
            ModulePurchase.module_id == module_id,
            ModulePurchase.student_user_id == student_user_id,
        )
    ).first()
    if bought is not None and bought.refunded_at is None:
        return True
    return has_active_subscription(
        session, tutor_id=tutor_id, student_user_id=student_user_id
    )


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
    return has_active_subscription(
        session, tutor_id=tutor_id, student_user_id=student_user_id
    )
