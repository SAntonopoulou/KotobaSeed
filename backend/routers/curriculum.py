"""Curriculum + lesson authoring endpoints (Phase 1).

A curriculum is an ordered sequence of lessons a teacher owns. Each
lesson is rich text + optional PDFs + optional embedded videos.

Phase 1 covers authoring only — student lesson plans, classroom
presenter, school library, and publish-as-module land in later phases
documented in `project_curriculum_system_plan` memory.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import UTC, datetime
from typing import Annotated, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..database import get_session
from ..deps import CurrentUser
from ..models import (
    Article,
    ArticleVisibility,
    Booking,
    BookingStatus,
    CEFRLevel,
    Curriculum,
    CurriculumLesson,
    HomeworkAssignment,
    HomeworkAssignmentStatus,
    LessonDelivery,
    LessonHomeworkTemplate,
    LessonModule,
    StudentLessonPlan,
    StudentLessonPlanItem,
    Tutor,
    User,
)
from ..tenancy import CurrentTutor


router = APIRouter(prefix="/curriculum", tags=["curriculum"])
plans_router = APIRouter(prefix="/lesson-plans", tags=["lesson-plans"])
log = logging.getLogger(__name__)


# --- Pydantic schemas -----------------------------------------------


class AttachmentItem(BaseModel):
    kind: str = Field(pattern=r"^(pdf|image)$")
    name: str = Field(max_length=200)
    url: str = Field(max_length=2048)
    size_bytes: int = Field(default=0, ge=0)


class EmbeddedVideoItem(BaseModel):
    provider: str = Field(default="other", max_length=20)
    url: str = Field(max_length=2048)
    title: Optional[str] = Field(default=None, max_length=200)


class CurriculumRead(BaseModel):
    id: int
    owner_user_id: int
    tutor_team_id: Optional[int]
    title: str
    description: Optional[str]
    language: Optional[str]
    level: Optional[CEFRLevel]
    cover_image_url: Optional[str]
    is_school_library: bool
    archived_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    lesson_count: int


class CurriculumCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    language: Optional[str] = Field(default=None, max_length=60)
    level: Optional[CEFRLevel] = None
    cover_image_url: Optional[str] = Field(default=None, max_length=2048)


class CurriculumUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    language: Optional[str] = Field(default=None, max_length=60)
    level: Optional[CEFRLevel] = None
    cover_image_url: Optional[str] = Field(default=None, max_length=2048)
    is_school_library: Optional[bool] = None


class LessonRead(BaseModel):
    id: int
    curriculum_id: int
    position: int
    title: str
    summary: Optional[str]
    body_lexical_json: Optional[str]
    body_markdown: Optional[str]
    estimated_duration_minutes: int
    attachments: list[AttachmentItem]
    embedded_videos: list[EmbeddedVideoItem]
    is_published: bool
    archived_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class LessonCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: Optional[str] = Field(default=None, max_length=600)
    body_lexical_json: Optional[str] = None
    body_markdown: Optional[str] = None
    estimated_duration_minutes: int = Field(default=60, ge=5, le=600)
    attachments: list[AttachmentItem] = Field(default_factory=list)
    embedded_videos: list[EmbeddedVideoItem] = Field(default_factory=list)
    position: Optional[int] = None


class LessonUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    summary: Optional[str] = Field(default=None, max_length=600)
    body_lexical_json: Optional[str] = None
    body_markdown: Optional[str] = None
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=5, le=600)
    attachments: Optional[list[AttachmentItem]] = None
    embedded_videos: Optional[list[EmbeddedVideoItem]] = None
    is_published: Optional[bool] = None


class LessonReorderRequest(BaseModel):
    lesson_ids: list[int] = Field(min_length=1)


# --- Helpers ---------------------------------------------------------


def _curriculum_to_read(
    c: Curriculum, *, session: Session
) -> CurriculumRead:
    lesson_count = session.exec(
        select(CurriculumLesson)
        .where(
            CurriculumLesson.curriculum_id == c.id,
            CurriculumLesson.archived_at.is_(None),
        )
    ).all()
    return CurriculumRead(
        id=c.id,
        owner_user_id=c.owner_user_id,
        tutor_team_id=c.tutor_team_id,
        title=c.title,
        description=c.description,
        language=c.language,
        level=c.level,
        cover_image_url=c.cover_image_url,
        is_school_library=c.is_school_library,
        archived_at=c.archived_at,
        created_at=c.created_at,
        updated_at=c.updated_at,
        lesson_count=len(lesson_count),
    )


def _lesson_to_read(lesson: CurriculumLesson) -> LessonRead:
    try:
        attachments = [AttachmentItem(**a) for a in json.loads(lesson.attachments_json)]
    except Exception:
        attachments = []
    try:
        embedded_videos = [
            EmbeddedVideoItem(**v) for v in json.loads(lesson.embedded_videos_json)
        ]
    except Exception:
        embedded_videos = []
    return LessonRead(
        id=lesson.id,
        curriculum_id=lesson.curriculum_id,
        position=lesson.position,
        title=lesson.title,
        summary=lesson.summary,
        body_lexical_json=lesson.body_lexical_json,
        body_markdown=lesson.body_markdown,
        estimated_duration_minutes=lesson.estimated_duration_minutes,
        attachments=attachments,
        embedded_videos=embedded_videos,
        is_published=lesson.is_published,
        archived_at=lesson.archived_at,
        created_at=lesson.created_at,
        updated_at=lesson.updated_at,
    )


def _require_owner(
    curriculum: Curriculum, user: object
) -> None:
    if curriculum.owner_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't own this curriculum.",
        )


def _next_position(curriculum_id: int, session: Session) -> int:
    rows = session.exec(
        select(CurriculumLesson.position).where(
            CurriculumLesson.curriculum_id == curriculum_id
        )
    ).all()
    if not rows:
        return 0
    return max(rows) + 1


# --- Curriculum CRUD ------------------------------------------------


@router.get("", response_model=list[CurriculumRead])
def list_my_curriculums(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    include_archived: bool = False,
) -> list[CurriculumRead]:
    """Curriculums owned by the current user."""
    stmt = select(Curriculum).where(Curriculum.owner_user_id == current.id)
    if not include_archived:
        stmt = stmt.where(Curriculum.archived_at.is_(None))
    stmt = stmt.order_by(Curriculum.updated_at.desc())
    rows = session.exec(stmt).all()
    return [_curriculum_to_read(c, session=session) for c in rows]


@router.post("", response_model=CurriculumRead, status_code=201)
def create_curriculum(
    payload: CurriculumCreate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> CurriculumRead:
    now = datetime.now(UTC)
    row = Curriculum(
        owner_user_id=current.id,
        title=payload.title,
        description=payload.description,
        language=payload.language,
        level=payload.level,
        cover_image_url=payload.cover_image_url,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _curriculum_to_read(row, session=session)


@router.get("/school-library", response_model=list[CurriculumRead])
def list_school_library_endpoint(
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[CurriculumRead]:
    """Curriculums shared by teachers in my school team. Empty list when
    I'm not part of a team, or no teammate has shared yet.

    Defined BEFORE the `/{curriculum_id}` catch-all so the literal path
    wins routing.
    """
    my_tutor = session.exec(
        select(Tutor).where(Tutor.user_id == current.id)
    ).first()
    if not my_tutor or not my_tutor.team_id:
        return []
    rows = session.exec(
        select(Curriculum)
        .where(
            Curriculum.tutor_team_id == my_tutor.team_id,
            Curriculum.is_school_library == True,  # noqa: E712
            Curriculum.archived_at.is_(None),
            Curriculum.owner_user_id != current.id,
        )
        .order_by(Curriculum.updated_at.desc())
    ).all()
    return [_curriculum_to_read(c, session=session) for c in rows]


@router.get("/{curriculum_id}", response_model=CurriculumRead)
def read_curriculum(
    curriculum_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> CurriculumRead:
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    # For v1 only the owner can read. School library + cloning land in
    # Phase 5.
    _require_owner(c, current)
    return _curriculum_to_read(c, session=session)


@router.patch("/{curriculum_id}", response_model=CurriculumRead)
def update_curriculum(
    curriculum_id: int,
    payload: CurriculumUpdate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> CurriculumRead:
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    changes = payload.model_dump(exclude_unset=True)
    # If the owner is flipping is_school_library on, auto-set
    # tutor_team_id to whatever team they're a member of. Flipping off
    # leaves tutor_team_id alone — keeps the historical association.
    if changes.get("is_school_library") is True and c.tutor_team_id is None:
        my_tutor = session.exec(
            select(Tutor).where(Tutor.user_id == current.id)
        ).first()
        if my_tutor and my_tutor.team_id:
            c.tutor_team_id = my_tutor.team_id
    for key, value in changes.items():
        setattr(c, key, value)
    c.updated_at = datetime.now(UTC)
    session.add(c)
    session.commit()
    session.refresh(c)
    return _curriculum_to_read(c, session=session)


@router.post(
    "/{curriculum_id}/clone", response_model=CurriculumRead, status_code=201
)
def clone_curriculum(
    curriculum_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> CurriculumRead:
    """Copy a curriculum (lessons + homework templates) into my own
    library. Source must be either owned by me, or shared in my
    school library. Resulting curriculum is independent — future edits
    to the source don't propagate."""
    src = session.get(Curriculum, curriculum_id)
    if src is None or src.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    if src.owner_user_id != current.id:
        # Allow only if I'm a teammate AND the source is shared.
        my_tutor = session.exec(
            select(Tutor).where(Tutor.user_id == current.id)
        ).first()
        if (
            not my_tutor
            or not my_tutor.team_id
            or my_tutor.team_id != src.tutor_team_id
            or not src.is_school_library
        ):
            raise HTTPException(
                403, "Curriculum isn't shared with you."
            )

    now = datetime.now(UTC)
    new_c = Curriculum(
        owner_user_id=current.id,
        tutor_team_id=None,  # cloned copy starts private
        title=f"{src.title} (copy)",
        description=src.description,
        language=src.language,
        level=src.level,
        cover_image_url=src.cover_image_url,
        is_school_library=False,
        created_at=now,
        updated_at=now,
    )
    session.add(new_c)
    session.flush()  # need new_c.id

    src_lessons = list(
        session.exec(
            select(CurriculumLesson)
            .where(
                CurriculumLesson.curriculum_id == src.id,
                CurriculumLesson.archived_at.is_(None),
            )
            .order_by(CurriculumLesson.position)
        ).all()
    )
    for src_l in src_lessons:
        new_l = CurriculumLesson(
            curriculum_id=new_c.id,
            position=src_l.position,
            title=src_l.title,
            summary=src_l.summary,
            body_lexical_json=src_l.body_lexical_json,
            body_markdown=src_l.body_markdown,
            estimated_duration_minutes=src_l.estimated_duration_minutes,
            attachments_json=src_l.attachments_json,
            embedded_videos_json=src_l.embedded_videos_json,
            is_published=src_l.is_published,
            created_at=now,
            updated_at=now,
        )
        session.add(new_l)
        session.flush()
        # Copy homework templates attached to the source lesson.
        for src_t in session.exec(
            select(LessonHomeworkTemplate)
            .where(
                LessonHomeworkTemplate.lesson_id == src_l.id,
                LessonHomeworkTemplate.archived_at.is_(None),
            )
            .order_by(LessonHomeworkTemplate.position)
        ).all():
            session.add(
                LessonHomeworkTemplate(
                    lesson_id=new_l.id,
                    position=src_t.position,
                    title=src_t.title,
                    body_lexical_json=src_t.body_lexical_json,
                    body_markdown=src_t.body_markdown,
                    due_days_after_lesson=src_t.due_days_after_lesson,
                    is_active=src_t.is_active,
                    created_at=now,
                    updated_at=now,
                )
            )
    session.commit()
    session.refresh(new_c)
    return _curriculum_to_read(new_c, session=session)


