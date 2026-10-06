"""Identify Target: audience cards for a campaign (client brief 4.4).

Editing a card, its versions and choosing the primary audience use the shared item
routes in app/routers/items.py. This router adds what is particular to audiences.
"""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audiences, items, jobs, pipeline
from app.ai import audience, brief_summary, safety
from app.ai.provider import AiProvider, get_ai_provider
from app.db import get_db
from app.deps import get_current_user, get_editable_project, get_owned_project
from app.events import track
from app.models import Brief, CampaignItem, ItemKind, JobKind, Project, User
from app.routers.items import item_out
from app.schemas.audience import AudienceCardOut, AudienceStage, Exclusions
from app.schemas.job import JobOut

router = APIRouter(prefix="/projects/{project_id}/audiences", tags=["audiences"])


def _user_text(db: Session, project: Project) -> str:
    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    facts = brief_summary.brief_facts(brief) if brief else {}
    return safety.user_words(facts, list(project.audience_exclusions or []))


def _stage(db: Session, project: Project) -> AudienceStage:
    user_text = _user_text(db, project)
    job = jobs.latest_job(db, project.id, JobKind.AUDIENCE)
    return AudienceStage(
        cards=[
            AudienceCardOut(**item_out(db, i).model_dump(), review_flags=audiences.flags_for(i, user_text))
            for i in items.live_items(db, project.id, ItemKind.AUDIENCE)
        ],
        exclusions=list(project.audience_exclusions or []),
        job=JobOut.model_validate(job) if job else None,
        blocked_reason=pipeline.missing_prerequisite(db, project, JobKind.AUDIENCE),
    )


@router.get("", response_model=AudienceStage)
def get_audiences(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> AudienceStage:
    stage = _stage(db, project)
    db.commit()  # also saves a stale job being marked failed
    return stage


@router.post("/generate", response_model=JobOut, status_code=202)
def generate_audiences(
    background: BackgroundTasks,
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    provider: AiProvider = Depends(get_ai_provider),
    session_factory: jobs.SessionFactory = Depends(jobs.get_session_factory),
):
    """Start (or rejoin) a generation. Cards the user chose, approved, wrote or edited stay."""
    pipeline.require_ready(db, project, JobKind.AUDIENCE)
    return jobs.start_job(
        db, background, project, user, JobKind.AUDIENCE, audiences.job_input(db, project),
        provider=provider, session_factory=session_factory,
    )


@router.post("", response_model=AudienceCardOut, status_code=201)
def add_own_audience(
    body: audience.AudienceCard,
    project: Project = Depends(get_editable_project),
    db: Session = Depends(get_db),
):
    """The user writes their own audience instead of, or as well as, the AI's."""
    item = audiences.add_own(db, project, body)
    track(db, "audience_written", user_id=project.owner_id, project_id=project.id)
    project.updated_at = func.now()
    db.commit()
    db.refresh(item)
    return AudienceCardOut(**item_out(db, item).model_dump(), review_flags=audiences.flags_for(item, _user_text(db, project)))


@router.delete("/{item_id}", status_code=204)
def remove_audience(item_id: uuid.UUID, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    """Take a card off the list. It is archived with its history, not deleted."""
    item = db.get(CampaignItem, item_id, with_for_update=True)
    if item is None or item.project_id != project.id or item.kind != ItemKind.AUDIENCE or item.archived_at is not None:
        raise HTTPException(status_code=404, detail="Audience not found.")
    items.archive(db, item)
    project.updated_at = func.now()
    db.commit()


@router.put("/exclusions", response_model=AudienceStage)
def set_exclusions(body: Exclusions, project: Project = Depends(get_editable_project), db: Session = Depends(get_db)):
    """Who the campaign must not target. Later stages get this list with every generation."""
    project.audience_exclusions = body.exclusions
    project.updated_at = func.now()
    db.commit()
    db.refresh(project)
    return _stage(db, project)
