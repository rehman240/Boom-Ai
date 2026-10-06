"""The staged generation pipeline, as the client brief lays it out:

    brief summary -> audience options -> campaign directions -> assets

Each stage builds only on what the user confirmed or chose in the stage before it, and
its output is stored as campaign items (see app/items.py). This module answers two
questions for every stage: may it run yet, and what does the AI get to work from.
"""

import hashlib
import json
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import items
from app.ai import brief_summary
from app.models import AiJob, Brief, CampaignItem, ItemKind, JobKind, Project, ProjectStage, Revision, RevisionSource

# What each stage needs before it can run, with the message shown when it is missing.
_NEEDS_SUMMARY = "Confirm the brief summary first."
_NEEDS_AUDIENCE = "Choose a primary audience first."
_NEEDS_DIRECTION = "Choose a campaign direction first."

# Each kind of item has one schema its data must keep, registered by its stage module.
# Edits are checked against it, so a field can't be renamed, dropped or given a wrong type.
ITEM_SCHEMAS: dict[str, Callable[[CampaignItem], type[BaseModel]]] = {}


def _brief(db: Session, project: Project) -> Brief | None:
    return db.scalar(select(Brief).where(Brief.project_id == project.id))


def missing_prerequisite(db: Session, project: Project, kind: str) -> str | None:
    """Why this stage can't run yet, or None if it can."""
    brief = _brief(db, project)
    if brief is None or not brief_summary.is_confirmed(brief):
        return _NEEDS_SUMMARY
    if kind == JobKind.AUDIENCE:
        return None
    if items.selected_item(db, project.id, ItemKind.AUDIENCE) is None:
        return _NEEDS_AUDIENCE
    if kind == JobKind.DIRECTIONS:
        return None
    if items.selected_item(db, project.id, ItemKind.DIRECTION) is None:
        return _NEEDS_DIRECTION
    return None


def require_ready(db: Session, project: Project, kind: str) -> None:
    reason = missing_prerequisite(db, project, kind)
    if reason is not None:
        raise HTTPException(status_code=409, detail=reason)


def context(db: Session, project: Project) -> dict[str, Any]:
    """What the AI works from: the user's own brief facts, the summary they confirmed, and
    the audience and direction they chose. Stored with the job, so a retry sees the same."""
    brief = _brief(db, project)
    ctx: dict[str, Any] = {}
    if brief is not None:
        ctx["brief"] = brief_summary.brief_facts(brief)
        if brief_summary.is_confirmed(brief):
            ctx["summary"] = brief.summary["data"]
    if project.audience_exclusions:
        ctx["exclusions"] = list(project.audience_exclusions)
    audience = items.selected_item(db, project.id, ItemKind.AUDIENCE)
    if audience is not None:
        ctx["audience"] = audience.data
    direction = items.selected_item(db, project.id, ItemKind.DIRECTION)
    if direction is not None:
        ctx["direction"] = direction.data
    return ctx


def context_hash(ctx: dict[str, Any], *, leave_out: tuple[str, ...] = ()) -> str:
    """Fingerprint of what a stage was built from. When it no longer matches the current
    context, the screen can say the work is based on an older brief or choice."""
    kept = {k: v for k, v in ctx.items() if k not in leave_out}
    return hashlib.sha256(json.dumps(kept, sort_keys=True, default=str).encode()).hexdigest()


def is_outdated(db: Session, item: CampaignItem, current_hash: str) -> bool:
    """What this item was made from (by its latest whole AI generation) has changed since."""
    job_id = db.scalar(
        select(Revision.job_id)
        .where(
            Revision.item_id == item.id,
            Revision.job_id.is_not(None),
            Revision.source == RevisionSource.GENERATED,
        )
        .order_by(Revision.number.desc())
        .limit(1)
    )
    job = db.get(AiJob, job_id) if job_id else None
    made_from = (job.input or {}).get("context_hash") if job else None
    return made_from is not None and made_from != current_hash


# Choosing in one stage opens the next one.
NEXT_STAGE_ON_SELECT = {ItemKind.AUDIENCE: ProjectStage.CAMPAIGN, ItemKind.DIRECTION: ProjectStage.CREATIVE}


def advance(project: Project, stage: str) -> None:
    """Move the campaign on to `stage`, never back: the progress bar shows how far it got."""
    order = list(ProjectStage)
    if order.index(ProjectStage(stage)) > order.index(ProjectStage(project.stage)):
        project.stage = stage


def validate_data(item: CampaignItem, data: dict[str, Any]) -> dict[str, Any]:
    """Check an item's data against its schema. Raises ValueError with a plain message."""
    schema_for = ITEM_SCHEMAS.get(item.kind)
    if schema_for is None:
        raise ValueError("This item can't be edited yet.")
    try:
        return schema_for(item).model_validate(data).model_dump()
    except ValidationError as e:
        first = e.errors()[0]
        field = ".".join(str(p) for p in first["loc"]) or "data"
        raise ValueError(f"{field}: {first['msg']}") from None
