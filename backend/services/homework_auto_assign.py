"""Deprecated: legacy "auto-assign homework after every completed lesson".

Sophia retired this on 2026-06-09. The legacy model spammed homework on
every completed booking regardless of which lesson was taught — students
ended up doing the same homework after every class.

The replacement lives in the curriculum system: a tutor attaches
LessonHomeworkTemplate rows to a specific CurriculumLesson, and when the
tutor records a LessonDelivery for a student (from the dashboard or the
in-classroom presenter), every active template on that lesson auto-spawns
a HomeworkAssignment for that student only. See
backend/routers/curriculum.py::record_lesson_delivery.

This file stays so the import path from routers/recurring.py and friends
doesn't break, but the function is now a no-op. The DB column
`HomeworkTemplate.auto_assign_on_lesson_complete` is kept for back-compat
of historical rows but is ignored everywhere — the templates page also
hides the toggle and force-clears the flag on save.
"""

from __future__ import annotations

import logging

from sqlmodel import Session

from ..models import Booking, Tutor

log = logging.getLogger(__name__)


def assign_for_completed_booking(
    *, session: Session, tutor: Tutor, booking: Booking
) -> int:
    """No-op. Returns 0 so callers see "nothing auto-assigned" and
    don't surface a misleading toast or count."""
    return 0
