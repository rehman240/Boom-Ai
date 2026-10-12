"""Review and Export: the approval checklist and the campaign package (client brief 4.9).

The checklist covers the six parts the client brief names: brief, target, concept, assets,
budget and measurement plan. The package is the campaign as it is now, the same content the
PDF and Word files are built from, so an export always matches what the user approved.
Nothing here publishes anything: the package is a document, and it says so.
"""

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import budget, budget_math, creative, items, measurement
from app.ai import assets, audience, brief_summary, directions, safety
from app.ai import budget as ai_budget
from app.models import Brief, CampaignItem, ItemKind, ItemOrigin, Project, ProjectStatus

APPROVED = "approved"
WAITING = "waiting"  # there is something to approve, but it isn't approved yet
MISSING = "missing"  # the step hasn't been done yet

NOT_PUBLISHED = (
    "Not published. This campaign package is a plan only: nothing has been posted, sent, "
    "or paid for, and no ad account is connected."
)
AI_NOTE = "Written with AI help. AI suggestions need human review: the campaign owner checks and approves each part."
DRAFT_NOTE = "Draft. Some parts are not approved yet, so this package is not final."
FINAL_NOTE = "Final. Every part of this package was approved by the campaign owner."

BRIEF_LABELS = {
    "campaign_type": "Campaign for",
    "business_name": "Business",
    "product_or_service": "Product or service",
    "product_url": "Product page",
    "description": "Description",
    "differentiators": "What makes it different",
    "goal": "Goal",
    "offer_terms": "Price or offer",
    "target_location": "Target location",
    "brand_voice": "Brand voice",
    "exclusions": "Exclusions",
    "channels": "Channels of interest",
    "start_date": "Start date",
    "end_date": "End date",
    "budget": "Budget",
}
CADENCE_LABELS = {
    "daily": "Daily",
    "twice_weekly": "Twice a week",
    "weekly": "Weekly",
    "every_two_weeks": "Every two weeks",
    "end_only": "At the end of the campaign",
}


# --- Reading the campaign -----------------------------------------------------------------


def _brief(db: Session, project: Project) -> Brief | None:
    return db.scalar(select(Brief).where(Brief.project_id == project.id))


def _user_text(brief: Brief | None, project: Project) -> str:
    facts = brief_summary.brief_facts(brief) if brief else {}
    return safety.user_words(facts, list(project.audience_exclusions or []))


class Parts:
    """Everything the checklist and the package read, loaded once."""

    def __init__(self, db: Session, project: Project):
        self.project = project
        self.brief = _brief(db, project)
        self.audience = items.selected_item(db, project.id, ItemKind.AUDIENCE)
        self.direction = items.selected_item(db, project.id, ItemKind.DIRECTION)
        self.assets = creative.by_key(db, project.id)
        self.budget = budget.plan_item(db, project.id)
        self.measurement = measurement.plan_item(db, project.id)
        self.entries = measurement.entries(db, project.id)
        self.user_text = _user_text(self.brief, project)

    @property
    def brief_confirmed(self) -> bool:
        return self.brief is not None and brief_summary.is_confirmed(self.brief)


def _flags(kind: str, item: CampaignItem, user_text: str) -> list[dict[str, str]]:
    by_ai = item.origin == ItemOrigin.AI
    if kind == ItemKind.AUDIENCE:
        return audience.review_flags(item.data, by_ai=by_ai, user_text=user_text)
    if kind == ItemKind.DIRECTION:
        return directions.review_flags(item.data, by_ai=by_ai, user_text=user_text)
    if kind == ItemKind.BUDGET:
        return ai_budget.review_flags(item.data, by_ai=by_ai, user_text=user_text)
    return assets.review_flags(item.data, by_ai=by_ai, user_text=user_text)


# --- The approval checklist ---------------------------------------------------------------


def _row(key: str, label: str, status: str, detail: str, item: CampaignItem | None = None, flags: int = 0) -> dict:
    return {
        "key": key,
        "label": label,
        "status": status,
        "detail": detail,
        "item_ids": [str(item.id)] if item is not None else [],
        "flags": flags,
    }


def _item_row(key: str, label: str, item: CampaignItem | None, missing: str, approve: str, user_text: str) -> dict:
    if item is None:
        return _row(key, label, MISSING, missing)
    flags = len(_flags(item.kind, item, user_text))
    if item.approved_at is not None:
        return _row(key, label, APPROVED, f"Approved, version {item.version}.", item, flags)
    return _row(key, label, WAITING, approve, item, flags)


