from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_editable_project, get_owned_project
from app.events import track
from app.models import Brief, Project, ProjectStatus
from app.schemas.brief import REQUIRED_FIELDS, BriefOut, BriefState, BriefUpdate

router = APIRouter(prefix="/projects/{project_id}/brief", tags=["brief"])


def _brief_for(project: Project, db: Session) -> Brief:
    """Campaigns get their brief at creation; older rows are healed rather than 404'd."""
    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    if brief is None:
        brief = Brief(project_id=project.id)
        db.add(brief)
        db.flush()
    return brief


def _missing_required(brief: Brief) -> list[str]:
    return [f for f in REQUIRED_FIELDS if getattr(brief, f) in (None, "", [])]


def _state(brief: Brief) -> BriefState:
    return BriefState(brief=BriefOut.model_validate(brief), missing_required=_missing_required(brief))


@router.get("", response_model=BriefState)
def get_brief(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> BriefState:
    brief = _brief_for(project, db)
    db.commit()
    return _state(brief)


@router.patch("", response_model=BriefState)
def update_brief(
    body: BriefUpdate,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
) -> BriefState:
    """Autosave. Only the fields actually sent are touched, so nothing else is overwritten."""
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to save.")

    brief = _brief_for(project, db)
    for field, value in changes.items():
        setattr(brief, field, value)

    if project.status == ProjectStatus.DRAFT:
        project.status = ProjectStatus.IN_PROGRESS
        track(db, "brief_started", user_id=project.owner_id, project_id=project.id)
    # The brief is part of the campaign, so editing it counts as editing the campaign.
    # Without this the dashboard would keep showing the moment the campaign was created.
    project.updated_at = func.now()

    db.commit()
    db.refresh(brief)
    return _state(brief)
