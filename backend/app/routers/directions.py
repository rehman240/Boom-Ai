"""Generate Campaign: three campaign directions (client brief 4.5).

Editing, versions (the "short history"), approval and choosing a direction use the shared
item routes in app/routers/items.py. This router adds generating and regenerating.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import directions as stage
from app import jobs, pipeline
from app.ai import brief_summary, directions, safety
from app.ai.provider import AiProvider, get_ai_provider
from app.db import get_db
from app.deps import get_current_user, get_editable_project, get_owned_project
from app.models import Brief, ItemOrigin, JobKind, Project, User
from app.routers.items import item_out
from app.schemas.direction import DirectionOut, DirectionStage
from app.schemas.job import JobOut

router = APIRouter(prefix="/projects/{project_id}/directions", tags=["directions"])

ALL_KEPT = (
    "All three directions are chosen, approved or edited, so there is nothing to replace. "
    "Regenerate one direction at a time instead."
)


def _user_text(db: Session, project: Project) -> str:
    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    facts = brief_summary.brief_facts(brief) if brief else {}
    return safety.user_words(facts, list(project.audience_exclusions or []))


def _job(job) -> JobOut | None:
    return JobOut.model_validate(job) if job else None


def _stage(db: Session, project: Project) -> DirectionStage:
    user_text = _user_text(db, project)
    now = stage.current_hash(db, project)
    slots = stage.by_slot(db, project.id)
    out = []
    for slot in directions.SLOTS:
        item = slots.get(slot)
        if item is None:
            continue
        out.append(
            DirectionOut(
                **item_out(db, item).model_dump(),
                slot=slot,
                review_flags=directions.review_flags(item.data, by_ai=item.origin == ItemOrigin.AI, user_text=user_text),
                outdated=stage.is_outdated(db, project, item, now),
            )
        )
    return DirectionStage(
        directions=out,
        job=_job(jobs.latest_job(db, project.id, JobKind.DIRECTIONS)),
        slot_jobs={
            slot: job
            for slot in directions.SLOTS
            if (job := _job(jobs.latest_job(db, project.id, JobKind.DIRECTIONS, slot))) is not None
        },
        blocked_reason=pipeline.missing_prerequisite(db, project, JobKind.DIRECTIONS),
    )


@router.get("", response_model=DirectionStage)
def get_directions(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> DirectionStage:
    out = _stage(db, project)
    db.commit()  # also saves stale jobs being marked failed
    return out


@router.post("/generate", response_model=JobOut, status_code=202)
def generate_directions(
    background: BackgroundTasks,
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    provider: AiProvider = Depends(get_ai_provider),
    session_factory: jobs.SessionFactory = Depends(jobs.get_session_factory),
):
    """Fill every slot the user hasn't chosen, approved or edited."""
    pipeline.require_ready(db, project, JobKind.DIRECTIONS)
    running = jobs.active_job(db, project.id, JobKind.DIRECTIONS)
    if running is None and not stage.open_slots(db, project.id):
        raise HTTPException(status_code=409, detail=ALL_KEPT)
    return jobs.start_job(
        db, background, project, user, JobKind.DIRECTIONS, stage.all_input(db, project),
        provider=provider, session_factory=session_factory,
    )


@router.post("/{slot}/regenerate", response_model=JobOut, status_code=202)
def regenerate_direction(
    slot: str,
    background: BackgroundTasks,
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    provider: AiProvider = Depends(get_ai_provider),
    session_factory: jobs.SessionFactory = Depends(jobs.get_session_factory),
):
    """Replace one direction. The others stay exactly as they are; its old text stays in its history."""
    if slot not in directions.SLOTS:
        raise HTTPException(status_code=404, detail="Direction not found.")
    pipeline.require_ready(db, project, JobKind.DIRECTIONS)
    current = stage.by_slot(db, project.id).get(slot)
    if current is not None and current.approved_at is not None:
        raise HTTPException(status_code=409, detail="This direction is approved. Unapprove it to regenerate it.")
    return jobs.start_job(
        db, background, project, user, JobKind.DIRECTIONS, stage.slot_input(db, project, slot),
        provider=provider, session_factory=session_factory, target=slot,
    )
