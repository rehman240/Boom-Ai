from pydantic import BaseModel, Field, field_validator

from app.ai.audience import MAX_EXCLUSIONS
from app.schemas.item import ItemOut
from app.schemas.job import JobOut


class ReviewFlagOut(BaseModel):
    claim: str
    category: str  # health, finance, performance, sensitive or other
    reason: str


class AudienceCardOut(ItemOut):
    # Worked out from the card as it is now, so they follow the user's edits.
    review_flags: list[ReviewFlagOut]


class AudienceStage(BaseModel):
    cards: list[AudienceCardOut]
    exclusions: list[str]
    job: JobOut | None  # the latest generation, so the page can rejoin it after a refresh
    blocked_reason: str | None  # why generating isn't possible yet, e.g. the summary isn't confirmed


class Exclusions(BaseModel):
    exclusions: list[str] = Field(max_length=MAX_EXCLUSIONS)

    @field_validator("exclusions")
    @classmethod
    def clean(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for text in v:
            text = " ".join(text.split())
            if len(text) > 200:
                raise ValueError("Each exclusion can be up to 200 characters.")
            if text and text.lower() not in {o.lower() for o in out}:
                out.append(text)
        return out
