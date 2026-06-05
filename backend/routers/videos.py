from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user
from ..models import (
    Notification,
    Pledge,
    PledgeStatus,
    Project,
    ProjectStatus,
    ProjectUpdate,
    User,
    Video,
    VideoComment,
    VideoResource,
)

router = APIRouter(prefix="/videos", tags=["videos"])


class VideoResourceCreate(BaseModel):
    title: str
    url: str


class VideoResourceRead(BaseModel):
    id: int
    title: str
    url: str

    model_config = ConfigDict(from_attributes=True)


class VideoCreate(BaseModel):
    project_id: int
    title: str
    url: str
    platform: str = "youtube"
    duration: int | None = None
    resources: list[VideoResourceCreate] | None = None


class VideoRead(BaseModel):
    id: int
    title: str
    url: str
    platform: str
    duration: int | None
    created_at: datetime
    project_id: int
    project_title: str
    teacher_name: str
    resources: list[VideoResourceRead] = []

    model_config = ConfigDict(from_attributes=True)


class CommentCreate(BaseModel):
    content: str


class CommentRead(BaseModel):
    id: int
    content: str
    created_at: datetime
    user_id: int
    user_name: str

    model_config = ConfigDict(from_attributes=True)


@router.post("/", response_model=Video)
def create_video(
    video_in: VideoCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Submit a video for a funded project.
    """
    project = session.get(Project, video_in.project_id, options=[selectinload(Project.videos)])

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can submit videos",
        )

    if project.status != ProjectStatus.SUCCESSFUL:
        raise HTTPException(
            status_code=400,
            detail="Project must be SUCCESSFUL to submit videos",
        )

    # Video count validation
    if project.is_series:
        if project.num_videos is None or project.num_videos <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="For a series project, the number of videos must be defined and greater than 0.",
            )
        if len(project.videos) >= project.num_videos:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This series project is limited to {project.num_videos} videos. You have already uploaded {len(project.videos)}.",
            )
    else:
        # For single video projects, only one video is allowed
        if len(project.videos) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This is a single video project. Only one video can be uploaded.",
            )

    video = Video(
        title=video_in.title,
        url=video_in.url,
        platform=video_in.platform,
        duration=video_in.duration,
        project_id=project.id,
    )
    session.add(video)
    session.flush()  # Flush to get the video ID

    if video_in.resources:
        for resource_in in video_in.resources:
            resource = VideoResource(**resource_in.model_dump(), video_id=video.id)
            session.add(resource)

    # Create a project update
    update_content = f"A new video has been posted: '{video.title}'"
    project_update = ProjectUpdate(content=update_content, project_id=project.id)
    session.add(project_update)

    pledges = session.exec(
        select(Pledge).where(
            Pledge.project_id == project.id, Pledge.status == PledgeStatus.CAPTURED
        )
    ).all()

    notified_users = set()
    for pledge in pledges:
        if pledge.user_id not in notified_users:
            notification = Notification(
                user_id=pledge.user_id,
                message=f"New video posted in '{project.title}': {video.title}",
                link=f"/projects/{project.id}",
            )
            session.add(notification)
            notified_users.add(pledge.user_id)

    session.commit()
    session.refresh(video)
    return video


@router.post("/{video_id}/resources", response_model=VideoResourceRead)
def add_resource(
    video_id: int,
    resource_in: VideoResourceCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    video = session.get(Video, video_id, options=[selectinload(Video.project)])
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if video.project.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to add resources to this video")

    resource = VideoResource(**resource_in.model_dump(), video_id=video_id)
    session.add(resource)
    session.commit()
    session.refresh(resource)
    return resource


@router.get("/", response_model=list[VideoRead])
def list_videos(
    limit: int = 10,
    offset: int = 0,
    language: str | None = None,
    level: str | None = None,
    teacher_id: int | None = None,
    project_id: int | None = None,
    session: Session = Depends(get_session),
):
    """
    Public archive of videos.
    """
    query = select(Video).join(Project).where(Project.is_private == False)

    if language:
        query = query.where(Project.language == language)
    if level:
        query = query.where(Project.level == level)
    if teacher_id:
        query = query.where(Project.teacher_id == teacher_id)
    if project_id:
        query = query.where(Video.project_id == project_id)

    query = query.options(
        selectinload(Video.project).selectinload(Project.teacher), selectinload(Video.resources)
    )

    videos = session.exec(query.offset(offset).limit(limit)).all()

    results = []
    for v in videos:
        project_title = v.project.title if v.project else "Unknown"
        teacher_name = (
            v.project.teacher.full_name if (v.project and v.project.teacher) else "Unknown"
        )

        results.append(
            VideoRead(
                id=v.id,
                title=v.title,
                url=v.url,
                platform=v.platform,
                duration=v.duration,
                created_at=v.created_at,
                project_id=v.project_id,
                project_title=project_title,
                teacher_name=teacher_name,
                resources=[VideoResourceRead.model_validate(res) for res in v.resources],
            )
        )

    return results


@router.post("/{video_id}/comments", response_model=CommentRead)
def add_comment(
    video_id: int,
    comment_in: CommentCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    video = session.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    comment = VideoComment(content=comment_in.content, user_id=current_user.id, video_id=video_id)
    session.add(comment)
    session.commit()
    session.refresh(comment)

    return CommentRead(
        id=comment.id,
        content=comment.content,
        created_at=comment.created_at,
        user_id=comment.user_id,
        user_name=current_user.full_name,
    )


@router.get("/{video_id}/comments", response_model=list[CommentRead])
def list_comments(video_id: int, session: Session = Depends(get_session)):
    statement = (
        select(VideoComment)
        .where(VideoComment.video_id == video_id)
        .options(selectinload(VideoComment.user))
        .order_by(VideoComment.created_at.asc())
    )
    comments = session.exec(statement).all()

    results = []
    for c in comments:
        user_name = c.user.full_name if c.user else "Unknown"
        results.append(
            CommentRead(
                id=c.id,
                content=c.content,
                created_at=c.created_at,
                user_id=c.user_id,
                user_name=user_name,
            )
        )
    return results
