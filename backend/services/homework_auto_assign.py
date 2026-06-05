"""Auto-assign homework templates after a lesson is completed.

Fires from the tutor's POST /tutor/bookings/{id}/complete endpoint. For
every active template the tutor has flagged with
`auto_assign_on_lesson_complete=True`, clone it into a fresh
HomeworkAssignment for the booking's student. Failures are swallowed so
a misconfigured template doesn't fail the booking completion itself.
"""

from __future__ import annotations

import contextlib
import json
import logging
from datetime import UTC, datetime

from sqlmodel import Session, select

from ..models import (
    Booking,
    HomeworkAssignment,
    HomeworkAssignmentStatus,
    HomeworkTemplate,
    Tutor,
)
from . import homework_grading

log = logging.getLogger(__name__)


def assign_for_completed_booking(
    *, session: Session, tutor: Tutor, booking: Booking
) -> int:
    """Clone every active auto-assign template for this tutor into a new
    HomeworkAssignment for booking.student_user_id. Returns count assigned."""
    templates = list(
        session.exec(
            select(HomeworkTemplate).where(
                HomeworkTemplate.tutor_id == tutor.id,
                HomeworkTemplate.is_active == True,  # noqa: E712
                HomeworkTemplate.auto_assign_on_lesson_complete == True,  # noqa: E712
            )
        ).all()
    )
    if not templates:
        return 0
    now = datetime.now(UTC)
    created = 0
    for template in templates:
        with contextlib.suppress(Exception):
            questions = homework_grading.parse_questions(template.questions_json)
            row = HomeworkAssignment(
                tutor_id=tutor.id,
                student_user_id=booking.student_user_id,
                template_id=template.id,
                title=template.title,
                description=template.description,
                questions_snapshot_json=json.dumps(questions),
                max_score=homework_grading.compute_max_score(questions),
                status=HomeworkAssignmentStatus.OPEN,
                assigned_at=now,
            )
            session.add(row)
            created += 1
    if created:
        session.commit()
    return created
