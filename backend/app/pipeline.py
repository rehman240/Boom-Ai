"""The staged generation pipeline, as the client brief lays it out:

    brief summary -> audience options -> campaign directions -> assets

Each stage builds only on what the user confirmed or chose in the stage before it, and
its output is stored as campaign items (see app/items.py). This module answers two
questions for every stage: may it run yet, and what does the AI get to work from.
"""

from collections.abc import Callable
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import items
from app.ai import brief_summary
from app.models import Brief, CampaignItem, ItemKind, JobKind, Project

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
    audience = items.selected_item(db, project.id, ItemKind.AUDIENCE)
    if audience is not None:
        ctx["audience"] = audience.data
    direction = items.selected_item(db, project.id, ItemKind.DIRECTION)
    if direction is not None:
        ctx["direction"] = direction.data
    return ctx


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
