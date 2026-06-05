"""Tutor placement test endpoints.

Tutor side (tenant-scoped, owner-only):
- GET /tutor/placement-test : current test for editor (with correct answers)
- PUT /tutor/placement-test : upsert
- DELETE /tutor/placement-test : soft-deactivate
- GET /tutor/placement-submissions : list student submissions

Student-facing (tenant-scoped, auth required):
- GET /tutor/placement-test/public : take-quiz payload (correct answers stripped)
- POST /tutor/placement-test/submit : grade + store, return result with bands
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import PlacementSubmission, PlacementTest, Tutor, User
from ..services import homework_grading
from ..tenancy import CurrentTutor

router = APIRouter(prefix="/tutor", tags=["placement-test"])


def _require_owner(tutor: Tutor, current: User) -> None:
    if tutor.user_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this tutor profile.",
        )


def _validate_questions(questions: list[dict[str, Any]]) -> None:
    """Mirror of homework's validator — kept duplicated rather than imported
    to keep the placement router self-contained."""
    if not isinstance(questions, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Questions must be a list.",
        )
    seen: set[str] = set()
    valid_types = {"mc_single", "mc_multi", "fill_blank", "short_answer"}
    for idx, q in enumerate(questions):
        if not isinstance(q, dict):
            raise HTTPException(status_code=400, detail=f"Question {idx + 1} is not an object.")
        if not q.get("id"):
            raise HTTPException(status_code=400, detail=f"Question {idx + 1} needs an id.")
        if q.get("type") not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Question {idx + 1} has unknown type {q.get('type')!r}.",
            )
        if not q.get("prompt"):
            raise HTTPException(status_code=400, detail=f"Question {idx + 1} needs a prompt.")
        qid = str(q["id"])
        if qid in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate question id {qid!r}.")
        seen.add(qid)


def _validate_bands(bands: list[dict[str, Any]]) -> None:
    if not isinstance(bands, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Level bands must be a list.",
        )
    for idx, b in enumerate(bands):
        if not isinstance(b, dict):
            raise HTTPException(status_code=400, detail=f"Band {idx + 1} is malformed.")
        min_pct = b.get("min_percent")
        label = b.get("label")
        if not isinstance(min_pct, int) or not (0 <= min_pct <= 100):
            raise HTTPException(
                status_code=400,
                detail=f"Band {idx + 1} needs min_percent in 0..100.",
            )
        if not isinstance(label, str) or not label.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Band {idx + 1} needs a label.",
            )


def _band_label_for(score: int, max_score: int, bands: list[dict[str, Any]]) -> str | None:
    """Pick the highest matching band whose min_percent <= the student's
    actual percentage. Returns None when no band matches or no bands set."""
    if max_score <= 0 or not bands:
        return None
    pct = (score * 100) // max_score
    sorted_bands = sorted(
        (b for b in bands if isinstance(b.get("min_percent"), int)),
        key=lambda b: b["min_percent"],
        reverse=True,
    )
    for b in sorted_bands:
        if pct >= b["min_percent"]:
            return b.get("label")
    return None


# --- Tutor: read + upsert + deactivate ---------------------------------


class PlacementTestRead(BaseModel):
    id: int | None
    title: str
    description: str | None
    questions: list[dict[str, Any]]
    level_bands: list[dict[str, Any]]
    is_active: bool
    max_score: int


class PlacementTestUpsert(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    level_bands: list[dict[str, Any]] = Field(default_factory=list)


def _load_test(tutor: Tutor, session: Session) -> PlacementTest | None:
    return session.exec(
        select(PlacementTest).where(PlacementTest.tutor_id == tutor.id)
    ).first()


def _to_read(t: PlacementTest | None) -> PlacementTestRead:
    if t is None:
        return PlacementTestRead(
            id=None,
            title="Placement test",
            description=None,
            questions=[],
            level_bands=[],
            is_active=False,
            max_score=0,
        )
    questions = homework_grading.parse_questions(t.questions_json)
    try:
        bands = json.loads(t.level_bands_json or "[]")
        if not isinstance(bands, list):
            bands = []
    except json.JSONDecodeError:
        bands = []
    return PlacementTestRead(
        id=t.id,
        title=t.title,
        description=t.description,
        questions=questions,
        level_bands=bands,
        is_active=t.is_active,
        max_score=homework_grading.compute_max_score(questions),
    )


@router.get("/placement-test", response_model=PlacementTestRead)
def read_my_test(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PlacementTestRead:
    """Owner-only — returns the tutor's placement test for editing,
    correct answers and all. Returns empty defaults when nothing's set."""
    _require_owner(tutor, current)
    return _to_read(_load_test(tutor, session))


