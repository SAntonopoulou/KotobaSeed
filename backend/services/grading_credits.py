"""Grading credit ledger: refill on subscription renewal + spend on submit.

Refill semantics:
- Initial subscribe → set available to monthly_grading_credits, stamp
  last_refilled_period_end so future refills can dedup.
- Renewal webhook (customer.subscription.updated with new period_end) →
  if credits_roll_over: add monthly_grading_credits to current balance.
  Otherwise: reset balance to monthly_grading_credits.
- Idempotent on (tutor_id, student_user_id, period_end): a duplicate
  webhook for the same period doesn't double-refill.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from ..models import (
    StudentGradingCreditBalance,
    StudentTutorSubscription,
    TutorSubscriptionPlan,
)


def _load_balance(
    session: Session, *, tutor_id: int, student_user_id: int
) -> StudentGradingCreditBalance | None:
    return session.exec(
        select(StudentGradingCreditBalance).where(
            StudentGradingCreditBalance.tutor_id == tutor_id,
            StudentGradingCreditBalance.student_user_id == student_user_id,
        )
    ).first()


def _load_plan(session: Session, tutor_id: int) -> TutorSubscriptionPlan | None:
    return session.exec(
        select(TutorSubscriptionPlan).where(
            TutorSubscriptionPlan.tutor_id == tutor_id
        )
    ).first()


def refill_for_subscription(
    *,
    session: Session,
    tutor_id: int,
    student_user_id: int,
    period_end: datetime | None,
    is_initial: bool,
) -> StudentGradingCreditBalance | None:
    """Idempotent refill triggered by subscription webhook.

    Returns the balance row after the refill, or None when there's no
    plan / no grading-credit configuration to apply.
    """
    plan = _load_plan(session, tutor_id)
    if plan is None or plan.monthly_grading_credits <= 0:
        return None
    monthly = plan.monthly_grading_credits
    balance = _load_balance(
        session, tutor_id=tutor_id, student_user_id=student_user_id
    )
    if balance is None:
        balance = StudentGradingCreditBalance(
            tutor_id=tutor_id,
            student_user_id=student_user_id,
            available=monthly,
            last_refilled_period_end=period_end,
        )
        session.add(balance)
        session.commit()
        session.refresh(balance)
        return balance
    # Dedup: if we've already refilled for this period_end, skip. SQLite
    # drops tzinfo on read, so compare as naive UTC.
    if (
        not is_initial
        and balance.last_refilled_period_end is not None
        and period_end is not None
    ):
        prior = balance.last_refilled_period_end
        target = period_end
        if prior.tzinfo is not None:
            prior = prior.replace(tzinfo=None)
        if target.tzinfo is not None:
            target = target.replace(tzinfo=None)
        if prior == target:
            return balance
    if is_initial or not plan.credits_roll_over:
        balance.available = monthly
    else:
        balance.available = balance.available + monthly
    balance.last_refilled_period_end = period_end
    balance.updated_at = datetime.now(__import__("datetime").timezone.utc)
    session.add(balance)
    session.commit()
    session.refresh(balance)
    return balance


def has_credit(
    session: Session, *, tutor_id: int, student_user_id: int
) -> bool:
    bal = _load_balance(
        session, tutor_id=tutor_id, student_user_id=student_user_id
    )
    return bal is not None and bal.available > 0


def spend_credit(
    session: Session, *, tutor_id: int, student_user_id: int
) -> bool:
    """Try to decrement one credit. Returns True on success, False when
    no credits are available."""
    bal = _load_balance(
        session, tutor_id=tutor_id, student_user_id=student_user_id
    )
    if bal is None or bal.available <= 0:
        return False
    bal.available -= 1
    bal.updated_at = datetime.now(__import__("datetime").timezone.utc)
    session.add(bal)
    session.commit()
    return True


def current_balance(
    session: Session, *, tutor_id: int, student_user_id: int
) -> int:
    bal = _load_balance(
        session, tutor_id=tutor_id, student_user_id=student_user_id
    )
    return bal.available if bal is not None else 0


def is_subscribed(
    session: Session, *, tutor_id: int, student_user_id: int
) -> bool:
    """True when the student has an active sub to this tutor. Used by the
    UI to decide whether to show the 'use credit' button."""
    sub = session.exec(
        select(StudentTutorSubscription).where(
            StudentTutorSubscription.tutor_id == tutor_id,
            StudentTutorSubscription.student_user_id == student_user_id,
        )
    ).first()
    if sub is None:
        return False
    return sub.status.value in ("active", "past_due")
