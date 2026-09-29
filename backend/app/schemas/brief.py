import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

# Everything the AI needs before it can produce anything useful. Checked here and shown
# in the form, so "required" means the same thing on both sides.
REQUIRED_FIELDS = (
    "business_name",
    "product_or_service",
    "description",
    "differentiators",
    "goal",
    "target_location",
    "budget_amount",
)

MAX_CHOICES = 8


def _blank_to_none(v: str | None) -> str | None:
    """An emptied field is stored as NULL, so "missing" has one meaning."""
    if v is None:
        return None
    text = v.strip()
    return text or None


class BriefUpdate(BaseModel):
    """Autosave sends only the fields that changed, so every field is optional here."""

    business_name: str | None = Field(default=None, max_length=200)
    product_or_service: str | None = Field(default=None, max_length=300)
    product_url: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    differentiators: str | None = Field(default=None, max_length=2000)
    goal: str | None = Field(default=None, max_length=100)
    offer_terms: str | None = Field(default=None, max_length=2000)
    target_location: str | None = Field(default=None, max_length=200)
    brand_voice: list[str] | None = None
    exclusions: str | None = Field(default=None, max_length=2000)
    channels: list[str] | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget_amount: Decimal | None = Field(default=None, ge=0, le=100_000_000, decimal_places=2)

    @field_validator(
        "business_name",
        "product_or_service",
        "description",
        "differentiators",
        "goal",
        "offer_terms",
        "target_location",
        "exclusions",
        mode="after",
    )
    @classmethod
    def clean_text(cls, v: str | None) -> str | None:
        return _blank_to_none(v)

    @field_validator("product_url", mode="after")
    @classmethod
    def clean_url(cls, v: str | None) -> str | None:
        url = _blank_to_none(v)
        if url is None:
            return None
        # Stored only, never fetched, but a typo is still worth catching early.
        if not url.startswith(("http://", "https://")):
            raise ValueError("Enter a full address starting with http:// or https://")
        return url

    @field_validator("brand_voice", "channels", mode="after")
    @classmethod
    def clean_choices(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        seen: list[str] = []
        for raw in v:
            choice = " ".join(str(raw).split())[:40]
            if choice and choice not in seen:
                seen.append(choice)
        if len(seen) > MAX_CHOICES:
            raise ValueError(f"Please choose at most {MAX_CHOICES}.")
        return seen

    @model_validator(mode="after")
    def dates_in_order(self) -> "BriefUpdate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("The end date cannot be before the start date.")
        return self


class BriefOut(BaseModel):
    project_id: uuid.UUID
    business_name: str | None
    product_or_service: str | None
    product_url: str | None
    description: str | None
    differentiators: str | None
    goal: str | None
    offer_terms: str | None
    target_location: str | None
    language: str
    brand_voice: list[str]
    exclusions: str | None
    channels: list[str]
    start_date: date | None
    end_date: date | None
    budget_amount: Decimal | None
    currency: str
    summary_confirmed_at: datetime | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class BriefState(BaseModel):
    brief: BriefOut
    # Which required fields are still empty. The form and the generate step read the same list.
    missing_required: list[str]