def checklist(parts: Parts) -> list[dict[str, Any]]:
    brief = parts.brief
    if brief is None or not brief.summary:
        brief_row = _row("brief", "Brief", MISSING, "Fill in the brief and check its AI summary.")
    elif parts.brief_confirmed:
        brief_row = _row("brief", "Brief", APPROVED, "Summary confirmed.")
    else:
        brief_row = _row("brief", "Brief", WAITING, "The brief changed after its summary was confirmed. Check it again.")

    rows = [
        brief_row,
        _item_row("target", "Target audience", parts.audience, "Choose a primary audience.",
                  "Approve the primary audience.", parts.user_text),
        _item_row("concept", "Campaign direction", parts.direction, "Choose a campaign direction.",
                  "Approve the chosen direction.", parts.user_text),
    ]

    present = [parts.assets[a.key] for a in assets.ASSETS if a.key in parts.assets]
    approved = sum(1 for i in present if i.approved_at is not None)
    flags = sum(len(_flags(ItemKind.ASSET, i, parts.user_text)) for i in present)
    if not present:
        assets_row = _row("assets", "Creative assets", MISSING, "Generate the creative assets.")
    elif approved == len(assets.ASSETS):
        assets_row = _row("assets", "Creative assets", APPROVED, "All 7 assets approved.", flags=flags)
    else:
        assets_row = _row("assets", "Creative assets", WAITING, f"{approved} of {len(assets.ASSETS)} assets approved.",
                          flags=flags)
    assets_row["item_ids"] = [str(i.id) for i in present]
    rows.append(assets_row)

    rows.append(_item_row("budget", "Budget", parts.budget, "Make the budget plan.", "Approve the budget plan.",
                          parts.user_text))
    measure = parts.measurement
    if measure is None:
        rows.append(_row("measurement", "Measurement plan", MISSING, "Start the measurement plan."))
    elif measure.approved_at is not None:
        rows.append(_row("measurement", "Measurement plan", APPROVED, f"Approved, version {measure.version}.", measure))
    else:
        rows.append(_row("measurement", "Measurement plan", WAITING, "Approve the measurement plan.", measure))
    return rows


def is_final(rows: list[dict[str, Any]]) -> bool:
    return all(r["status"] == APPROVED for r in rows)


def sync_status(db: Session, project: Project) -> None:
    """Keep the dashboard's "ready to export" honest: ready only while every part is approved."""
    if project.is_demo:
        return
    final = is_final(checklist(Parts(db, project)))
    if final:
        project.status = ProjectStatus.READY
    elif project.status == ProjectStatus.READY:
        project.status = ProjectStatus.IN_PROGRESS


# --- The package --------------------------------------------------------------------------
#
# A package is a list of sections. Each section is a heading plus blocks, and each block is
# one of: ("p", text), ("field", label, text), ("list", label, [texts]), ("sub", heading),
# ("table", [headers], [[cells]]). The PDF and the Word file draw the same blocks.


def _date(value: date | str | None) -> str:
    if not value:
        return ""
    d = date.fromisoformat(value) if isinstance(value, str) else value
    return d.strftime("%b %d, %Y").replace(" 0", " ")


def _version(item: CampaignItem) -> str:
    state = "approved" if item.approved_at is not None else "not approved"
    return f"Version {item.version}, {state}"


def _based_on(data: dict[str, Any]) -> list[str]:
    return [f"{BRIEF_LABELS.get(b['source'], b['source'])}: {b['detail']}" for b in data.get("based_on", [])]


def _fields(data: dict[str, Any], labels: list[tuple[str, str]]) -> list[tuple]:
    return [("field", label, str(data[key])) for key, label in labels if data.get(key)]


def _lists(data: dict[str, Any], labels: list[tuple[str, str]]) -> list[tuple]:
    return [("list", label, list(data[key])) for key, label in labels if data.get(key)]


