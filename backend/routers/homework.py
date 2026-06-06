"""Homework templates + assignments + submissions.

Two distinct route groups:
- Tutor-side (/tutor/homework/...) is tenant-scoped and owner-only.
- Student-side (/users/me/assignments/...) is auth-only — students see
  assignments across every tutor they've worked with.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    HomeworkAssignment,
    HomeworkAssignmentStatus,
    HomeworkSubmission,
    HomeworkTemplate,
    Tutor,
    User,
)
from ..services import homework_grading
from ..tenancy import CurrentTutor

log = logging.getLogger(__name__)
router = APIRouter(tags=["homework"])

# --- Helpers --------------------------------------------------------


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _validate_question(idx: int, q: dict[str, Any]) -> None:
    """Light schema check — full validation lives in the grading engine,
    which is forgiving. This catches the obvious malformed cases at write
    time so a corrupt template doesn't surface only at submission."""
    if not isinstance(q, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Question {idx + 1} is not an object.",
        )
    if not q.get("id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Question {idx + 1} needs an id.",
        )
    qtype = q.get("type")
    valid_types = {"mc_single", "mc_multi", "fill_blank", "short_answer"}
    if qtype not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Question {idx + 1} has unknown type {qtype!r}.",
        )
    if not q.get("prompt"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Question {idx + 1} needs a prompt.",
        )


def _validate_questions(questions: list[dict[str, Any]]) -> None:
    if not isinstance(questions, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Questions must be a list.",
        )
    seen_ids: set[str] = set()
    for idx, q in enumerate(questions):
        _validate_question(idx, q)
        qid = str(q["id"])
        if qid in seen_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate question id {qid!r}.",
            )
        seen_ids.add(qid)


# --- Tutor: templates ----------------------------------------------


tutor_router = APIRouter(prefix="/tutor/homework")


class HomeworkTemplateRead(BaseModel):
    id: int
    title: str
    description: str | None
    questions: list[dict[str, Any]]
    auto_assign_on_lesson_complete: bool
    is_active: bool
    is_premium: bool
    price_cents: int
    currency: str
    grading_price_cents: int
    max_score: int
    created_at: datetime
    updated_at: datetime


class HomeworkTemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    auto_assign_on_lesson_complete: bool = False
    is_active: bool = True
    is_premium: bool = False
    price_cents: int = Field(default=0, ge=0, le=10_000_00)
    currency: str = Field(default="eur", min_length=3, max_length=3)
    grading_price_cents: int = Field(default=0, ge=0, le=10_000_00)


class HomeworkTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    questions: list[dict[str, Any]] | None = None
    auto_assign_on_lesson_complete: bool | None = None
    is_active: bool | None = None
    is_premium: bool | None = None
    price_cents: int | None = Field(default=None, ge=0, le=10_000_00)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    grading_price_cents: int | None = Field(default=None, ge=0, le=10_000_00)