@router.put("/placement-test", response_model=PlacementTestRead)
def upsert_test(
    payload: PlacementTestUpsert,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PlacementTestRead:
    _require_owner(tutor, current)
    _validate_questions(payload.questions)
    _validate_bands(payload.level_bands)
    now = datetime.now(UTC)
    existing = _load_test(tutor, session)
    if existing is None:
        existing = PlacementTest(
            tutor_id=tutor.id,
            title=payload.title,
            description=payload.description,
            questions_json=json.dumps(payload.questions),
            level_bands_json=json.dumps(payload.level_bands),
            is_active=True,
        )
    else:
        existing.title = payload.title
        existing.description = payload.description
        existing.questions_json = json.dumps(payload.questions)
        existing.level_bands_json = json.dumps(payload.level_bands)
        existing.is_active = True
        existing.updated_at = now
    session.add(existing)
    session.commit()
    session.refresh(existing)
    return _to_read(existing)


@router.delete("/placement-test", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_test(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    _require_owner(tutor, current)
    test = _load_test(tutor, session)
    if test is None or not test.is_active:
        return
    test.is_active = False
    test.updated_at = datetime.now(UTC)
    session.add(test)
    session.commit()


# --- Tutor: list submissions ------------------------------------------


class PlacementSubmissionRead(BaseModel):
    id: int
    student_user_id: int
    student_name: str | None
    student_email: str | None
    auto_score: int
    max_score: int
    percent: int
    level_label: str | None
    submitted_at: datetime


@router.get(
    "/placement-submissions",
    response_model=list[PlacementSubmissionRead],
)
def list_submissions(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[PlacementSubmissionRead]:
    _require_owner(tutor, current)
    rows = list(
        session.exec(
            select(PlacementSubmission)
            .where(PlacementSubmission.tutor_id == tutor.id)
            .order_by(PlacementSubmission.submitted_at.desc())
        ).all()
    )
    if not rows:
        return []
    student_ids = {r.student_user_id for r in rows}
    students = {
        u.id: u
        for u in session.exec(select(User).where(User.id.in_(student_ids))).all()
    }
    out: list[PlacementSubmissionRead] = []
    for r in rows:
        student = students.get(r.student_user_id)
        pct = (r.auto_score * 100) // r.max_score if r.max_score > 0 else 0
        out.append(
            PlacementSubmissionRead(
                id=r.id,
                student_user_id=r.student_user_id,
                student_name=(student.full_name or student.username) if student else None,
                student_email=student.email if student else None,
                auto_score=r.auto_score,
                max_score=r.max_score,
                percent=pct,
                level_label=r.level_label,
                submitted_at=r.submitted_at,
            )
        )
    return out


# --- Student-facing endpoints -----------------------------------------


class PlacementPublicRead(BaseModel):
    title: str
    description: str | None
    questions: list[dict[str, Any]]
    max_score: int
    is_available: bool


@router.get("/placement-test/public", response_model=PlacementPublicRead)
def read_public_test(
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PlacementPublicRead:
    """Public — the take-quiz payload. Correct answers + accepted answers
    are stripped so the student can't read them from the response."""
    test = _load_test(tutor, session)
    if test is None or not test.is_active:
        return PlacementPublicRead(
            title="Placement test",
            description=None,
            questions=[],
            max_score=0,
            is_available=False,
        )
    questions = homework_grading.parse_questions(test.questions_json)
    sanitized = []
    for q in questions:
        cleaned = {
            k: v
            for k, v in q.items()
            if k not in {"correct", "accepted_answers", "explanation"}
        }
        sanitized.append(cleaned)
    return PlacementPublicRead(
        title=test.title,
        description=test.description,
        questions=sanitized,
        max_score=homework_grading.compute_max_score(questions),
        is_available=True,
    )


class PlacementSubmitRequest(BaseModel):
    answers: dict[str, Any]


class PlacementSubmitResponse(BaseModel):
    auto_score: int
    max_score: int
    percent: int
    level_label: str | None
    per_question_results: dict[str, Any]


@router.post(
    "/placement-test/submit",
    response_model=PlacementSubmitResponse,
)
def submit_placement(
    payload: PlacementSubmitRequest,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> PlacementSubmitResponse:
    """Student submits the placement test. Auth required so the tutor can
    contact them with a suggested level. Returns a result the student
    sees (with the suggested level band when set), plus stores the row
    for the tutor to review."""
    test = _load_test(tutor, session)
    if test is None or not test.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This tutor isn't offering a placement test right now.",
        )
    if current.id == tutor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't take your own placement test.",
        )
    questions = homework_grading.parse_questions(test.questions_json)
    result = homework_grading.grade_submission(questions, payload.answers)
    try:
        bands = json.loads(test.level_bands_json or "[]")
        if not isinstance(bands, list):
            bands = []
    except json.JSONDecodeError:
        bands = []
    level = _band_label_for(result["auto_score"], result["max_score"], bands)
    row = PlacementSubmission(
        tutor_id=tutor.id,
        student_user_id=current.id,
        answers_json=json.dumps(payload.answers),
        per_question_results_json=json.dumps(result["per_question"]),
        auto_score=result["auto_score"],
        max_score=result["max_score"],
        level_label=level,
    )
    session.add(row)
    session.commit()
    pct = (
        (result["auto_score"] * 100) // result["max_score"]
        if result["max_score"] > 0
        else 0
    )
    return PlacementSubmitResponse(
        auto_score=result["auto_score"],
        max_score=result["max_score"],
        percent=pct,
        level_label=level,
        per_question_results=result["per_question"],
    )
