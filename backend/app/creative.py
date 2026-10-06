"""Creative Workspace: the seven assets, generated together or one field at a time.

Each asset is one item for good, keyed by its asset name, so its whole history stays with
it. Generating all assets fills only the ones the user hasn't edited, saved or approved.
Rewriting one field changes that field and nothing else, and never touches approved work.
"""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app import items, pipeline
from app.ai import assets
from app.ai.provider import AiProvider
from app.models import AiJob, CampaignItem, ItemKind, Project

pipeline.ITEM_SCHEMAS[ItemKind.ASSET] = lambda item: assets.MODELS[item.key]


def by_key(db: Session, project_id: uuid.UUID) -> dict[str, CampaignItem]:
    return {i.key: i for i in items.live_items(db, project_id, ItemKind.ASSET) if i.key in assets.BY_KEY}


def open_assets(db: Session, project_id: uuid.UUID) -> list[str]:
    """Assets a whole generation may write: missing ones and ones the user hasn't touched."""
    current = by_key(db, project_id)
    return [a.key for a in assets.ASSETS if a.key not in current or not items.user_touched(db, current[a.key])]


def _base_input(db: Session, project: Project) -> dict[str, Any]:
    ctx = pipeline.context(db, project)
    return {"context": ctx, "context_hash": pipeline.context_hash(ctx)}


def current_hash(db: Session, project: Project) -> str:
    return _base_input(db, project)["context_hash"]


def all_input(db: Session, project: Project) -> dict[str, Any]:
    return _base_input(db, project)


def field_target(item: CampaignItem, field: str) -> str:
    return f"{item.id}:{field}"


def field_input(db: Session, project: Project, item: CampaignItem, field: str) -> dict[str, Any]:
    return {
        **_base_input(db, project),
        "item_id": str(item.id),
        "asset": item.key,
        "field": field,
        "current": dict(item.data),
    }


def run(provider: AiProvider, job_input: dict[str, Any]) -> dict[str, Any]:
    return assets.generate(provider, job_input)


def apply(db: Session, job: AiJob, result: dict[str, Any], provider: AiProvider) -> None:
    """Write every asset the user hasn't touched, decided now rather than when the job began,
    so an asset edited or approved while the model was writing is left alone."""
    provenance = items.Provenance(provider.name, provider.model, assets.PROMPT_VERSION, job.id)
    current = by_key(db, job.project_id)
    for key in open_assets(db, job.project_id):
        data = assets.MODELS[key].model_validate(result[key]).model_dump()
        if key in current:
            items.replace_by_ai(db, items.lock(db, current[key].id), data, provenance)
        else:
            position = [a.key for a in assets.ASSETS].index(key)
            items.add_item(db, job.project_id, ItemKind.ASSET, key, data, position=position, provenance=provenance)


def run_field(provider: AiProvider, job_input: dict[str, Any]) -> dict[str, Any]:
    return {"value": assets.generate_field(provider, job_input)}


def apply_field(db: Session, job: AiJob, result: dict[str, Any], provider: AiProvider) -> None:
    item = items.lock(db, uuid.UUID(job.input["item_id"]))
    if item is None or item.archived_at is not None:
        return
    provenance = items.Provenance(provider.name, provider.model, assets.FIELD_PROMPT_VERSION, job.id)
    items.replace_field_by_ai(db, item, job.input["field"], result["value"], provenance)

