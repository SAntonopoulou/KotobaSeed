"""Referral + affiliate program logic.

Three programs share one substrate (ReferralCode → ReferralAttribution →
ReferralReward):

- Tutor peer: milestone bonuses €5 / €25 / €75 / €200 (cap €305)
- Student peer: €10 lesson credit to referrer + €5 off referee's first
- Affiliate: flat €50 per qualified tutor + €10 per qualified student

Qualification triggers on the first completed paid lesson for the
referee. Tutor-peer milestones beyond first lesson trigger on cumulative
revenue thresholds.
"""

from __future__ import annotations

import logging
import secrets
import string
from datetime import UTC, datetime

from sqlmodel import Session, select

from ..models import (
    Booking,
    BookingStatus,
    LessonCredit,
    ReferralAttribution,
    ReferralCode,
    ReferralCodeKind,
    ReferralReward,
    ReferralRewardKind,
    ReferralRewardStatus,
    User,
    UserRole,
)

log = logging.getLogger(__name__)

# Tutor peer milestone table — cumulative revenue thresholds in cents.
TUTOR_PEER_MILESTONES: list[tuple[str, int, int]] = [
    # (key, revenue_cents_required, bonus_cents)
    ("first_lesson", 0, 500),  # €5 on first completed paid lesson
    ("rev_500", 50_000, 2500),  # €25 at €500 cumulative revenue
    ("rev_2000", 200_000, 7500),  # €75 at €2000
    ("rev_10000", 1_000_000, 20000),  # €200 at €10000
]


def _alphabet() -> str:
    return string.ascii_uppercase + string.digits


def _new_code(session: Session, length: int = 8) -> str:
    """Generate a non-colliding referral code. Excludes 0/O/1/I to avoid
    transcription mistakes."""
    excluded = "01OI"
    alphabet = "".join(c for c in _alphabet() if c not in excluded)
    for _ in range(20):
        candidate = "".join(secrets.choice(alphabet) for _ in range(length))
        existing = session.exec(
            select(ReferralCode).where(ReferralCode.code == candidate)
        ).first()
        if existing is None:
            return candidate
    raise RuntimeError("Couldn't generate a unique referral code.")


def ensure_codes_for_user(session: Session, user: User) -> list[ReferralCode]:
    """Make sure the user has the personal codes they qualify for. Idempotent.

    Every user gets a STUDENT_PEER code. Users with a CREATOR role also get
    a TUTOR_PEER code. Affiliate codes are admin-issued on application
    approval, never auto-created.
    """
    out: list[ReferralCode] = list(
        session.exec(
            select(ReferralCode).where(ReferralCode.user_id == user.id)
        ).all()
    )
    existing_kinds = {c.kind for c in out}
    if ReferralCodeKind.STUDENT_PEER not in existing_kinds:
        code = ReferralCode(
            user_id=user.id,
            code=_new_code(session),
            kind=ReferralCodeKind.STUDENT_PEER,
        )
        session.add(code)
        out.append(code)
    if (
        user.role == UserRole.CREATOR
        and ReferralCodeKind.TUTOR_PEER not in existing_kinds
    ):
        code = ReferralCode(
            user_id=user.id,
            code=_new_code(session),
            kind=ReferralCodeKind.TUTOR_PEER,
        )
        session.add(code)
        out.append(code)
    session.commit()
    return out


def attribute_signup(
    session: Session, *, referred_user: User, code_str: str
) -> ReferralAttribution | None:
    """Stamp an attribution row when a new user signs up with `?ref=CODE`.

    Returns None if the code doesn't exist or the user is referring
    themselves. Already-existing attribution for this user is treated as
    a no-op (the first referrer wins).
    """
    if not code_str:
        return None
    code = session.exec(
        select(ReferralCode).where(ReferralCode.code == code_str.upper().strip())
    ).first()
    if code is None or code.user_id == referred_user.id:
        return None
    existing = session.exec(
        select(ReferralAttribution).where(
            ReferralAttribution.referred_user_id == referred_user.id
        )
    ).first()
    if existing is not None:
        return existing
    attr = ReferralAttribution(
        code_id=code.id,
        referrer_user_id=code.user_id,
        referred_user_id=referred_user.id,
        kind=code.kind,
    )
    session.add(attr)
    session.commit()
    session.refresh(attr)
    return attr


def _grant_lesson_credit(
    session: Session, user_id: int, amount_cents: int, *, source: str, source_id: int
) -> LessonCredit:
    credit = LessonCredit(
        user_id=user_id,
        amount_cents=amount_cents,
        source=source,
        source_id=source_id,
    )
    session.add(credit)
    return credit


def _has_reward(
    session: Session,
    *,
    attribution_id: int,
    kind: ReferralRewardKind,
    milestone_key: str | None,
) -> bool:
    return (
        session.exec(
            select(ReferralReward).where(
                ReferralReward.attribution_id == attribution_id,
                ReferralReward.kind == kind,
                ReferralReward.milestone_key == milestone_key,
            )
        ).first()
        is not None
    )


def _completed_paid_lessons(session: Session, user_id: int) -> list[Booking]:
    """Bookings the user has TAKEN (as student) that completed and were paid."""
    return list(
        session.exec(
            select(Booking).where(
                Booking.student_user_id == user_id,
                Booking.status == BookingStatus.COMPLETED,
                Booking.price_cents > 0,
            )
        ).all()
    )