@router.delete("/{curriculum_id}", status_code=204)
def archive_curriculum(
    curriculum_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Soft-archive. Lessons + delivery history stay intact."""
    c = session.get(Curriculum, curriculum_id)
    if c is None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    c.archived_at = datetime.now(UTC)
    c.updated_at = c.archived_at
    session.add(c)
    session.commit()
    return None


@router.delete("/{curriculum_id}/permanent", status_code=204)
def hard_delete_curriculum(
    curriculum_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Hard delete a curriculum and everything in it.

    Order matters because of FK constraints — clean up from the deepest
    references first.
    """
    c = session.get(Curriculum, curriculum_id)
    if c is None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)

    lesson_ids = [
        l.id
        for l in session.exec(
            select(CurriculumLesson).where(
                CurriculumLesson.curriculum_id == curriculum_id
            )
        ).all()
    ]
    if lesson_ids:
        for t in session.exec(
            select(LessonHomeworkTemplate).where(
                LessonHomeworkTemplate.lesson_id.in_(lesson_ids)
            )
        ).all():
            session.delete(t)
        for item in session.exec(
            select(StudentLessonPlanItem).where(
                StudentLessonPlanItem.lesson_id.in_(lesson_ids)
            )
        ).all():
            session.delete(item)
        for delivery in session.exec(
            select(LessonDelivery).where(
                LessonDelivery.lesson_id.in_(lesson_ids)
            )
        ).all():
            session.delete(delivery)
        for lesson in session.exec(
            select(CurriculumLesson).where(
                CurriculumLesson.curriculum_id == curriculum_id
            )
        ).all():
            session.delete(lesson)

    # Detach any plan that pointed at this curriculum.
    for plan in session.exec(
        select(StudentLessonPlan).where(
            StudentLessonPlan.curriculum_id == curriculum_id
        )
    ).all():
        plan.curriculum_id = None
        plan.is_custom = True
        session.add(plan)

    session.delete(c)
    session.commit()
    return None


