"""Identify Target: how audience cards are generated, kept and replaced.

Generating again never erases the user's work. Cards the user chose, approved, wrote or
edited stay; only untouched AI cards are archived (kept, but out of the live set), and
the new cards are asked to differ from the ones that stay.
"""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app import items, pipeline
from app.ai import audience
from app.ai.provider import AiProvider
from app.models import AiJob, CampaignItem, ItemKind, ItemOrigin, Project

pipeline.ITEM_SCHEMAS[ItemKind.AUDIENCE] = lambda item: audience.AudienceCard


def is_kept(db: Session, item: CampaignItem) -> bool:
    """A card the user has put something into, so a new generation must leave it alone."""
    return items.user_touched(db, item)


def job_input(db: Session, project: Project) -> dict[str, Any]:
    """Everything the generation needs, frozen when it starts so a retry sees the same."""
    kept = [i for i in items.live_items(db, project.id, ItemKind.AUDIENCE) if is_kept(db, i)]
    return {
        "context": pipeline.context(db, project),
        "keep": [{"name": i.data.get("name", ""), "definition": i.data.get("definition", "")} for i in kept],
        "count": audience.new_card_count(len(kept)),
    }


def run(provider: AiProvider, job_input: dict[str, Any]) -> dict[str, Any]:
    cards = audience.generate(provider, job_input)
    return {"audiences": [c.model_dump() for c in cards]}


def apply(db: Session, job: AiJob, result: dict[str, Any], provider: AiProvider) -> None:
    """Archive the untouched AI cards and add the new ones after the cards that stay.
    Which cards stay is decided now, not when the job started, so a card chosen or
    edited while the model was writing is kept too."""
    live = items.live_items(db, job.project_id, ItemKind.AUDIENCE)
    kept = []
    for item in live:
        if is_kept(db, item):
            kept.append(item)
        else:
            items.archive(db, item)
    provenance = items.Provenance(provider.name, provider.model, audience.PROMPT_VERSION, job.id)
    start = max((i.position for i in kept), default=-1) + 1
    for offset, card in enumerate(result["audiences"]):
        data = audience.AudienceCard.model_validate(card).model_dump()
        items.add_item(
            db, job.project_id, ItemKind.AUDIENCE, uuid.uuid4().hex[:12], data,
            position=start + offset, provenance=provenance,
        )


def add_own(db: Session, project: Project, card: audience.AudienceCard) -> CampaignItem:
    """An audience the user writes themselves."""
    live = items.live_items(db, project.id, ItemKind.AUDIENCE)
    position = max((i.position for i in live), default=-1) + 1
    return items.add_item(
        db, project.id, ItemKind.AUDIENCE, f"own-{uuid.uuid4().hex[:8]}", card.model_dump(),
        position=position, origin=ItemOrigin.USER,
    )


def flags_for(item: CampaignItem, user_text: str) -> list[dict[str, str]]:
    return audience.review_flags(item.data, by_ai=item.origin == ItemOrigin.AI, user_text=user_text)
