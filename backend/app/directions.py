"""Generate Campaign: three direction slots, generated together or one at a time.

A slot keeps one item for good, so every direction it ever held stays in that item's
history and can be restored. Generating all three fills only the slots the user hasn't
chosen, approved or edited. Regenerating one slot is the user's explicit choice: it may
replace an edited or chosen direction (whose old text stays in its history), but never an
approved one.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import items, pipeline
from app.ai import directions
from app.ai.provider import AiProvider
from app.models import AiJob, CampaignItem, ItemKind, Project, Revision

pipeline.ITEM_SCHEMAS[ItemKind.DIRECTION] = lambda item: directions.Direction

# A direction is built from everything before it, but not from the chosen direction itself.
_NOT_AN_INPUT = ("direction",)


def by_slot(db: Session, project_id: uuid.UUID) -> dict[str, CampaignItem]:
    return {i.key: i for i in items.live_items(db, project_id, ItemKind.DIRECTION) if i.key in directions.SLOTS}


def open_slots(db: Session, project_id: uuid.UUID) -> list[str]:
    """Slots a whole generation may fill: empty ones and ones the user hasn't touched."""
    slots = by_slot(db, project_id)
    return [s for s in directions.SLOTS if s not in slots or not items.user_touched(db, slots[s])]


def _base_input(db: Session, project: Project) -> dict[str, Any]:
    ctx = pipeline.context(db, project)
    ctx.pop("direction", None)
    return {"context": ctx, "context_hash": pipeline.context_hash(ctx, leave_out=_NOT_AN_INPUT)}


def all_input(db: Session, project: Project) -> dict[str, Any]:
    slots = by_slot(db, project.id)
    fill = open_slots(db, project.id)
    keep = [directions.summary_of(slots[s].data) for s in directions.SLOTS if s in slots and s not in fill]
    replace = [directions.summary_of(slots[s].data) for s in fill if s in slots]
    return {**_base_input(db, project), "keep": keep, "replace": replace, "count": len(fill)}


def slot_input(db: Session, project: Project, slot: str) -> dict[str, Any]:
    slots = by_slot(db, project.id)
    current = slots.get(slot)
    keep = [directions.summary_of(slots[s].data) for s in directions.SLOTS if s in slots and s != slot]
    return {
        **_base_input(db, project),
        "slot": slot,
        "keep": keep,
        "replace": [directions.summary_of(current.data)] if current else [],
        "count": 1,
    }


def run(provider: AiProvider, job_input: dict[str, Any]) -> dict[str, Any]:
    return {"directions": [d.model_dump() for d in directions.generate(provider, job_input)]}


def _write(db: Session, project_id: uuid.UUID, slot: str, data: dict[str, Any], provenance: items.Provenance) -> None:
    current = by_slot(db, project_id).get(slot)
    if current is None:
        items.add_item(
            db, project_id, ItemKind.DIRECTION, slot, data,
            position=directions.SLOTS.index(slot), provenance=provenance,
        )
    else:
        items.replace_by_ai(db, items.lock(db, current.id), data, provenance)


def apply(db: Session, job: AiJob, result: dict[str, Any], provider: AiProvider) -> None:
    provenance = items.Provenance(provider.name, provider.model, directions.PROMPT_VERSION, job.id)
    answers = [directions.Direction.model_validate(d).model_dump() for d in result["directions"]]
    if job.target is not None:
        _write(db, job.project_id, job.target, answers[0], provenance)
        return
    # Decided now rather than when the job started, so a direction the user chose or
    # edited while the model was writing is left alone.
    for slot, data in zip(open_slots(db, job.project_id), answers):
        _write(db, job.project_id, slot, data, provenance)


def is_outdated(db: Session, project: Project, item: CampaignItem, current_hash: str) -> bool:
    """The brief, audience or exclusions changed since the AI last wrote this direction."""
    job_id = db.scalar(
        select(Revision.job_id)
        .where(Revision.item_id == item.id, Revision.job_id.is_not(None))
        .order_by(Revision.number.desc())
        .limit(1)
    )
    job = db.get(AiJob, job_id) if job_id else None
    made_from = (job.input or {}).get("context_hash") if job else None
    return made_from is not None and made_from != current_hash


def current_hash(db: Session, project: Project) -> str:
    return _base_input(db, project)["context_hash"]
