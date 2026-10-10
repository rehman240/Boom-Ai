"""Allocate Budget: one plan item per campaign, its media lines always adding up to the budget.

The AI suggests the mix; every amount after that is the user's, changed through the
operations below so the arithmetic stays in one place. Changing a line moves only the
lines that aren't locked. Generating again is the user's explicit choice: it replaces the
plan (their edits are kept in its history first), but never an approved one.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import budget_math, items, pipeline
from app.ai import budget
from app.ai.provider import AiProvider
from app.models import AiJob, Brief, CampaignItem, ItemKind, JobKind, Project, ProjectStage, Revision, RevisionSource

pipeline.ITEM_SCHEMAS[ItemKind.BUDGET] = lambda item: budget.BudgetPlan

NEEDS_BUDGET = "Add a total budget to the brief first."


def plan_item(db: Session, project_id: uuid.UUID) -> CampaignItem | None:
    return next((i for i in items.live_items(db, project_id, ItemKind.BUDGET) if i.key == budget.ITEM_KEY), None)


def _brief(db: Session, project: Project) -> Brief | None:
    return db.scalar(select(Brief).where(Brief.project_id == project.id))


def to_cents(amount: Decimal | None) -> int:
    return int((amount or 0) * 100)


def brief_total(db: Session, project: Project) -> int:
    brief = _brief(db, project)
    return to_cents(brief.budget_amount) if brief else 0


def brief_dates(db: Session, project: Project) -> tuple[date | None, date | None]:
    brief = _brief(db, project)
    return (brief.start_date, brief.end_date) if brief else (None, None)


def missing_prerequisite(db: Session, project: Project) -> str | None:
    reason = pipeline.missing_prerequisite(db, project, JobKind.BUDGET)
    if reason is None and brief_total(db, project) <= 0:
        reason = NEEDS_BUDGET
    return reason


# --- The AI step --------------------------------------------------------------------------


def _base_input(db: Session, project: Project) -> dict[str, Any]:
    ctx = pipeline.context(db, project)
    return {"context": ctx, "context_hash": pipeline.context_hash(ctx), "total_cents": brief_total(db, project)}


def current_hash(db: Session, project: Project) -> str:
    return _base_input(db, project)["context_hash"]


def job_input(db: Session, project: Project) -> dict[str, Any]:
    return _base_input(db, project)


def run(provider: AiProvider, job_input: dict[str, Any]) -> dict[str, Any]:
    return budget.generate(provider, job_input).model_dump()


def apply(db: Session, job: AiJob, result: dict[str, Any], provider: AiProvider) -> None:
    provenance = items.Provenance(provider.name, provider.model, budget.PROMPT_VERSION, job.id)
    suggestion = budget.BudgetSuggestion.model_validate(result)
    data = budget.plan_from(suggestion, job.input["total_cents"])
    current = plan_item(db, job.project_id)
    if current is None:
        items.add_item(db, job.project_id, ItemKind.BUDGET, budget.ITEM_KEY, data, provenance=provenance)
    else:
        # Production costs are the user's own figures; a new mix doesn't wipe them.
        typed = [p for p in current.data.get("production", []) if p.get("amount_cents") is not None]
        if typed:
            data["production"] = typed + [
                p for p in data["production"] if p["item"] not in {t["item"] for t in typed}
            ][: budget.MAX_PRODUCTION - len(typed)]
        items.replace_by_ai(db, items.lock(db, current.id), data, provenance)
    project = db.get(Project, job.project_id)
    if project is not None:
        pipeline.advance(project, ProjectStage.BUDGET)


# --- The user's changes -------------------------------------------------------------------


def _save(db: Session, item: CampaignItem, data: dict[str, Any]) -> CampaignItem:
    """Check the whole plan, then autosave it like any other edit (no revision)."""
    try:
        clean = budget.BudgetPlan.model_validate(data).model_dump()
    except ValueError as e:
        raise budget_math.BudgetError(_first_error(e)) from None
    return items.edit(db, item, clean)


def _first_error(e: ValueError) -> str:
    errors = getattr(e, "errors", None)
    if callable(errors):
        first = errors()[0]
        msg = str(first.get("msg", "This change doesn't fit the plan."))
        return msg.removeprefix("Value error, ")
    return str(e)


def _line(data: dict[str, Any], line_id: str) -> dict[str, Any]:
    line = next((line for line in data["lines"] if line["id"] == line_id), None)
    if line is None:
        raise LookupError(line_id)
    return line


def change_line(
    db: Session,
    item: CampaignItem,
    line_id: str,
    *,
    amount_cents: int | None = None,
    locked: bool | None = None,
    channel: str | None = None,
    role: str | None = None,
) -> CampaignItem:
    """Change one media line. A new amount is kept and the unlocked lines absorb the difference."""
    data = dict(item.data)
    _line(data, line_id)
    lines = []
    for line in data["lines"]:
        if line["id"] == line_id:
            line = {**line}
            if amount_cents is not None:
                line["amount_cents"] = amount_cents
            if locked is not None:
                line["locked"] = locked
            if channel is not None:
                line["channel"] = channel
            if role is not None:
                line["role"] = role
        lines.append(line)
    if amount_cents is not None:
        lines = budget_math.rebalance(lines, data["total_cents"], {line_id})
    return _save(db, item, {**data, "lines": lines})


def add_line(db: Session, item: CampaignItem, channel: str, role: str = "") -> CampaignItem:
    """A new channel starts at $0, so nothing else moves until the user gives it an amount."""
    data = dict(item.data)
    if len(data["lines"]) >= budget.MAX_LINES:
        raise budget_math.BudgetError(f"A plan can have at most {budget.MAX_LINES} channels.")
    if any(line["channel"].strip().lower() == channel.strip().lower() for line in data["lines"]):
        raise budget_math.BudgetError("That channel is already in the plan.")
    line = {"id": budget.new_id(), "channel": channel, "role": role, "amount_cents": 0, "locked": False}
    return _save(db, item, {**data, "lines": [*data["lines"], line]})


def remove_line(db: Session, item: CampaignItem, line_id: str) -> CampaignItem:
    """Its amount goes to the other unlocked channels."""
    data = dict(item.data)
    _line(data, line_id)
    if len(data["lines"]) == 1:
        raise budget_math.BudgetError("A plan needs at least one channel.")
    lines = [line for line in data["lines"] if line["id"] != line_id]
    lines = budget_math.rebalance(lines, data["total_cents"])
    return _save(db, item, {**data, "lines": lines})


def fit_to_total(db: Session, item: CampaignItem, total_cents: int) -> CampaignItem:
    """The brief's budget changed: spread the new total, keeping locked channels as they are."""
    if total_cents <= 0:
        raise budget_math.BudgetError(NEEDS_BUDGET)
    lines = budget_math.rebalance(item.data["lines"], total_cents)
    return _save(db, item, {**item.data, "total_cents": total_cents, "lines": lines})


def reset_to_suggestion(db: Session, item: CampaignItem) -> CampaignItem:
    """"Reset suggestion": the AI's latest mix comes back as a new version. The user's
    production costs stay, and their changes before the reset are kept in the history."""
    number = db.scalar(
        select(Revision.number)
        .where(Revision.item_id == item.id, Revision.source == RevisionSource.GENERATED)
        .order_by(Revision.number.desc())
        .limit(1)
    )
    if number is None:
        raise budget_math.BudgetError("There is no AI suggestion to go back to.")
    items.restore(db, item, number, keep=("production",))
    return item