def _brief_section(parts: Parts) -> dict[str, Any]:
    blocks: list[tuple] = []
    if parts.brief is not None:
        facts = brief_summary.brief_facts(parts.brief)
        for key, label in BRIEF_LABELS.items():
            value = facts.get(key)
            if not value:
                continue
            if isinstance(value, list):
                value = ", ".join(value)
            elif key in ("start_date", "end_date"):
                value = _date(value)
            blocks.append(("field", label, str(value)))
        summary = (parts.brief.summary or {}).get("data") if parts.brief_confirmed else None
        if summary:
            blocks.append(("sub", "Confirmed summary"))
            blocks += _fields(summary, [("overview", "Overview"), ("offer", "Offer"), ("conversion_goal", "Conversion goal")])
            blocks += _lists(summary, [("assumptions", "Assumptions"), ("missing_info", "Still to confirm")])
    if not blocks:
        blocks.append(("p", "The brief is empty."))
    return {"heading": "Campaign brief", "blocks": blocks}


def _audience_section(parts: Parts) -> dict[str, Any]:
    item = parts.audience
    if item is None:
        return {"heading": "Target audience", "blocks": [("p", "No primary audience chosen yet.")]}
    data = item.data
    blocks: list[tuple] = [("p", _version(item))]
    blocks += _fields(data, [
        ("name", "Audience"), ("definition", "Who they are"), ("need", "Need"), ("motivation", "Motivation"),
        ("objection", "Likely objection"), ("message_angle", "Message angle"),
    ])
    if data.get("channels"):
        blocks.append(("field", "Channels", ", ".join(data["channels"])))
    if parts.project.audience_exclusions:
        blocks.append(("list", "Do not target", list(parts.project.audience_exclusions)))
    blocks += [("list", "Based on", _based_on(data))] if data.get("based_on") else []
    blocks += _lists(data, [("assumptions", "Assumptions")])
    return {"heading": "Target audience", "blocks": blocks}


def _direction_section(parts: Parts) -> dict[str, Any]:
    item = parts.direction
    if item is None:
        return {"heading": "Campaign direction", "blocks": [("p", "No campaign direction chosen yet.")]}
    data = item.data
    blocks: list[tuple] = [("p", _version(item))]
    blocks += _fields(data, [
        ("name", "Direction"), ("promise", "Central promise"), ("headline", "Sample headline"),
        ("key_message", "Key message"), ("concept", "Creative concept"),
    ])
    if data.get("channels"):
        blocks.append(("field", "Channels", ", ".join(data["channels"])))
    blocks += _fields(data, [("channel_fit", "Why these channels"), ("rationale", "Why it could work")])
    blocks += _lists(data, [("risks", "Risks")])
    blocks += [("list", "Based on", _based_on(data))] if data.get("based_on") else []
    blocks += _lists(data, [("assumptions", "Assumptions")])
    return {"heading": "Campaign direction", "blocks": blocks}


def _assets_section(parts: Parts) -> dict[str, Any]:
    blocks: list[tuple] = []
    for spec in assets.ASSETS:
        item = parts.assets.get(spec.key)
        if item is None:
            continue
        blocks.append(("sub", spec.label))
        blocks.append(("p", _version(item)))
        blocks += _fields(item.data, [(f.key, f.label) for f in spec.fields])
    if not blocks:
        blocks.append(("p", "No creative assets yet."))
    return {"heading": "Creative assets", "blocks": blocks}


def _budget_section(parts: Parts) -> dict[str, Any]:
    item = parts.budget
    if item is None:
        return {"heading": "Budget", "blocks": [("p", "No budget plan yet.")]}
    data = item.data
    total = data["total_cents"]
    percents = budget_math.percents(data["lines"], total)
    blocks: list[tuple] = [
        ("p", _version(item)),
        ("field", "Media budget", budget_math.money(total)),
        ("table", ["Channel", "Role", "Amount", "Share"], [
            [line["channel"], line.get("role", ""), budget_math.money(line["amount_cents"]),
             f"{percents.get(line['id'], 0):g}%"]
            for line in data["lines"]
        ]),
    ]
    production = data.get("production") or []
    if production:
        rows = [[p.get("item") or "Item", budget_math.money(p["amount_cents"]) if p.get("amount_cents") is not None
                 else "Not entered"] for p in production]
        known = sum(p["amount_cents"] for p in production if p.get("amount_cents") is not None)
        blocks.append(("sub", "Production costs (kept apart from the media budget)"))
        blocks.append(("table", ["Item", "Cost"], rows))
        if any(p.get("amount_cents") is not None for p in production):
            blocks.append(("field", "Production total entered", budget_math.money(known)))
    blocks += _fields(data, [("reasoning", "Why this mix")])
    blocks += [("list", "Based on", _based_on(data))] if data.get("based_on") else []
    blocks += _lists(data, [("assumptions", "Assumptions")])
    blocks.append(("p", "This is a plan for how to split the budget, not a forecast of results."))
    return {"heading": "Budget", "blocks": blocks}