def _completed_revenue_as_tutor(session: Session, tutor_user_id: int) -> int:
    """Cumulative gross revenue from completed lessons the user has TAUGHT.
    `tutor_user_id` is the User.id of the tutor (looked up via Tutor.user_id)."""
    from ..models import Tutor

    tutor = session.exec(select(Tutor).where(Tutor.user_id == tutor_user_id)).first()
    if tutor is None:
        return 0
    rows = session.exec(
        select(Booking).where(
            Booking.tutor_id == tutor.id,
            Booking.status == BookingStatus.COMPLETED,
        )
    ).all()
    return sum(b.price_cents for b in rows)


def evaluate_attribution(
    session: Session, attribution: ReferralAttribution
) -> list[ReferralReward]:
    """Issue any newly-earned rewards for the given attribution. Idempotent —
    a reward kind+milestone_key is granted at most once per attribution."""
    newly: list[ReferralReward] = []
    referred = session.get(User, attribution.referred_user_id)
    if referred is None or referred.deleted_at is not None:
        return newly
    now = datetime.now(UTC)

    if attribution.kind == ReferralCodeKind.STUDENT_PEER:
        # Both sides get a one-shot reward when the referee completes
        # their first paid lesson.
        completed = _completed_paid_lessons(session, referred.id)
        if not completed:
            return newly
        # Referrer side: €10 lesson credit.
        if not _has_reward(
            session,
            attribution_id=attribution.id,
            kind=ReferralRewardKind.STUDENT_PEER_CREDIT,
            milestone_key=None,
        ):
            credit = _grant_lesson_credit(
                session,
                attribution.referrer_user_id,
                1000,
                source="referral",
                source_id=attribution.id,
            )
            session.flush()
            reward = ReferralReward(
                referrer_user_id=attribution.referrer_user_id,
                attribution_id=attribution.id,
                kind=ReferralRewardKind.STUDENT_PEER_CREDIT,
                milestone_key=None,
                amount_cents=1000,
                status=ReferralRewardStatus.PAID,
                paid_at=now,
                paid_via=f"lesson_credit:{credit.id}",
            )
            session.add(reward)
            newly.append(reward)
        if attribution.first_qualified_at is None:
            attribution.first_qualified_at = now
            attribution.qualifying_amount_cents = completed[0].price_cents
            session.add(attribution)

    elif attribution.kind == ReferralCodeKind.TUTOR_PEER:
        # Referred user is a CREATOR/tutor. Cumulative revenue → milestone bonuses.
        revenue = _completed_revenue_as_tutor(session, referred.id)
        for key, threshold, bonus in TUTOR_PEER_MILESTONES:
            if revenue < threshold:
                break  # later thresholds also unmet
            if _has_reward(
                session,
                attribution_id=attribution.id,
                kind=ReferralRewardKind.TUTOR_PEER_MILESTONE,
                milestone_key=key,
            ):
                continue
            reward = ReferralReward(
                referrer_user_id=attribution.referrer_user_id,
                attribution_id=attribution.id,
                kind=ReferralRewardKind.TUTOR_PEER_MILESTONE,
                milestone_key=key,
                amount_cents=bonus,
                status=ReferralRewardStatus.PENDING,
            )
            session.add(reward)
            newly.append(reward)
        if newly and attribution.first_qualified_at is None:
            attribution.first_qualified_at = now
            attribution.qualifying_amount_cents = revenue
            session.add(attribution)

    elif attribution.kind == ReferralCodeKind.AFFILIATE:
        # Affiliate gets a flat reward when the referee completes their
        # first qualifying action — €50 if they're a tutor doing first
        # paid lesson, €10 if they're a student doing first paid lesson.
        if referred.role == UserRole.CREATOR:
            kind = ReferralRewardKind.AFFILIATE_TUTOR
            amount = 5000
            qualified = _completed_revenue_as_tutor(session, referred.id) > 0
        else:
            kind = ReferralRewardKind.AFFILIATE_STUDENT
            amount = 1000
            qualified = bool(_completed_paid_lessons(session, referred.id))
        if not qualified:
            return newly
        if _has_reward(
            session,
            attribution_id=attribution.id,
            kind=kind,
            milestone_key=None,
        ):
            return newly
        reward = ReferralReward(
            referrer_user_id=attribution.referrer_user_id,
            attribution_id=attribution.id,
            kind=kind,
            milestone_key=None,
            amount_cents=amount,
            status=ReferralRewardStatus.PENDING,
        )
        session.add(reward)
        newly.append(reward)
        if attribution.first_qualified_at is None:
            attribution.first_qualified_at = now
            session.add(attribution)

    if newly:
        session.commit()
    return newly


def sweep_attributions(session: Session) -> int:
    """Daily cron — re-evaluate every attribution to catch newly-met
    milestones. Idempotent by virtue of `_has_reward`."""
    attrs = list(session.exec(select(ReferralAttribution)).all())
    n = 0
    for a in attrs:
        try:
            newly = evaluate_attribution(session, a)
            n += len(newly)
        except Exception:
            log.exception("Failed to evaluate attribution %s", a.id)
    return n
