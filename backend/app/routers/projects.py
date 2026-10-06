from fastapi import APIRouter, Depends
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app import items
from app.db import get_db
from app.deps import get_current_user, get_editable_project, get_owned_project
from app.events import track
from app.models import Brief, CampaignItem, ItemKind, Project, ProjectStatus, Upload, User
from app.schemas.project import DashboardOut, ProjectCreate, ProjectOut, ProjectRename, WorkspaceStats
from app.storage import Storage, delete_quietly, get_storage

router = APIRouter(prefix="/projects", tags=["projects"])

# Copied from the source brief when a campaign is duplicated. Listing the columns to
# skip (instead of the ones to copy) means new brief fields are picked up automatically.
BRIEF_SKIP_COLUMNS = {"id", "project_id", "created_at", "updated_at", "summary_confirmed_at"}


def _stats(user: User, db: Session) -> WorkspaceStats:
    counts = dict(
        db.execute(
            select(Project.status, func.count())
            .where(Project.owner_id == user.id)
            .group_by(Project.status)
        ).all()
    )
    return WorkspaceStats(
        active_campaigns=counts.get(ProjectStatus.DRAFT, 0) + counts.get(ProjectStatus.IN_PROGRESS, 0),
        # Real count, so the card never shows an invented number.
        assets_drafted=db.scalar(
            select(func.count())
            .select_from(CampaignItem)
            .join(Project, Project.id == CampaignItem.project_id)
            .where(
                Project.owner_id == user.id,
                CampaignItem.kind == ItemKind.ASSET,
                CampaignItem.archived_at.is_(None),
            )
        ),
        ready_to_export=counts.get(ProjectStatus.READY, 0),
    )


@router.get("", response_model=DashboardOut)
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    """Everything the dashboard needs in one request: the project list and the stat cards."""
    # id breaks ties, so two campaigns edited at the same moment keep a stable order
    # instead of swapping places between refreshes.
    projects = db.scalars(
        select(Project)
        .where(Project.owner_id == user.id)
        .order_by(Project.updated_at.desc(), Project.id.desc())
    ).all()
    return DashboardOut(projects=[ProjectOut.model_validate(p) for p in projects], stats=_stats(user, db))


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Project:
    project = Project(owner_id=user.id, name=body.name)
    db.add(project)
    db.flush()
    # The brief row exists from the start, so autosave has somewhere to write immediately.
    db.add(Brief(project_id=project.id, campaign_type=body.campaign_type, ai_engine=body.ai_engine))
    track(db, "project_created", user_id=user.id, project_id=project.id)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project: Project = Depends(get_owned_project)) -> Project:
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def rename_project(
    body: ProjectRename,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
) -> Project:
    project.name = body.name
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/duplicate", response_model=ProjectOut, status_code=201)
def duplicate_project(
    source: Project = Depends(get_owned_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    """Copy a campaign, its brief and its work. The copy is the user's own draft, never a demo."""
    copy = Project(owner_id=user.id, name=f"{source.name} (copy)"[:200], stage=source.stage)
    db.add(copy)
    db.flush()

    source_brief = db.scalar(select(Brief).where(Brief.project_id == source.id))
    if source_brief is not None:
        columns = inspect(Brief).mapper.column_attrs
        fields = {c.key: getattr(source_brief, c.key) for c in columns if c.key not in BRIEF_SKIP_COLUMNS}
        # The AI summary comes along, but the copy is unconfirmed: the user approves its facts.
        db.add(Brief(project_id=copy.id, **fields))
    else:
        db.add(Brief(project_id=copy.id))

    items.copy_items(db, source.id, copy.id)

    track(db, "project_duplicated", user_id=user.id, project_id=copy.id)
    db.commit()
    db.refresh(copy)
    return copy


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> None:
    # Brief, uploads and jobs go with it (ON DELETE CASCADE); events keep only a null id.
    # The files themselves are not rows, so they are removed from storage separately.
    keys = list(db.scalars(select(Upload.storage_key).where(Upload.project_id == project.id)))
    db.delete(project)
    track(db, "project_deleted", user_id=user.id)
    db.commit()
    delete_quietly(storage, keys)