def _measurement_section(db: Session, parts: Parts) -> dict[str, Any]:
    item = parts.measurement
    if item is None:
        return {"heading": "Measurement plan", "blocks": [("p", "No measurement plan yet.")]}
    data = item.data
    start, end = measurement.brief_dates(db, parts.project)
    blocks: list[tuple] = [("p", _version(item))]
    blocks += _fields(data, [("goal", "Goal"), ("landing_url", "Landing page")])
    if data.get("checklist"):
        blocks.append(("list", "Tracking checklist",
                       [f"{'Done' if c['done'] else 'To do'}: {c['text']}" for c in data["checklist"]]))
    cadence = data.get("review_cadence", "weekly")
    blocks.append(("field", "Review schedule", CADENCE_LABELS.get(cadence, cadence)))
    dates = measurement.review_dates(cadence, start, end)
    if dates:
        blocks.append(("field", "Review dates", ", ".join(_date(d) for d in dates)))

    if parts.entries:
        blocks.append(("sub", "Results entered"))
        blocks.append(("table", ["Period", "Spend", "Leads", "Sales", "Revenue"], [
            [e.period, _money_or_dash(e.spend_cents), _count_or_dash(e.leads), _count_or_dash(e.sales),
             _money_or_dash(e.revenue_cents)]
            for e in parts.entries
        ]))
        for r in measurement.results(parts.entries, measurement.media_budget(db, parts.project)):
            blocks.append(("field", r["label"], _result_text(r)))
    else:
        blocks.append(("p", "No results entered yet."))
    return {"heading": "Measurement plan", "blocks": blocks}


def _money_or_dash(cents: int | None) -> str:
    return budget_math.money(cents) if cents is not None else "-"


def _count_or_dash(n: int | None) -> str:
    return f"{n:,}" if n is not None else "-"


def _result_text(r: dict[str, Any]) -> str:
    if r["value"] is None:
        return f"Not available yet. {r['missing']}"
    if r["unit"] == "money":
        return budget_math.money(round(r["value"]))
    if r["unit"] == "percent":
        return f"{r['value']:.1f}%"
    return f"{r['value']:.2f}"


def _flags_section(parts: Parts) -> dict[str, Any] | None:
    found: list[str] = []
    sources = [("Audience", parts.audience), ("Direction", parts.direction), ("Budget", parts.budget)]
    sources += [(spec.label, parts.assets.get(spec.key)) for spec in assets.ASSETS]
    for label, item in sources:
        if item is None:
            continue
        for flag in _flags(item.kind, item, parts.user_text):
            found.append(f"{label}: \"{flag['claim']}\" ({flag['reason']})")
    if parts.brief_confirmed:
        for flag in (parts.brief.summary or {}).get("data", {}).get("review_flags", []):
            found.append(f"Brief: \"{flag['claim']}\" ({flag['reason']})")
    if not found:
        return None
    return {"heading": "Claims to check before use", "blocks": [
        ("p", "These statements may need proof or a specialist's review before anything is published."),
        ("list", "", found),
    ]}


def package(db: Session, project: Project, now: datetime | None = None) -> dict[str, Any]:
    parts = Parts(db, project)
    rows = checklist(parts)
    final = is_final(rows)
    now = now or datetime.now(UTC)
    sections = [
        _brief_section(parts),
        _audience_section(parts),
        _direction_section(parts),
        _assets_section(parts),
        _budget_section(parts),
        _measurement_section(db, parts),
    ]
    flags = _flags_section(parts)
    if flags:
        sections.append(flags)
    return {
        "title": project.name,
        "version_label": version_label(project),
        "generated_at": now,
        "final": final,
        "status_note": FINAL_NOTE if final else DRAFT_NOTE,
        "not_published": NOT_PUBLISHED,
        "ai_note": AI_NOTE,
        "checklist": rows,
        "sections": sections,
    }


def version_label(project: Project) -> str:
    return f"Version {project.version}"
