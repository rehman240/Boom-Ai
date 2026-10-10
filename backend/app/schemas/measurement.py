import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.item import ItemOut


class MeasurementPlanOut(ItemOut):
    review_dates: list[date]  # from the brief's dates and the plan's cadence


class EntryOut(BaseModel):
    id: uuid.UUID
    period: str
    spend_cents: int | None
    leads: int | None
    sales: int | None
    revenue_cents: int | None
    note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResultOut(BaseModel):
    key: str
    label: str
    unit: str  # money (cents), percent or ratio
    value: float | None  # None when it can't be worked out; `missing` says why
    definition: str
    missing: str | None
    note: str | None  # e.g. only some entries could be used


class Totals(BaseModel):
    spend_cents: int | None
    leads: int | None
    sales: int | None
    revenue_cents: int | None


class ConversionStage(BaseModel):
    plan: MeasurementPlanOut | None
    entries: list[EntryOut]
    totals: Totals
    results: list[ResultOut]
    blocked_reason: str | None
    media_budget_cents: int
    start_date: date | None
    end_date: date | None


_MAX = 10**12


class EntryIn(BaseModel):
    """One period's results. Any figure may be left out, but not all of them."""

    period: str = Field(min_length=1, max_length=60)
    spend_cents: int | None = Field(default=None, ge=0, le=_MAX)
    leads: int | None = Field(default=None, ge=0, le=10**9)
    sales: int | None = Field(default=None, ge=0, le=10**9)
    revenue_cents: int | None = Field(default=None, ge=0, le=_MAX)
    note: str | None = Field(default=None, max_length=300)

    @field_validator("period", "note")
    @classmethod
    def clean(cls, v: str | None) -> str | None:
        v = " ".join(v.split()) if v is not None else None
        return v or None

    @field_validator("period")
    @classmethod
    def named(cls, v: str | None) -> str:
        if not v:
            raise ValueError("Name the period, for example Week 1.")
        return v

    @model_validator(mode="after")
    def has_a_figure(self) -> "EntryIn":
        if all(getattr(self, f) is None for f in ("spend_cents", "leads", "sales", "revenue_cents")):
            raise ValueError("Enter at least one figure: spend, leads, sales or revenue.")
        return self


class StepDone(BaseModel):
    done: bool