# --- Lesson CRUD ----------------------------------------------------


@router.get(
    "/{curriculum_id}/lessons", response_model=list[LessonRead]
)
def list_lessons(
    curriculum_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[LessonRead]:
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    rows = session.exec(
        select(CurriculumLesson)
        .where(
            CurriculumLesson.curriculum_id == curriculum_id,
            CurriculumLesson.archived_at.is_(None),
        )
        .order_by(CurriculumLesson.position)
    ).all()
    return [_lesson_to_read(r) for r in rows]


@router.post(
    "/{curriculum_id}/lessons",
    response_model=LessonRead,
    status_code=201,
)
def create_lesson(
    curriculum_id: int,
    payload: LessonCreate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> LessonRead:
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    pos = payload.position if payload.position is not None else _next_position(curriculum_id, session)
    now = datetime.now(UTC)
    row = CurriculumLesson(
        curriculum_id=curriculum_id,
        position=pos,
        title=payload.title,
        summary=payload.summary,
        body_lexical_json=payload.body_lexical_json,
        body_markdown=payload.body_markdown,
        estimated_duration_minutes=payload.estimated_duration_minutes,
        attachments_json=json.dumps([a.model_dump() for a in payload.attachments]),
        embedded_videos_json=json.dumps(
            [v.model_dump() for v in payload.embedded_videos]
        ),
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    c.updated_at = now
    session.add(c)
    session.commit()
    session.refresh(row)
    return _lesson_to_read(row)


@router.get(
    "/{curriculum_id}/lessons/{lesson_id}",
    response_model=LessonRead,
)
def read_lesson(
    curriculum_id: int,
    lesson_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> LessonRead:
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    lesson = session.get(CurriculumLesson, lesson_id)
    if lesson is None or lesson.curriculum_id != curriculum_id or lesson.archived_at is not None:
        raise HTTPException(404, "Lesson not found")
    return _lesson_to_read(lesson)


@router.patch(
    "/{curriculum_id}/lessons/{lesson_id}",
    response_model=LessonRead,
)
def update_lesson(
    curriculum_id: int,
    lesson_id: int,
    payload: LessonUpdate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> LessonRead:
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    lesson = session.get(CurriculumLesson, lesson_id)
    if lesson is None or lesson.curriculum_id != curriculum_id or lesson.archived_at is not None:
        raise HTTPException(404, "Lesson not found")
    changes = payload.model_dump(exclude_unset=True)
    if "attachments" in changes:
        lesson.attachments_json = json.dumps(changes.pop("attachments"))
    if "embedded_videos" in changes:
        lesson.embedded_videos_json = json.dumps(changes.pop("embedded_videos"))
    for k, v in changes.items():
        setattr(lesson, k, v)
    now = datetime.now(UTC)
    lesson.updated_at = now
    c.updated_at = now
    session.add(lesson)
    session.add(c)
    session.commit()
    session.refresh(lesson)
    return _lesson_to_read(lesson)


@router.delete(
    "/{curriculum_id}/lessons/{lesson_id}", status_code=204
)
def archive_lesson(
    curriculum_id: int,
    lesson_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    c = session.get(Curriculum, curriculum_id)
    if c is None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    lesson = session.get(CurriculumLesson, lesson_id)
    if lesson is None or lesson.curriculum_id != curriculum_id:
        raise HTTPException(404, "Lesson not found")
    lesson.archived_at = datetime.now(UTC)
    lesson.updated_at = lesson.archived_at
    session.add(lesson)
    session.commit()
    return None


@router.delete(
    "/{curriculum_id}/lessons/{lesson_id}/permanent", status_code=204
)
def hard_delete_lesson(
    curriculum_id: int,
    lesson_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Hard delete a lesson + everything attached to it."""
    c = session.get(Curriculum, curriculum_id)
    if c is None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    lesson = session.get(CurriculumLesson, lesson_id)
    if lesson is None or lesson.curriculum_id != curriculum_id:
        raise HTTPException(404, "Lesson not found")
    for t in session.exec(
        select(LessonHomeworkTemplate).where(
            LessonHomeworkTemplate.lesson_id == lesson_id
        )
    ).all():
        session.delete(t)
    for item in session.exec(
        select(StudentLessonPlanItem).where(
            StudentLessonPlanItem.lesson_id == lesson_id
        )
    ).all():
        session.delete(item)
    for delivery in session.exec(
        select(LessonDelivery).where(LessonDelivery.lesson_id == lesson_id)
    ).all():
        session.delete(delivery)
    session.delete(lesson)
    session.commit()
    return None


@router.post(
    "/{curriculum_id}/lessons/reorder",
    response_model=list[LessonRead],
)
def reorder_lessons(
    curriculum_id: int,
    payload: LessonReorderRequest,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[LessonRead]:
    """Reorder lessons. Body is the lesson ids in new display order."""
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    lessons = {
        l.id: l
        for l in session.exec(
            select(CurriculumLesson).where(
                CurriculumLesson.curriculum_id == curriculum_id,
                CurriculumLesson.archived_at.is_(None),
            )
        ).all()
    }
    seen = set()
    for pos, lesson_id in enumerate(payload.lesson_ids):
        if lesson_id in seen:
            raise HTTPException(400, "Duplicate lesson id in reorder request")
        seen.add(lesson_id)
        lesson = lessons.get(lesson_id)
        if lesson is None:
            raise HTTPException(
                404, f"Lesson {lesson_id} not found in this curriculum"
            )
        lesson.position = pos
        session.add(lesson)
    c.updated_at = datetime.now(UTC)
    session.add(c)
    session.commit()
    return [
        _lesson_to_read(l)
        for l in sorted(lessons.values(), key=lambda x: x.position)
    ]


# --- Media uploads --------------------------------------------------


ACCEPTED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ACCEPTED_PDF_MIME = {"application/pdf"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024  # 4 MB
MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


class UploadResponse(BaseModel):
    url: str
    size_bytes: int
    name: str
    kind: str


@router.post(
    "/{curriculum_id}/lessons/{lesson_id}/upload",
    response_model=UploadResponse,
)
async def upload_lesson_attachment(
    curriculum_id: int,
    lesson_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    file: UploadFile = File(...),
) -> UploadResponse:
    """Upload an image or PDF for a lesson body. Returns a public URL
    the frontend then patches into the lesson's attachments list."""
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    lesson = session.get(CurriculumLesson, lesson_id)
    if lesson is None or lesson.curriculum_id != curriculum_id:
        raise HTTPException(404, "Lesson not found")

    if file.content_type in ACCEPTED_IMAGE_MIME:
        kind = "image"
        max_bytes = MAX_IMAGE_BYTES
        ext_map = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }
    elif file.content_type in ACCEPTED_PDF_MIME:
        kind = "pdf"
        max_bytes = MAX_PDF_BYTES
        ext_map = {"application/pdf": "pdf"}
    else:
        raise HTTPException(
            415,
            "Upload must be JPEG / PNG / WebP / GIF (image) or PDF (document).",
        )

    raw = await file.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(
            413,
            f"File is too large — keep it under {max_bytes // (1024 * 1024)} MB.",
        )

    from ..services import storage

    if not storage.is_configured():
        raise HTTPException(503, "File uploads aren't available on this deployment yet.")

    ext = ext_map[file.content_type]
    key = (
        f"curriculum/{current.id}/{curriculum_id}/{lesson_id}/"
        f"{secrets.token_urlsafe(10)}.{ext}"
    )
    url = storage.put_object(key=key, body=raw, content_type=file.content_type)
    return UploadResponse(
        url=url,
        size_bytes=len(raw),
        name=file.filename or f"upload.{ext}",
        kind=kind,
    )


# --- Homework templates attached to lessons --------------------------


class HomeworkTemplateRead(BaseModel):
    id: int
    lesson_id: int
    position: int
    title: str
    body_lexical_json: Optional[str]
    body_markdown: Optional[str]
    due_days_after_lesson: int
    is_active: bool
    archived_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class HomeworkTemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body_lexical_json: Optional[str] = None
    body_markdown: Optional[str] = None
    due_days_after_lesson: int = Field(default=7, ge=0, le=365)
    position: Optional[int] = None


class HomeworkTemplateUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    body_lexical_json: Optional[str] = None
    body_markdown: Optional[str] = None
    due_days_after_lesson: Optional[int] = Field(default=None, ge=0, le=365)
    is_active: Optional[bool] = None


class HomeworkTemplateReorderRequest(BaseModel):
    template_ids: list[int] = Field(min_length=1)


def _homework_to_read(t: LessonHomeworkTemplate) -> HomeworkTemplateRead:
    return HomeworkTemplateRead(
        id=t.id,
        lesson_id=t.lesson_id,
        position=t.position,
        title=t.title,
        body_lexical_json=t.body_lexical_json,
        body_markdown=t.body_markdown,
        due_days_after_lesson=t.due_days_after_lesson,
        is_active=t.is_active,
        archived_at=t.archived_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _next_template_position(lesson_id: int, session: Session) -> int:
    rows = session.exec(
        select(LessonHomeworkTemplate.position).where(
            LessonHomeworkTemplate.lesson_id == lesson_id,
            LessonHomeworkTemplate.archived_at.is_(None),
        )
    ).all()
    return (max(rows) + 1) if rows else 0


def _lesson_in_owned_curriculum(
    curriculum_id: int,
    lesson_id: int,
    current,
    session: Session,
) -> tuple[Curriculum, CurriculumLesson]:
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    lesson = session.get(CurriculumLesson, lesson_id)
    if (
        lesson is None
        or lesson.curriculum_id != curriculum_id
        or lesson.archived_at is not None
    ):
        raise HTTPException(404, "Lesson not found")
    return c, lesson


@router.get(
    "/{curriculum_id}/lessons/{lesson_id}/homework",
    response_model=list[HomeworkTemplateRead],
)
def list_lesson_homework(
    curriculum_id: int,
    lesson_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[HomeworkTemplateRead]:
    _lesson_in_owned_curriculum(curriculum_id, lesson_id, current, session)
    rows = session.exec(
        select(LessonHomeworkTemplate)
        .where(
            LessonHomeworkTemplate.lesson_id == lesson_id,
            LessonHomeworkTemplate.archived_at.is_(None),
        )
        .order_by(LessonHomeworkTemplate.position)
    ).all()
    return [_homework_to_read(r) for r in rows]


@router.post(
    "/{curriculum_id}/lessons/{lesson_id}/homework",
    response_model=HomeworkTemplateRead,
    status_code=201,
)
def create_lesson_homework(
    curriculum_id: int,
    lesson_id: int,
    payload: HomeworkTemplateCreate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> HomeworkTemplateRead:
    c, lesson = _lesson_in_owned_curriculum(curriculum_id, lesson_id, current, session)
    pos = payload.position if payload.position is not None else _next_template_position(lesson_id, session)
    now = datetime.now(UTC)
    row = LessonHomeworkTemplate(
        lesson_id=lesson_id,
        position=pos,
        title=payload.title,
        body_lexical_json=payload.body_lexical_json,
        body_markdown=payload.body_markdown,
        due_days_after_lesson=payload.due_days_after_lesson,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    lesson.updated_at = now
    c.updated_at = now
    session.add(lesson)
    session.add(c)
    session.commit()
    session.refresh(row)
    return _homework_to_read(row)


@router.patch(
    "/{curriculum_id}/lessons/{lesson_id}/homework/{template_id}",
    response_model=HomeworkTemplateRead,
)
def update_lesson_homework(
    curriculum_id: int,
    lesson_id: int,
    template_id: int,
    payload: HomeworkTemplateUpdate,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> HomeworkTemplateRead:
    _lesson_in_owned_curriculum(curriculum_id, lesson_id, current, session)
    t = session.get(LessonHomeworkTemplate, template_id)
    if t is None or t.lesson_id != lesson_id or t.archived_at is not None:
        raise HTTPException(404, "Homework template not found")
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(t, k, v)
    t.updated_at = datetime.now(UTC)
    session.add(t)
    session.commit()
    session.refresh(t)
    return _homework_to_read(t)


@router.delete(
    "/{curriculum_id}/lessons/{lesson_id}/homework/{template_id}",
    status_code=204,
)
def archive_lesson_homework(
    curriculum_id: int,
    lesson_id: int,
    template_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    _lesson_in_owned_curriculum(curriculum_id, lesson_id, current, session)
    t = session.get(LessonHomeworkTemplate, template_id)
    if t is None or t.lesson_id != lesson_id:
        raise HTTPException(404, "Homework template not found")
    t.archived_at = datetime.now(UTC)
    t.updated_at = t.archived_at
    session.add(t)
    session.commit()
    return None


@router.delete(
    "/{curriculum_id}/lessons/{lesson_id}/homework/{template_id}/permanent",
    status_code=204,
)
def hard_delete_lesson_homework(
    curriculum_id: int,
    lesson_id: int,
    template_id: int,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    _lesson_in_owned_curriculum(curriculum_id, lesson_id, current, session)
    t = session.get(LessonHomeworkTemplate, template_id)
    if t is None or t.lesson_id != lesson_id:
        raise HTTPException(404, "Homework template not found")
    session.delete(t)
    session.commit()
    return None


@router.post(
    "/{curriculum_id}/lessons/{lesson_id}/homework/reorder",
    response_model=list[HomeworkTemplateRead],
)
def reorder_lesson_homework(
    curriculum_id: int,
    lesson_id: int,
    payload: HomeworkTemplateReorderRequest,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> list[HomeworkTemplateRead]:
    _lesson_in_owned_curriculum(curriculum_id, lesson_id, current, session)
    templates = {
        t.id: t
        for t in session.exec(
            select(LessonHomeworkTemplate).where(
                LessonHomeworkTemplate.lesson_id == lesson_id,
                LessonHomeworkTemplate.archived_at.is_(None),
            )
        ).all()
    }
    seen = set()
    for pos, tid in enumerate(payload.template_ids):
        if tid in seen:
            raise HTTPException(400, "Duplicate template id")
        seen.add(tid)
        t = templates.get(tid)
        if t is None:
            raise HTTPException(404, f"Template {tid} not found on this lesson")
        t.position = pos
        session.add(t)
    session.commit()
    return [
        _homework_to_read(t)
        for t in sorted(templates.values(), key=lambda x: x.position)
    ]


# --- Phase 3: Student lesson plans + delivery -----------------------
#
# A StudentLessonPlan is the sequence a tutor walks a given student
# through. Two shapes:
#   - Curriculum-driven (is_custom=False, curriculum_id set): the
#     sequence is just the curriculum's lessons in order. We track
#     `current_position` to know what's next.
#   - Custom (is_custom=True): the sequence lives in
#     StudentLessonPlanItem rows; tutor picks lessons from any of
#     their curriculums. Clone-able to another student.
#
# When the tutor records a LessonDelivery (typically after a Booking
# completes), we auto-spawn HomeworkAssignment rows for every active
# LessonHomeworkTemplate on that lesson. This is the "homework only
# flows when I actually teach this lesson" Sophia specified.


class PlanLessonRef(BaseModel):
    """A lesson reference shown inside a plan — works for both
    curriculum-driven and custom plans."""

    lesson_id: int
    lesson_title: str
    position: int  # position in the plan (NOT the lesson's own position)
    estimated_duration_minutes: int


class StudentPlanRead(BaseModel):
    id: int
    tutor_id: int
    student_user_id: int
    student_name: Optional[str]
    student_email: Optional[str]
    curriculum_id: Optional[int]
    curriculum_title: Optional[str]
    is_custom: bool
    current_position: int
    notes: Optional[str]
    is_active: bool
    lessons: list[PlanLessonRef]
    # The lesson the tutor would teach next, or None if the plan is done.
    next_lesson: Optional[PlanLessonRef]
    created_at: datetime
    updated_at: datetime


class StudentPlanUpsert(BaseModel):
    # When curriculum_id is None we treat the plan as fully custom.
    curriculum_id: Optional[int] = None
    notes: Optional[str] = Field(default=None, max_length=4000)
    reset_position: bool = True


class CustomPlanItemCreate(BaseModel):
    lesson_id: int
    position: Optional[int] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class LessonDeliveryCreate(BaseModel):
    student_user_id: int
    lesson_id: int
    booking_id: Optional[int] = None
    teacher_notes: Optional[str] = Field(default=None, max_length=4000)
    # When True, advance plan.current_position by 1 after recording delivery.
    advance_plan: bool = True


class LessonDeliveryRead(BaseModel):
    id: int
    plan_id: int
    lesson_id: int
    lesson_title: str
    booking_id: Optional[int]
    delivered_at: datetime
    teacher_notes: Optional[str]
    homework_assignment_ids: list[int]
    plan_current_position_after: int


def _lessons_for_plan(plan: StudentLessonPlan, session: Session) -> list[CurriculumLesson]:
    """Return the ordered list of lessons in a plan."""
    if not plan.is_custom and plan.curriculum_id is not None:
        return list(
            session.exec(
                select(CurriculumLesson)
                .where(
                    CurriculumLesson.curriculum_id == plan.curriculum_id,
                    CurriculumLesson.archived_at.is_(None),
                )
                .order_by(CurriculumLesson.position)
            ).all()
        )
    # Custom plan
    items = list(
        session.exec(
            select(StudentLessonPlanItem)
            .where(StudentLessonPlanItem.plan_id == plan.id)
            .order_by(StudentLessonPlanItem.position)
        ).all()
    )
    if not items:
        return []
    lesson_ids = [i.lesson_id for i in items]
    lessons_by_id = {
        l.id: l
        for l in session.exec(
            select(CurriculumLesson).where(CurriculumLesson.id.in_(lesson_ids))
        ).all()
    }
    return [lessons_by_id[i.lesson_id] for i in items if i.lesson_id in lessons_by_id]


def _plan_to_read(
    plan: StudentLessonPlan, session: Session
) -> StudentPlanRead:
    lessons = _lessons_for_plan(plan, session)
    refs = [
        PlanLessonRef(
            lesson_id=l.id,
            lesson_title=l.title,
            position=idx,
            estimated_duration_minutes=l.estimated_duration_minutes,
        )
        for idx, l in enumerate(lessons)
    ]
    next_ref = (
        refs[plan.current_position]
        if 0 <= plan.current_position < len(refs)
        else None
    )
    student = session.get(User, plan.student_user_id)
    curriculum = (
        session.get(Curriculum, plan.curriculum_id)
        if plan.curriculum_id
        else None
    )
    return StudentPlanRead(
        id=plan.id,
        tutor_id=plan.tutor_id,
        student_user_id=plan.student_user_id,
        student_name=student.full_name if student else None,
        student_email=student.email if student else None,
        curriculum_id=plan.curriculum_id,
        curriculum_title=curriculum.title if curriculum else None,
        is_custom=plan.is_custom,
        current_position=plan.current_position,
        notes=plan.notes,
        is_active=plan.is_active,
        lessons=refs,
        next_lesson=next_ref,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def _owned_curriculum_lesson(
    lesson_id: int, current, session: Session
) -> CurriculumLesson:
    """Confirm a lesson exists, isn't archived, and belongs to a
    curriculum owned by `current`."""
    lesson = session.get(CurriculumLesson, lesson_id)
    if lesson is None or lesson.archived_at is not None:
        raise HTTPException(404, "Lesson not found")
    c = session.get(Curriculum, lesson.curriculum_id)
    if c is None or c.owner_user_id != current.id:
        raise HTTPException(403, "Lesson belongs to a curriculum you don't own")
    return lesson


def _get_or_create_active_plan(
    tutor_id: int,
    student_user_id: int,
    session: Session,
) -> StudentLessonPlan:
    p = session.exec(
        select(StudentLessonPlan).where(
            StudentLessonPlan.tutor_id == tutor_id,
            StudentLessonPlan.student_user_id == student_user_id,
            StudentLessonPlan.is_active == True,  # noqa: E712
            StudentLessonPlan.archived_at.is_(None),
        )
    ).first()
    if p is not None:
        return p
    now = datetime.now(UTC)
    p = StudentLessonPlan(
        tutor_id=tutor_id,
        student_user_id=student_user_id,
        is_custom=True,
        current_position=0,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


@plans_router.get("", response_model=list[StudentPlanRead])
def list_student_plans(
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> list[StudentPlanRead]:
    """All active lesson plans for the current tutor."""
    rows = session.exec(
        select(StudentLessonPlan).where(
            StudentLessonPlan.tutor_id == tutor.id,
            StudentLessonPlan.is_active == True,  # noqa: E712
            StudentLessonPlan.archived_at.is_(None),
        )
    ).all()
    return [_plan_to_read(p, session) for p in rows]


@plans_router.get("/{student_user_id}", response_model=StudentPlanRead)
def get_student_plan(
    student_user_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> StudentPlanRead:
    plan = _get_or_create_active_plan(tutor.id, student_user_id, session)
    return _plan_to_read(plan, session)


@plans_router.put("/{student_user_id}", response_model=StudentPlanRead)
def upsert_student_plan(
    student_user_id: int,
    payload: StudentPlanUpsert,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> StudentPlanRead:
    plan = _get_or_create_active_plan(tutor.id, student_user_id, session)
    if payload.curriculum_id is not None:
        c = session.get(Curriculum, payload.curriculum_id)
        if c is None or c.owner_user_id != current.id:
            raise HTTPException(404, "Curriculum not found")
        plan.curriculum_id = payload.curriculum_id
        plan.is_custom = False
    else:
        plan.curriculum_id = None
        plan.is_custom = True
    if payload.notes is not None:
        plan.notes = payload.notes
    if payload.reset_position:
        plan.current_position = 0
    plan.updated_at = datetime.now(UTC)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _plan_to_read(plan, session)


@plans_router.post(
    "/{student_user_id}/items",
    response_model=StudentPlanRead,
)
def add_custom_plan_item(
    student_user_id: int,
    payload: CustomPlanItemCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> StudentPlanRead:
    plan = _get_or_create_active_plan(tutor.id, student_user_id, session)
    if not plan.is_custom:
        raise HTTPException(
            400,
            "This plan is curriculum-driven. Switch it to custom first to add ad-hoc lessons.",
        )
    _owned_curriculum_lesson(payload.lesson_id, current, session)
    if payload.position is None:
        existing = list(
            session.exec(
                select(StudentLessonPlanItem.position).where(
                    StudentLessonPlanItem.plan_id == plan.id
                )
            ).all()
        )
        position = (max(existing) + 1) if existing else 0
    else:
        position = payload.position
    item = StudentLessonPlanItem(
        plan_id=plan.id,
        lesson_id=payload.lesson_id,
        position=position,
        notes=payload.notes,
    )
    session.add(item)
    plan.updated_at = datetime.now(UTC)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _plan_to_read(plan, session)


@plans_router.delete(
    "/{student_user_id}/items/{item_id}",
    response_model=StudentPlanRead,
)
def remove_custom_plan_item(
    student_user_id: int,
    item_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> StudentPlanRead:
    plan = _get_or_create_active_plan(tutor.id, student_user_id, session)
    item = session.get(StudentLessonPlanItem, item_id)
    if item is None or item.plan_id != plan.id:
        raise HTTPException(404, "Item not found in this plan")
    session.delete(item)
    plan.updated_at = datetime.now(UTC)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _plan_to_read(plan, session)


@plans_router.delete(
    "/{student_user_id}/permanent", status_code=204
)
def hard_delete_student_plan(
    student_user_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Permanently delete a student's lesson plan + its items + delivery
    history. Cleanest action when a tutor wants to start fresh with a
    student or remove a plan made by mistake."""
    plan = session.exec(
        select(StudentLessonPlan).where(
            StudentLessonPlan.tutor_id == tutor.id,
            StudentLessonPlan.student_user_id == student_user_id,
            StudentLessonPlan.is_active == True,  # noqa: E712
        )
    ).first()
    if plan is None:
        raise HTTPException(404, "Plan not found")
    for item in session.exec(
        select(StudentLessonPlanItem).where(
            StudentLessonPlanItem.plan_id == plan.id
        )
    ).all():
        session.delete(item)
    for delivery in session.exec(
        select(LessonDelivery).where(LessonDelivery.plan_id == plan.id)
    ).all():
        session.delete(delivery)
    session.delete(plan)
    session.commit()
    return None


@plans_router.post(
    "/{student_user_id}/clone-from/{source_student_user_id}",
    response_model=StudentPlanRead,
)
def clone_plan_from_other_student(
    student_user_id: int,
    source_student_user_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> StudentPlanRead:
    """Copy the source student's plan onto the target student."""
    source = session.exec(
        select(StudentLessonPlan).where(
            StudentLessonPlan.tutor_id == tutor.id,
            StudentLessonPlan.student_user_id == source_student_user_id,
            StudentLessonPlan.is_active == True,  # noqa: E712
        )
    ).first()
    if source is None:
        raise HTTPException(404, "Source plan not found")
    target = _get_or_create_active_plan(tutor.id, student_user_id, session)
    target.curriculum_id = source.curriculum_id
    target.is_custom = source.is_custom
    target.current_position = 0
    target.notes = (source.notes or "") + "\n\n(Cloned from another student's plan.)"
    target.updated_at = datetime.now(UTC)
    session.add(target)
    # If custom, copy the items.
    if source.is_custom:
        # Clear any existing items on target first.
        for old in session.exec(
            select(StudentLessonPlanItem).where(
                StudentLessonPlanItem.plan_id == target.id
            )
        ).all():
            session.delete(old)
        for src_item in session.exec(
            select(StudentLessonPlanItem)
            .where(StudentLessonPlanItem.plan_id == source.id)
            .order_by(StudentLessonPlanItem.position)
        ).all():
            session.add(
                StudentLessonPlanItem(
                    plan_id=target.id,
                    lesson_id=src_item.lesson_id,
                    position=src_item.position,
                    notes=src_item.notes,
                )
            )
    session.commit()
    session.refresh(target)
    return _plan_to_read(target, session)


class ClassroomLessonContext(BaseModel):
    """Everything the classroom presenter side-panel needs in one call."""

    plan_id: int
    student_user_id: int
    student_name: Optional[str]
    booking_id: int
    plan_position: int
    plan_total_lessons: int
    next_lesson: Optional[LessonRead]
    homework_templates: list[HomeworkTemplateRead]


@plans_router.get(
    "/booking/{booking_id}/classroom-context",
    response_model=ClassroomLessonContext,
)
def classroom_lesson_context(
    booking_id: int,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> ClassroomLessonContext:
    """Tutor-only: fetch the active lesson plan + current lesson for a
    booking, so the in-classroom side panel can display the body, the
    attachments, the embedded videos, and the homework templates that
    will auto-spawn if the tutor marks the lesson taught."""
    booking = session.get(Booking, booking_id)
    if booking is None or booking.tutor_id != tutor.id:
        raise HTTPException(404, "Booking not found")
    plan = _get_or_create_active_plan(tutor.id, booking.student_user_id, session)
    lessons = _lessons_for_plan(plan, session)
    next_lesson_raw = (
        lessons[plan.current_position]
        if 0 <= plan.current_position < len(lessons)
        else None
    )
    homework = []
    if next_lesson_raw is not None:
        homework = [
            _homework_to_read(t)
            for t in session.exec(
                select(LessonHomeworkTemplate)
                .where(
                    LessonHomeworkTemplate.lesson_id == next_lesson_raw.id,
                    LessonHomeworkTemplate.is_active == True,  # noqa: E712
                    LessonHomeworkTemplate.archived_at.is_(None),
                )
                .order_by(LessonHomeworkTemplate.position)
            ).all()
        ]
    student = session.get(User, booking.student_user_id)
    return ClassroomLessonContext(
        plan_id=plan.id,
        student_user_id=booking.student_user_id,
        student_name=student.full_name if student else None,
        booking_id=booking.id,
        plan_position=plan.current_position,
        plan_total_lessons=len(lessons),
        next_lesson=_lesson_to_read(next_lesson_raw) if next_lesson_raw else None,
        homework_templates=homework,
    )


@plans_router.post(
    "/deliveries", response_model=LessonDeliveryRead, status_code=201
)
def record_lesson_delivery(
    payload: LessonDeliveryCreate,
    current: CurrentUser,
    tutor: CurrentTutor,
    session: Annotated[Session, Depends(get_session)],
) -> LessonDeliveryRead:
    """Record that the tutor taught a lesson to a student.

    Side effects:
      - Creates a LessonDelivery row
      - Auto-creates a HomeworkAssignment for every active
        LessonHomeworkTemplate attached to the lesson
      - Optionally advances the plan's current_position
    """
    lesson = _owned_curriculum_lesson(payload.lesson_id, current, session)
    plan = _get_or_create_active_plan(
        tutor.id, payload.student_user_id, session
    )
    booking = None
    if payload.booking_id is not None:
        booking = session.get(Booking, payload.booking_id)
        if booking is None or booking.tutor_id != tutor.id:
            raise HTTPException(404, "Booking not found")

    now = datetime.now(UTC)
    delivery = LessonDelivery(
        plan_id=plan.id,
        lesson_id=lesson.id,
        booking_id=payload.booking_id,
        delivered_at=now,
        teacher_notes=payload.teacher_notes,
        created_at=now,
    )
    session.add(delivery)
    session.flush()  # need delivery.id

    # Auto-spawn homework
    templates = list(
        session.exec(
            select(LessonHomeworkTemplate)
            .where(
                LessonHomeworkTemplate.lesson_id == lesson.id,
                LessonHomeworkTemplate.is_active == True,  # noqa: E712
                LessonHomeworkTemplate.archived_at.is_(None),
            )
            .order_by(LessonHomeworkTemplate.position)
        ).all()
    )
    from datetime import timedelta

    homework_ids: list[int] = []
    for t in templates:
        due_at = now + timedelta(days=t.due_days_after_lesson)
        assignment = HomeworkAssignment(
            tutor_id=tutor.id,
            student_user_id=payload.student_user_id,
            template_id=None,  # spawned from a curriculum-side template
            title=t.title,
            description=t.body_markdown,
            questions_snapshot_json="[]",
            max_score=0,
            grading_price_cents=0,
            status=HomeworkAssignmentStatus.OPEN,
            due_at=due_at,
            assigned_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(assignment)
        session.flush()
        homework_ids.append(assignment.id)
    delivery.homework_assignment_ids_json = json.dumps(homework_ids)
    session.add(delivery)

    if payload.advance_plan:
        plan.current_position += 1
        plan.updated_at = now
        session.add(plan)
    session.commit()
    session.refresh(plan)
    session.refresh(delivery)
    return LessonDeliveryRead(
        id=delivery.id,
        plan_id=delivery.plan_id,
        lesson_id=delivery.lesson_id,
        lesson_title=lesson.title,
        booking_id=delivery.booking_id,
        delivered_at=delivery.delivered_at,
        teacher_notes=delivery.teacher_notes,
        homework_assignment_ids=homework_ids,
        plan_current_position_after=plan.current_position,
    )


# --- Phase 6: Publish a curriculum as a sellable module -------------


class PublishAsModulePayload(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    summary: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = Field(default=None, max_length=4000)
    price_cents: int = Field(default=0, ge=0, le=1_000_000)
    currency: str = Field(default="eur", max_length=3)
    is_published: bool = False


class PublishAsModuleResponse(BaseModel):
    module_id: int
    module_slug: str
    article_ids: list[int]


def _slugify(raw: str) -> str:
    out = ""
    for ch in (raw or "").lower():
        if ch.isalnum():
            out += ch
        elif ch in (" ", "-", "_"):
            out += "-"
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")[:60] or "untitled"


def _unique_article_slug(
    base: str, tutor_id: int, session: Session
) -> str:
    candidate = base
    suffix = 1
    while session.exec(
        select(Article).where(
            Article.tutor_id == tutor_id,
            Article.slug == candidate,
        )
    ).first():
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


def _unique_module_slug(
    base: str, tutor_id: int, session: Session
) -> str:
    candidate = base
    suffix = 1
    while session.exec(
        select(LessonModule).where(
            LessonModule.tutor_id == tutor_id,
            LessonModule.slug == candidate,
        )
    ).first():
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


@router.post(
    "/{curriculum_id}/publish-as-module",
    response_model=PublishAsModuleResponse,
    status_code=201,
)
def publish_curriculum_as_module(
    curriculum_id: int,
    payload: PublishAsModulePayload,
    current: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> PublishAsModuleResponse:
    """Copy a curriculum's lessons into a new sellable LessonModule.

    Creates:
      - One Article per lesson (visibility=PUBLIC, body_markdown copied,
        unique per-tutor slug)
      - One LessonModule with items_json referencing those new articles

    The new module is independent — future curriculum edits don't
    propagate. To publish an updated curriculum you'd publish-as-module
    again (creates a new module).
    """
    c = session.get(Curriculum, curriculum_id)
    if c is None or c.archived_at is not None:
        raise HTTPException(404, "Curriculum not found")
    _require_owner(c, current)
    tutor = session.exec(
        select(Tutor).where(Tutor.user_id == current.id)
    ).first()
    if tutor is None:
        raise HTTPException(
            400,
            "Only tutors can publish curriculums as modules. Set up your tutor profile first.",
        )

    lessons = list(
        session.exec(
            select(CurriculumLesson)
            .where(
                CurriculumLesson.curriculum_id == c.id,
                CurriculumLesson.archived_at.is_(None),
            )
            .order_by(CurriculumLesson.position)
        ).all()
    )
    if not lessons:
        raise HTTPException(
            400, "Curriculum has no lessons to publish."
        )

    now = datetime.now(UTC)
    article_ids: list[int] = []
    for l in lessons:
        slug = _unique_article_slug(_slugify(l.title), tutor.id, session)
        article = Article(
            tutor_id=tutor.id,
            slug=slug,
            title=l.title,
            summary=l.summary,
            body_markdown=l.body_markdown or "",
            visibility=ArticleVisibility.PUBLIC,
            price_cents=0,
            currency="eur",
            is_published=payload.is_published,
            published_at=now if payload.is_published else None,
            created_at=now,
            updated_at=now,
        )
        session.add(article)
        session.flush()
        article_ids.append(article.id)

    items_json = json.dumps(
        [{"kind": "article", "ref_id": aid} for aid in article_ids]
    )
    module_base = _slugify(payload.title or c.title)
    module_slug = _unique_module_slug(module_base, tutor.id, session)
    module = LessonModule(
        tutor_id=tutor.id,
        slug=module_slug,
        title=payload.title or c.title,
        summary=payload.summary,
        description=payload.description or c.description,
        featured_image_url=c.cover_image_url,
        items_json=items_json,
        price_cents=payload.price_cents,
        currency=payload.currency,
        is_published=payload.is_published,
        published_at=now if payload.is_published else None,
        created_at=now,
        updated_at=now,
    )
    session.add(module)
    session.commit()
    session.refresh(module)
    return PublishAsModuleResponse(
        module_id=module.id,
        module_slug=module.slug,
        article_ids=article_ids,
    )
