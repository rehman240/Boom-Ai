"""The AI usage report: what this account's generations cost, from the ai_usage log.

Each user sees only their own rows. Days and months are in UTC.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import AiUsage, Project, User
from app.schemas.usage import UsageReport, UsageRow

router = APIRouter(prefix="/account/usage", tags=["usage"])

DAYS_SHOWN = 30


def _totals(label: str, calls: int, input_tokens: int, output_tokens: int, micro: int) -> UsageRow:
    return UsageRow(
        label=label,
        calls=calls or 0,
        input_tokens=input_tokens or 0,
        output_tokens=output_tokens or 0,
        cost_usd=round((micro or 0) / 1_000_000, 4),
    )


@router.get("", response_model=UsageReport)
def usage_report(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UsageReport:
    sums = (
        func.count(AiUsage.id),
        func.sum(AiUsage.input_tokens),
        func.sum(AiUsage.output_tokens),
        func.sum(AiUsage.cost_micro_usd),
    )
    mine = AiUsage.user_id == user.id

    def total(label: str, since: datetime | None = None) -> UsageRow:
        q = select(*sums).where(mine)
        if since is not None:
            q = q.where(AiUsage.created_at >= since)
        return _totals(label, *db.execute(q).one())

    def grouped(key, *, where=(), order=None) -> list[tuple]:
        order = order if order is not None else func.sum(AiUsage.cost_micro_usd).desc()
        q = select(key, *sums).where(mine, *where).group_by(key).order_by(order)
        return list(db.execute(q).all())

    now = datetime.now(UTC)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month = today.replace(day=1)

    day = cast(func.timezone("UTC", AiUsage.created_at), Date)
    by_day = grouped(day, where=(AiUsage.created_at >= today - timedelta(days=DAYS_SHOWN - 1),), order=day.desc())

    project_rows = grouped(AiUsage.project_id)
    names = dict(
        db.execute(
            select(Project.id, Project.name).where(Project.id.in_([r[0] for r in project_rows if r[0] is not None]))
        ).all()
    )

    first = db.scalar(select(func.min(AiUsage.created_at)).where(mine))
    s = get_settings()
    return UsageReport(
        recorded_since=first,
        price_input_per_mtok=s.ai_price_input_per_mtok,
        price_output_per_mtok=s.ai_price_output_per_mtok,
        today=total("Today", today),
        this_month=total("This month", month),
        all_time=total("All time"),
        by_day=[_totals(d.isoformat(), *rest) for d, *rest in by_day],
        by_step=[_totals(step, *rest) for step, *rest in grouped(AiUsage.step)],
        by_project=[_totals(names.get(pid, "Deleted campaign"), *rest) for pid, *rest in project_rows],
        by_model=[_totals(model, *rest) for model, *rest in grouped(AiUsage.model)],
    )
