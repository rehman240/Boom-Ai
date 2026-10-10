from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.schemas.audience import ReviewFlagOut
from app.schemas.item import ItemOut
from app.schemas.job import JobOut


class BudgetPlanOut(ItemOut):
    percents: dict[str, float]  # each media line's share of the total, by line id
    review_flags: list[ReviewFlagOut]  # worked out from the plan as it is now
    # The brief, audience or direction changed after the AI last suggested this mix.
    outdated: bool
    # The brief's budget is no longer the total this plan splits. "Fit to new budget" fixes it.
    total_changed: bool


class BudgetStage(BaseModel):
    plan: BudgetPlanOut | None
    job: JobOut | None  # the latest generation
    blocked_reason: str | None  # why generating isn't possible yet
    total_cents: int  # the budget in the brief now
    start_date: date | None
    end_date: date | None
    channels: list[str]  # the channels the AI can suggest, offered when adding one


class LineChange(BaseModel):
    """Only the fields sent change. A new amount rebalances the unlocked channels."""

    amount_cents: int | None = Field(default=None, ge=0, le=10**12)
    locked: bool | None = None
    channel: str | None = Field(default=None, min_length=1, max_length=40)
    role: str | None = Field(default=None, max_length=120)

    @field_validator("channel", "role")
    @classmethod
    def clean(cls, v: str | None) -> str | None:
        return " ".join(v.split()) if v is not None else None


class LineAdd(BaseModel):
    channel: str = Field(min_length=1, max_length=40)
    role: str = Field(default="", max_length=120)

    @field_validator("channel", "role")
    @classmethod
    def clean(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("channel")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("Name the channel.")
        return v
