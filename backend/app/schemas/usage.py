from datetime import datetime

from pydantic import BaseModel


class UsageRow(BaseModel):
    label: str  # a day (YYYY-MM-DD), step, campaign name or model
    calls: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


class UsageReport(BaseModel):
    recorded_since: datetime | None  # the first logged call; None when nothing is logged yet
    price_input_per_mtok: float
    price_output_per_mtok: float
    today: UsageRow
    this_month: UsageRow
    all_time: UsageRow
    by_day: list[UsageRow]  # the last 30 days that had calls, newest first
    by_step: list[UsageRow]
    by_project: list[UsageRow]
    by_model: list[UsageRow]