def _template_to_read(t: HomeworkTemplate) -> HomeworkTemplateRead:
    questions = homework_grading.parse_questions(t.questions_json)
    return HomeworkTemplateRead(
        id=t.id,
        title=t.title,
        description=t.description,
        questions=questions,
        auto_assign_on_lesson_complete=t.auto_assign_on_lesson_complete,
        is_active=t.is_active,
        is_premium=t.is_premium,
        price_cents=t.price_cents,
        currency=t.currency,
        grading_price_cents=t.grading_price_cents,
        max_score=homework_grading.compute_max_score(questions),
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@tutor_router.get("/templates", response_model=list[HomeworkTemplateRead])
def list_templates(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[HomeworkTemplateRead]:
    _require_owner(tutor, current)
    rows = session.exec(
        select(HomeworkTemplate)
        .where(HomeworkTemplate.tutor_id == tutor.id)
        .order_by(HomeworkTemplate.updated_at.desc())
    ).all()
    return [_template_to_read(r) for r in rows]


@tutor_router.post(
    "/templates",
    response_model=HomeworkTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
def create_template(
    payload: HomeworkTemplateCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> HomeworkTemplateRead:
    _require_owner(tutor, current)
    _validate_questions(payload.questions)
    row = HomeworkTemplate(
        tutor_id=tutor.id,
        title=payload.title,
        description=payload.description,
        questions_json=json.dumps(payload.questions),
        auto_assign_on_lesson_complete=payload.auto_assign_on_lesson_complete,
        is_active=payload.is_active,
        is_premium=payload.is_premium,
        price_cents=payload.price_cents,
        currency=payload.currency,
        grading_price_cents=payload.grading_price_cents,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _template_to_read(row)


@tutor_router.patch(
    "/templates/{template_id}", response_model=HomeworkTemplateRead
)
def update_template(
    template_id: int,
    payload: HomeworkTemplateUpdate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> HomeworkTemplateRead:
    _require_owner(tutor, current)
    row = session.get(HomeworkTemplate, template_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "questions" in changes:
        _validate_questions(changes["questions"])
        row.questions_json = json.dumps(changes["questions"])
    for field in (
        "title",
        "description",
        "auto_assign_on_lesson_complete",
        "is_active",
        "is_premium",
        "price_cents",
        "currency",
        "grading_price_cents",
    ):
        if field in changes:
            setattr(row, field, changes[field])
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _template_to_read(row)


@tutor_router.delete(
    "/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_template(
    template_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    _require_owner(tutor, current)
    row = session.get(HomeworkTemplate, template_id)
    if row is None or row.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
    # Soft delete — flip is_active. Assignments already cloned from this
    # template keep their snapshots intact.
    row.is_active = False
    row.updated_at = datetime.now(UTC)
    session.add(row)
    session.commit()


# --- Tutor: assignments --------------------------------------------


class HomeworkAssignmentRead(BaseModel):
    id: int
    tutor_id: int
    student_user_id: int
    student_name: str | None
    template_id: int | None
    title: str
    description: str | None
    questions: list[dict[str, Any]]
    max_score: int
    status: HomeworkAssignmentStatus
    due_at: datetime | None
    assigned_at: datetime
    grading_price_cents: int
    grading_currency: str
    submission_id: int | None
    submission_score: int | None  # uses manual_score if set else auto_score
    submission_needs_review: bool
    submission_awaiting_payment: bool
    submission_submitted_at: datetime | None


def _assignment_to_read(
    a: HomeworkAssignment,
    *,
    student: User | None,
    submission: HomeworkSubmission | None,
) -> HomeworkAssignmentRead:
    return HomeworkAssignmentRead(
        id=a.id,
        tutor_id=a.tutor_id,
        student_user_id=a.student_user_id,
        student_name=(student.full_name or student.username) if student else None,
        template_id=a.template_id,
        title=a.title,
        description=a.description,
        questions=homework_grading.parse_questions(a.questions_snapshot_json),
        max_score=a.max_score,
        status=a.status,
        due_at=a.due_at,
        assigned_at=a.assigned_at,
        grading_price_cents=a.grading_price_cents,
        grading_currency=a.grading_currency,
        submission_id=submission.id if submission else None,
        submission_score=(
            submission.manual_score
            if (submission and submission.manual_score is not None)
            else (submission.auto_score if submission else None)
        ),
        submission_needs_review=bool(
            submission
            and submission.needs_manual_review
            and submission.manual_score is None
            and submission.grading_paid
        ),
        submission_awaiting_payment=bool(
            submission and submission.needs_manual_review and not submission.grading_paid
        ),
        submission_submitted_at=submission.submitted_at if submission else None,
    )


def _load_submission(
    session: Session, assignment_id: int
) -> HomeworkSubmission | None:
    return session.exec(
        select(HomeworkSubmission).where(
            HomeworkSubmission.assignment_id == assignment_id
        )
    ).first()


@tutor_router.get("/assignments", response_model=list[HomeworkAssignmentRead])
def list_tutor_assignments(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[HomeworkAssignmentRead]:
    _require_owner(tutor, current)
    rows = session.exec(
        select(HomeworkAssignment)
        .where(HomeworkAssignment.tutor_id == tutor.id)
        .order_by(HomeworkAssignment.assigned_at.desc())
    ).all()
    if not rows:
        return []
    student_ids = {r.student_user_id for r in rows}
    students = {
        u.id: u
        for u in session.exec(select(User).where(User.id.in_(student_ids))).all()
    }
    out: list[HomeworkAssignmentRead] = []
    for a in rows:
        sub = _load_submission(session, a.id)
        out.append(
            _assignment_to_read(
                a, student=students.get(a.student_user_id), submission=sub
            )
        )
    return out


class HomeworkAssignmentCreate(BaseModel):
    student_user_id: int
    # Either provide a template_id (clone from a saved template) or pass
    # the full one-off question set inline.
    template_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    questions: list[dict[str, Any]] | None = None
    due_at: datetime | None = None


@tutor_router.post(
    "/assignments",
    response_model=HomeworkAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def assign_homework(
    payload: HomeworkAssignmentCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> HomeworkAssignmentRead:
    _require_owner(tutor, current)
    student = session.get(User, payload.student_user_id)
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found.",
        )

    template: HomeworkTemplate | None = None
    if payload.template_id is not None:
        template = session.get(HomeworkTemplate, payload.template_id)
        if template is None or template.tutor_id != tutor.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found.",
            )

    if template is not None:
        questions = homework_grading.parse_questions(template.questions_json)
        title = payload.title or template.title
        description = payload.description or template.description
    else:
        if payload.questions is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide either template_id or inline questions.",
            )
        _validate_questions(payload.questions)
        questions = payload.questions
        if not payload.title:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Title is required for inline assignments.",
            )
        title = payload.title
        description = payload.description

    a = HomeworkAssignment(
        tutor_id=tutor.id,
        student_user_id=student.id,
        template_id=template.id if template else None,
        title=title,
        description=description,
        questions_snapshot_json=json.dumps(questions),
        max_score=homework_grading.compute_max_score(questions),
        # Snapshot the template's per-grading price at clone time so a
        # later edit doesn't change what already-issued students owe.
        # Inline assignments default to 0 (free grading).
        grading_price_cents=template.grading_price_cents if template else 0,
        grading_currency=template.currency if template else "eur",
        due_at=payload.due_at,
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return _assignment_to_read(a, student=student, submission=None)


class HomeworkSubmissionGrade(BaseModel):
    manual_score: int = Field(ge=0)
    feedback: str | None = Field(default=None, max_length=4000)


@tutor_router.post(
    "/submissions/{submission_id}/grade",
    response_model=HomeworkAssignmentRead,
)
def grade_submission_endpoint(
    submission_id: int,
    payload: HomeworkSubmissionGrade,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> HomeworkAssignmentRead:
    """Tutor sets final score + feedback. Used for short_answer questions
    and any time the tutor wants to override the autograde."""
    _require_owner(tutor, current)
    sub = session.get(HomeworkSubmission, submission_id)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    assignment = session.get(HomeworkAssignment, sub.assignment_id)
    if assignment is None or assignment.tutor_id != tutor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    if payload.manual_score > sub.max_score:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Score can't exceed the max of {sub.max_score}.",
        )
    now = datetime.now(UTC)
    sub.manual_score = payload.manual_score
    sub.feedback = payload.feedback
    sub.needs_manual_review = False
    sub.graded_at = now
    sub.updated_at = now
    assignment.status = HomeworkAssignmentStatus.GRADED
    assignment.updated_at = now
    session.add(sub)
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    student = session.get(User, assignment.student_user_id)
    return _assignment_to_read(assignment, student=student, submission=sub)


router.include_router(tutor_router)


# --- Student-facing endpoints --------------------------------------


student_router = APIRouter(prefix="/users/me/assignments")


class StudentAssignmentRead(BaseModel):
    id: int
    tutor_id: int
    tutor_slug: str | None
    tutor_display_name: str | None
    title: str
    description: str | None
    max_score: int
    status: HomeworkAssignmentStatus
    due_at: datetime | None
    assigned_at: datetime
    grading_price_cents: int
    grading_currency: str
    # When fetching the detail (single) endpoint, questions are included;
    # the list endpoint returns an empty list to keep payloads small.
    questions: list[dict[str, Any]]
    submission_id: int | None
    submission_score: int | None
    submission_max_score: int | None
    submission_feedback: str | None
    submission_per_question: dict[str, Any] | None
    submission_submitted_at: datetime | None
    # True when there's a submission but it's blocked behind a grading
    # payment. UI shows "Pay €X" / "Use credit" actions.
    submission_awaiting_payment: bool = False
    # How many grading credits the student has banked for this tutor.
    credit_balance: int = 0


def _serialize_for_student(
    a: HomeworkAssignment,
    *,
    tutor: Tutor | None,
    submission: HomeworkSubmission | None,
    include_questions: bool,
    include_correct_answers: bool,
    credit_balance: int = 0,
) -> StudentAssignmentRead:
    questions = (
        homework_grading.parse_questions(a.questions_snapshot_json)
        if include_questions
        else []
    )
    if not include_correct_answers:
        # Strip the correct-answer fields so a student fetching the
        # take-quiz payload can't read them from the response.
        sanitized = []
        for q in questions:
            cleaned = {k: v for k, v in q.items() if k not in {"correct", "accepted_answers", "explanation"}}
            sanitized.append(cleaned)
        questions = sanitized
    per_q = None
    if submission is not None:
        try:
            per_q = json.loads(submission.per_question_results_json or "{}")
        except json.JSONDecodeError:
            per_q = None
    return StudentAssignmentRead(
        id=a.id,
        tutor_id=a.tutor_id,
        tutor_slug=tutor.tutor_slug if tutor else None,
        tutor_display_name=tutor.display_name if tutor else None,
        title=a.title,
        description=a.description,
        max_score=a.max_score,
        status=a.status,
        due_at=a.due_at,
        assigned_at=a.assigned_at,
        grading_price_cents=a.grading_price_cents,
        grading_currency=a.grading_currency,
        questions=questions,
        submission_id=submission.id if submission else None,
        submission_score=(
            submission.manual_score
            if (submission and submission.manual_score is not None)
            else (submission.auto_score if submission else None)
        ),
        submission_max_score=submission.max_score if submission else None,
        submission_feedback=submission.feedback if submission else None,
        submission_per_question=per_q,
        submission_submitted_at=submission.submitted_at if submission else None,
        submission_awaiting_payment=bool(
            submission and submission.needs_manual_review and not submission.grading_paid
        ),
        credit_balance=credit_balance,
    )


@student_router.get("", response_model=list[StudentAssignmentRead])
def list_my_assignments(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[StudentAssignmentRead]:
    rows = session.exec(
        select(HomeworkAssignment)
        .where(HomeworkAssignment.student_user_id == current.id)
        .order_by(HomeworkAssignment.assigned_at.desc())
    ).all()
    if not rows:
        return []
    tutor_ids = {r.tutor_id for r in rows}
    tutors = {
        t.id: t for t in session.exec(select(Tutor).where(Tutor.id.in_(tutor_ids))).all()
    }
    from ..services import grading_credits

    out: list[StudentAssignmentRead] = []
    # Cache balances per tutor — students with many assignments hit the
    # same tutor multiple times.
    balances: dict[int, int] = {}
    for a in rows:
        sub = _load_submission(session, a.id)
        if a.tutor_id not in balances:
            balances[a.tutor_id] = grading_credits.current_balance(
                session, tutor_id=a.tutor_id, student_user_id=current.id
            )
        out.append(
            _serialize_for_student(
                a,
                tutor=tutors.get(a.tutor_id),
                submission=sub,
                include_questions=False,
                include_correct_answers=False,
                credit_balance=balances[a.tutor_id],
            )
        )
    return out


@student_router.get("/{assignment_id}", response_model=StudentAssignmentRead)
def read_my_assignment(
    assignment_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> StudentAssignmentRead:
    a = session.get(HomeworkAssignment, assignment_id)
    if a is None or a.student_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found."
        )
    sub = _load_submission(session, a.id)
    tutor = session.get(Tutor, a.tutor_id)
    # If the student has already submitted, include correct answers in the
    # response so the results page can show them with their work. Pre-
    # submit, hide them so the form can't be cheated.
    include_correct = sub is not None
    from ..services import grading_credits

    return _serialize_for_student(
        a,
        tutor=tutor,
        submission=sub,
        include_questions=True,
        include_correct_answers=include_correct,
        credit_balance=grading_credits.current_balance(
            session, tutor_id=a.tutor_id, student_user_id=current.id
        ),
    )


class StudentSubmitRequest(BaseModel):
    answers: dict[str, Any]


@student_router.post(
    "/{assignment_id}/submit", response_model=StudentAssignmentRead
)
def submit_my_assignment(
    assignment_id: int,
    payload: StudentSubmitRequest,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> StudentAssignmentRead:
    """One-shot submit. Returns 409 if a submission already exists — students
    don't get a second try without the tutor explicitly reopening (admin
    feature, not built in v1)."""
    a = session.get(HomeworkAssignment, assignment_id)
    if a is None or a.student_user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found."
        )
    existing = _load_submission(session, a.id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You've already submitted this assignment.",
        )
    questions = homework_grading.parse_questions(a.questions_snapshot_json)
    result = homework_grading.grade_submission(questions, payload.answers)
    # Decide grading_paid: free if no manual review needed OR the
    # assignment has no per-grading fee. Otherwise the student needs to
    # either pay or spend a credit before the tutor sees the row.
    needs_review = result["needs_manual_review"]
    grading_paid = not needs_review or a.grading_price_cents <= 0
    sub = HomeworkSubmission(
        assignment_id=a.id,
        student_user_id=current.id,
        answers_json=json.dumps(payload.answers),
        per_question_results_json=json.dumps(result["per_question"]),
        auto_score=result["auto_score"],
        max_score=result["max_score"],
        needs_manual_review=needs_review,
        grading_paid=grading_paid,
    )
    session.add(sub)
    if not needs_review:
        a.status = HomeworkAssignmentStatus.GRADED
    else:
        a.status = HomeworkAssignmentStatus.SUBMITTED
    a.updated_at = datetime.now(UTC)
    session.add(a)
    session.commit()
    session.refresh(sub)
    session.refresh(a)
    tutor = session.get(Tutor, a.tutor_id)
    from ..services import grading_credits

    return _serialize_for_student(
        a,
        tutor=tutor,
        submission=sub,
        include_questions=True,
        include_correct_answers=True,
        credit_balance=grading_credits.current_balance(
            session, tutor_id=a.tutor_id, student_user_id=current.id
        ),
    )


@student_router.post(
    "/{assignment_id}/use-grading-credit",
    response_model=StudentAssignmentRead,
)
def use_grading_credit(
    assignment_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> StudentAssignmentRead:
    """Spend one grading credit to mark this submission paid. 409 if no
    credit available; 400 if not awaiting payment."""
    from ..models import HomeworkGradingPayment, HomeworkGradingPaymentKind
    from ..services import grading_credits

    a = session.get(HomeworkAssignment, assignment_id)
    if a is None or a.student_user_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")
    sub = _load_submission(session, a.id)
    if sub is None or sub.grading_paid or not sub.needs_manual_review:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This submission isn't waiting on a grading payment.",
        )
    if not grading_credits.spend_credit(
        session, tutor_id=a.tutor_id, student_user_id=current.id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You don't have any grading credits available.",
        )
    sub.grading_paid = True
    sub.updated_at = datetime.now(UTC)
    session.add(sub)
    session.add(
        HomeworkGradingPayment(
            submission_id=sub.id,
            tutor_id=a.tutor_id,
            student_user_id=current.id,
            kind=HomeworkGradingPaymentKind.CREDIT,
            amount_cents=0,
            platform_fee_cents=0,
            currency=a.grading_currency,
        )
    )
    session.commit()
    session.refresh(sub)
    tutor = session.get(Tutor, a.tutor_id)
    return _serialize_for_student(
        a,
        tutor=tutor,
        submission=sub,
        include_questions=True,
        include_correct_answers=True,
        credit_balance=grading_credits.current_balance(
            session, tutor_id=a.tutor_id, student_user_id=current.id
        ),
    )


class GradingCheckoutResponse(BaseModel):
    checkout_url: str


@student_router.post(
    "/{assignment_id}/grading-checkout",
    response_model=GradingCheckoutResponse,
)
def start_grading_checkout(
    assignment_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> GradingCheckoutResponse:
    """Stripe Connect checkout to pay for grading on this submission.
    Webhook flips grading_paid on success."""
    import os

    import stripe

    from ..services.platform_fees import content_platform_fee

    a = session.get(HomeworkAssignment, assignment_id)
    if a is None or a.student_user_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")
    sub = _load_submission(session, a.id)
    if sub is None or sub.grading_paid or not sub.needs_manual_review:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This submission isn't waiting on a grading payment.",
        )
    if a.grading_price_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This homework doesn't charge for grading.",
        )
    tutor = session.get(Tutor, a.tutor_id)
    if tutor is None or not tutor.stripe_connect_account_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tutor hasn't finished Stripe setup yet.",
        )

    fee = content_platform_fee(tutor.user, a.grading_price_cents)
    from ..config import settings

    frontend = settings.frontend_url.rstrip("/")
    if "localhost" in frontend:
        base = f"http://{tutor.tutor_slug}.localhost:5173"
    elif "://" in frontend:
        scheme, rest = frontend.split("://", 1)
        base = f"{scheme}://{tutor.tutor_slug}.{rest}"
    else:
        base = f"https://{tutor.tutor_slug}.{frontend}"
    try:
        stripe_sess = stripe.checkout.Session.create(
            api_key=os.environ.get("STRIPE_SECRET_KEY"),
            mode="payment",
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": a.grading_currency,
                        "product_data": {
                            "name": f"Grading: {a.title}",
                        },
                        "unit_amount": a.grading_price_cents,
                    },
                }
            ],
            payment_intent_data={
                "application_fee_amount": fee,
                "transfer_data": {"destination": tutor.stripe_connect_account_id},
            },
            success_url=f"{base}/student/assignments/{a.id}?graded=1",
            cancel_url=f"{base}/student/assignments/{a.id}",
            customer_email=current.email,
            metadata={
                "type": "homework_grading",
                "submission_id": str(sub.id),
                "tutor_id": str(a.tutor_id),
                "student_user_id": str(current.id),
                "platform_fee_cents": str(fee),
            },
        )
    except stripe.error.StripeError as exc:
        log.exception("Stripe error creating grading checkout")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe error: {exc.user_message or 'try again later.'}",
        ) from exc
    if not stripe_sess.url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe didn't return a checkout URL.",
        )
    return GradingCheckoutResponse(checkout_url=stripe_sess.url)


router.include_router(student_router)
