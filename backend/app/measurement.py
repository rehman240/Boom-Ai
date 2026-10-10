"""Manage Conversions (client brief 4.8): the measurement plan and the results the user enters.

The plan is one campaign item (goal, landing page, tracking checklist, review cadence), so
it has versions and approval like every other stage. It starts from a plain template that
follows the brief's goal; no AI is involved, so nothing here can be invented. Results are
`MetricEntry` rows, and every figure worked out from them says what it is and, when it
can't be worked out, what is missing. There is no live data and no automatic action.
"""

import re
import uuid
from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import items, pipeline
from app.ai import brief_summary
from app.models import Brief, CampaignItem, ItemKind, ItemOrigin, MetricEntry, Project, ProjectStage

PLAN_KEY = "plan"
MAX_CHECKLIST = 15
NEEDS_SUMMARY = "Confirm the brief summary first."

Cadence = Literal["daily", "twice_weekly", "weekly", "every_two_weeks", "end_only"]
CADENCE_DAYS: dict[str, int] = {"daily": 1, "twice_weekly": 3, "weekly": 7, "every_two_weeks": 14}
MAX_REVIEW_DATES = 60


class ChecklistItem(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    text: str = Field(max_length=200)
    done: bool = False


class MeasurementPlan(BaseModel):
    """The shape of the measurement plan item's data. Every save is checked against it."""

    goal: str = Field(default="", max_length=100)  # the action that counts, e.g. "Preorders"
    landing_url: str = Field(default="", max_length=500)  # where the ads send people
    checklist: list[ChecklistItem] = Field(default_factory=list, max_length=MAX_CHECKLIST)
    review_cadence: Cadence = "weekly"

    @model_validator(mode="after")
    def unique_ids(self) -> "MeasurementPlan":
        ids = [c.id for c in self.checklist]
        if len(ids) != len(set(ids)):
            raise ValueError("Every checklist step needs its own id.")
        return self


pipeline.ITEM_SCHEMAS[ItemKind.MEASUREMENT] = lambda item: MeasurementPlan


# --- The template -------------------------------------------------------------------------

_SALES = re.compile(r"\b(sale|sales|sell|buy|purchase|purchases|order|orders|preorder|preorders|pre-order|pre-orders|checkout|shop)\b", re.I)
_LEADS = re.compile(r"\b(lead|leads|sign[ -]?ups?|register|registrations?|subscribe|subscribers|subscriptions?|book|booking|bookings|enquir\w*|inquir\w*|contact|quote|quotes|demo|demos|call|calls|waitlist|download)\b", re.I)


def goal_kind(goal: str) -> Literal["sales", "leads", "general"]:
    """Which checklist fits the goal the user wrote in their own words."""
    if _SALES.search(goal or ""):
        return "sales"
    if _LEADS.search(goal or ""):
        return "leads"
    return "general"


def _step(text: str) -> dict[str, Any]:
    return {"id": uuid.uuid4().hex[:12], "text": text, "done": False}


def template_checklist(goal: str, channels: list[str]) -> list[dict[str, Any]]:
    kind = goal_kind(goal)
    steps = [
        "Add the landing page link to every ad, with UTM tags, so you can see which channel each visit came from.",
        "Install the tracking pixel or tag of each ad platform you use on the landing page (for example the Meta Pixel "
        "or the Google tag).",
    ]
    if kind == "sales":
        steps += [
            "Track the order confirmation or thank-you page as the conversion.",
            "Record the value of each order, so revenue can be compared with spend.",
        ]
    elif kind == "leads":
        steps += [
            "Track the thank-you page shown after the form as the conversion.",
            "Decide where new leads are kept (for example a spreadsheet or a CRM) and who replies to them, and how fast.",
        ]
    else:
        steps.append("Choose the one action on the page that counts as a conversion, and track it.")
    if any(c.lower() == "email" for c in channels):
        steps.append("Use a separate tracked link in each email, so email visits are counted on their own.")
    steps.append("Make a test visit and a test conversion, and check that each platform records them before any money is spent.")
    return [_step(s) for s in steps]


def default_cadence(start: date | None, end: date | None) -> str:
    """Short campaigns are checked more often, so a problem doesn't eat the whole budget."""
    if not start or not end or end < start:
        return "weekly"
    days = (end - start).days + 1
    if days <= 7:
        return "daily"
    if days <= 21:
        return "twice_weekly"
    if days <= 90:
        return "weekly"
    return "every_two_weeks"


def review_dates(cadence: str, start: date | None, end: date | None) -> list[date]:
    """The days to look at the numbers: every step after the start, and always the last day."""
    if not start or not end or end < start:
        return []
    step = CADENCE_DAYS.get(cadence)
    dates: list[date] = []
    if step:
        day = start + timedelta(days=step)
        while day < end and len(dates) < MAX_REVIEW_DATES - 1:
            dates.append(day)
            day += timedelta(days=step)
    dates.append(end)
    return dates


# --- Reading and creating the plan --------------------------------------------------------


def _brief(db: Session, project: Project) -> Brief | None:
    return db.scalar(select(Brief).where(Brief.project_id == project.id))


def plan_item(db: Session, project_id: uuid.UUID) -> CampaignItem | None:
    return next((i for i in items.live_items(db, project_id, ItemKind.MEASUREMENT) if i.key == PLAN_KEY), None)


def missing_prerequisite(db: Session, project: Project) -> str | None:
    brief = _brief(db, project)
    return None if brief is not None and brief_summary.is_confirmed(brief) else NEEDS_SUMMARY


def create_plan(db: Session, project: Project) -> CampaignItem:
    """The measurement plan, started from the template and the user's own brief."""
    brief = _brief(db, project)
    goal = (brief.goal or "") if brief else ""
    channels = list(brief.channels or []) if brief else []
    plan = MeasurementPlan(
        goal=goal,
        landing_url=(brief.product_url or "") if brief else "",
        checklist=template_checklist(goal, channels),
        review_cadence=default_cadence(brief.start_date if brief else None, brief.end_date if brief else None),
    )
    item = items.add_item(db, project.id, ItemKind.MEASUREMENT, PLAN_KEY, plan.model_dump(), origin=ItemOrigin.USER)
    pipeline.advance(project, ProjectStage.CONVERSIONS)
    return item


def set_step_done(db: Session, item: CampaignItem, step_id: str, done: bool) -> CampaignItem:
    """Ticking a step is progress, not a change to the plan, so it keeps an approval and makes no version."""
    if not any(c["id"] == step_id for c in item.data["checklist"]):
        raise LookupError(step_id)
    item.data = {
        **item.data,
        "checklist": [{**c, "done": done} if c["id"] == step_id else c for c in item.data["checklist"]],
    }
    db.flush()
    return item


# --- Results ------------------------------------------------------------------------------


def entries(db: Session, project_id: uuid.UUID) -> list[MetricEntry]:
    return list(
        db.scalars(
            select(MetricEntry)
            .where(MetricEntry.project_id == project_id)
            .order_by(MetricEntry.created_at, MetricEntry.id)
        )
    )


_FIGURES = ("spend_cents", "leads", "sales", "revenue_cents")
_WORDS = {"spend_cents": "spend", "leads": "leads", "sales": "sales", "revenue_cents": "revenue"}


def totals(rows: list[MetricEntry]) -> dict[str, int | None]:
    """Each figure summed over the entries that have it; None if no entry has it."""
    out: dict[str, int | None] = {}
    for f in _FIGURES:
        values = [getattr(r, f) for r in rows if getattr(r, f) is not None]
        out[f] = sum(values) if values else None
    return out


def _ratio(
    rows: list[MetricEntry],
    key: str,
    label: str,
    unit: str,
    top: str,
    bottom: str,
    definition: str,
    zero_message: str,
    scale: float = 1.0,
) -> dict[str, Any]:
    """`top` divided by `bottom`, using only the entries that have both, so a missing
    figure in one period never skews the result."""
    result: dict[str, Any] = {
        "key": key, "label": label, "unit": unit, "value": None, "definition": definition, "missing": None, "note": None,
    }
    if not rows:
        result["missing"] = "Add your first results to see this."
        return result
    both = [r for r in rows if getattr(r, top) is not None and getattr(r, bottom) is not None]
    if not both:
        result["missing"] = f"Add {_WORDS[top]} and {_WORDS[bottom]} in the same entry to see {label.lower()}."
        return result
    t = sum(getattr(r, top) for r in both)
    b = sum(getattr(r, bottom) for r in both)
    if b == 0:
        result["missing"] = zero_message
        return result
    result["value"] = round(t / b * scale, 4)
    if len(both) < len(rows):
        result["note"] = (
            f"Based on {len(both)} of {len(rows)} entries; the others are missing {_WORDS[top]} or {_WORDS[bottom]}."
        )
    return result


def results(rows: list[MetricEntry], media_budget_cents: int) -> list[dict[str, Any]]:
    """The simple calculations of client brief 4.8, each with its definition."""
    out = [
        _ratio(rows, "cost_per_lead", "Cost per lead", "money", "spend_cents", "leads",
               "Spend divided by leads.", "No leads yet, so there is no cost per lead."),
        _ratio(rows, "cost_per_sale", "Cost per sale", "money", "spend_cents", "sales",
               "Spend divided by sales.", "No sales yet, so there is no cost per sale."),
        _ratio(rows, "lead_to_sale", "Lead to sale rate", "percent", "sales", "leads",
               "Sales divided by leads, as a percentage.", "No leads yet, so there is no rate.", scale=100),
        _ratio(rows, "roas", "Return on ad spend", "ratio", "revenue_cents", "spend_cents",
               "Revenue divided by spend. 3.0 means $3 back for every $1 spent.", "No spend yet, so there is no return."),
    ]
    spent = totals(rows)["spend_cents"]
    used: dict[str, Any] = {
        "key": "budget_used", "label": "Budget used", "unit": "percent", "value": None,
        "definition": "Spend so far as a share of the media budget.", "missing": None, "note": None,
    }
    if media_budget_cents <= 0:
        used["missing"] = "Add a total budget to the brief to see this."
    elif spent is None:
        used["missing"] = "Add your spend to see this."
    else:
        used["value"] = round(spent / media_budget_cents * 100, 4)
    out.append(used)
    return out


def media_budget(db: Session, project: Project) -> int:
    brief = _brief(db, project)
    return int((brief.budget_amount or 0) * 100) if brief else 0


def brief_dates(db: Session, project: Project) -> tuple[date | None, date | None]:
    brief = _brief(db, project)
    return (brief.start_date, brief.end_date) if brief else (None, None)
