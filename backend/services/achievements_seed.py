"""Seed the platform Achievement catalogue.

Idempotent — run on startup (services/achievements_seed.seed(session))
and only inserts rows that don't already exist by `key`. Adding a new
achievement is a code change here + a corresponding award_achievement(...)
call wherever the unlock condition fires.
"""

from __future__ import annotations

import logging
from typing import Iterable

from sqlmodel import Session, select

from ..models import Achievement

log = logging.getLogger(__name__)

CATALOGUE: list[dict[str, str]] = [
    {
        "key": "first_steps",
        "name": "First steps",
        "description": "Accept your first request and start a project.",
    },
    {
        "key": "first_lesson",
        "name": "First lesson",
        "description": "Take or teach your first paid lesson on Kotobaseed.",
    },
    {
        "key": "consistent_learner",
        "name": "Consistent learner",
        "description": "Complete five lessons in a row without cancelling.",
    },
    {
        "key": "marathon_lesson",
        "name": "Marathon",
        "description": "Complete a 90-minute or longer lesson.",
    },
    {
        "key": "tutor_first_student",
        "name": "First student",
        "description": "Receive your first paid booking from a brand-new student.",
    },
    {
        "key": "tutor_full_house",
        "name": "Full house",
        "description": "Run a group lesson that hits its maximum seat count.",
    },
    {
        "key": "polyglot",
        "name": "Polyglot",
        "description": "Book lessons in two or more different languages.",
    },
    {
        "key": "supporter",
        "name": "Supporter",
        "description": "Pledge to a creator's marketplace project for the first time.",
    },
    {
        "key": "social_butterfly",
        "name": "Social butterfly",
        "description": "Refer a friend who completes their first paid lesson.",
    },
    {
        "key": "verified_tutor",
        "name": "Verified",
        "description": "Get a language verification approved by the platform.",
    },
]


def seed(session: Session) -> int:
    """Insert missing Achievement rows. Returns count newly inserted."""
    existing = set(
        session.exec(select(Achievement.key)).all()
    )
    n = 0
    for item in CATALOGUE:
        if item["key"] in existing:
            continue
        session.add(
            Achievement(
                key=item["key"],
                name=item["name"],
                description=item["description"],
            )
        )
        n += 1
    if n:
        session.commit()
        log.info("Seeded %d new achievement(s).", n)
    return n
