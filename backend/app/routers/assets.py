"""Creative Workspace: the campaign's seven assets (client brief 4.6).

Editing, saving and restoring versions, and approving an asset use the shared item routes
in app/routers/items.py. This router adds the asset definitions and generation.
"""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import creative, jobs, pipeline
from app.ai import assets, brief_summary, safety
from app.ai.provider import AiProvider, get_ai_provider
from app.db import get_db
from app.deps import get_current_user, get_editable_project, get_owned_project
from app.models import Brief, CampaignItem, ItemKind, ItemOrigin, JobKind, Project, User
from app.routers.items import item_out
from app.schemas.asset import AssetOut, AssetSpecOut, AssetStage
from app.schemas.job import JobOut

router = APIRouter(prefix="/projects/{project_id}/assets", tags=["assets"])

ALL_KEPT = (
    "Every asset is edited, saved or approved, so there is nothing to replace. "
    "Rewrite single fields instead."
)

SPEC = [AssetSpecOut.from_spec(a) for a in assets.ASSETS]


def _user_text(db: Session, project: Project) -> str:
    brief = db.scalar(select(Brief).where(Brief.project_id == project.id))
    facts = brief_summary.brief_facts(brief) if brief else {}
    return safety.user_words(facts, list(project.audience_exclusions or []))


def _stage(db: Session, project: Project) -> AssetStage:
    user_text = _user_text(db, project)
    now = creative.current_hash(db, project)
    current = creative.by_key(db, project.id)
    whole = jobs.latest_job(db, project.id, JobKind.ASSETS)
    return AssetStage(
        spec=SPEC,
        assets=[
            AssetOut(
                **item_out(db, item).model_dump(),
                review_flags=assets.review_flags(item.data, by_ai=item.origin == ItemOrigin.AI, user_text=user_text),
                outdated=pipeline.is_outdated(db, item, now),
            )
            for a in assets.ASSETS
            if (item := current.get(a.key)) is not None
        ],
        job=JobOut.model_validate(whole) if whole else None,
        field_jobs={target: JobOut.model_validate(job) for target, job in jobs.latest_by_target(db, project.id, JobKind.FIELD).items()},
        blocked_reason=pipeline.missing_prerequisite(db, project, JobKind.ASSETS),
    )


@router.get("", response_model=AssetStage)
def get_assets(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)) -> AssetStage:
    out = _stage(db, project)
    db.commit()  # also saves stale jobs being marked failed
    return out


@router.post("/generate", response_model=JobOut, status_code=202)
def generate_assets(
    background: BackgroundTasks,
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    provider: AiProvider = Depends(get_ai_provider),
    session_factory: jobs.SessionFactory = Depends(jobs.get_session_factory),
):
    """Write every asset the user hasn't edited, saved or approved."""
    pipeline.require_ready(db, project, JobKind.ASSETS)
    running = jobs.active_job(db, project.id, JobKind.ASSETS)
    if running is None and not creative.open_assets(db, project.id):
        raise HTTPException(status_code=409, detail=ALL_KEPT)
    return jobs.start_job(
        db, background, project, user, JobKind.ASSETS, creative.all_input(db, project),
        provider=provider, session_factory=session_factory,
    )


@router.post("/{item_id}/fields/{field}/regenerate", response_model=JobOut, status_code=202)
def regenerate_field(
    item_id: uuid.UUID,
    field: str,
    background: BackgroundTasks,
    project: Project = Depends(get_editable_project),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    provider: AiProvider = Depends(get_ai_provider),
    session_factory: jobs.SessionFactory = Depends(jobs.get_session_factory),
):
    """Rewrite one field of one asset. Every other field, and every other asset, stays as it is."""
    item = db.get(CampaignItem, item_id)
    if item is None or item.project_id != project.id or item.kind != ItemKind.ASSET or item.archived_at is not None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if assets.field_spec(item.key, field) is None:
        raise HTTPException(status_code=404, detail="Field not found.")
    pipeline.require_ready(db, project, JobKind.ASSETS)
    if item.approved_at is not None:
        raise HTTPException(status_code=409, detail="This asset is approved. Unapprove it to change it.")
    return jobs.start_job(
        db, background, project, user, JobKind.FIELD, creative.field_input(db, project, item, field),
        provider=provider, session_factory=session_factory, target=creative.field_target(item, field),
    )
