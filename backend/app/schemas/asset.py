from pydantic import BaseModel

from app.ai.assets import AssetSpec
from app.schemas.audience import ReviewFlagOut
from app.schemas.item import ItemOut
from app.schemas.job import JobOut


class FieldSpecOut(BaseModel):
    key: str
    label: str
    guidance: int  # characters that read well on the channel
    limit: int  # the most a save accepts
    multiline: bool
    hint: str


class AssetSpecOut(BaseModel):
    """How the screen should show one asset: its name, what it is for and its fields."""

    key: str
    label: str
    description: str
    fields: list[FieldSpecOut]

    @classmethod
    def from_spec(cls, spec: AssetSpec) -> "AssetSpecOut":
        return cls(
            key=spec.key,
            label=spec.label,
            description=spec.description,
            fields=[FieldSpecOut(**f.__dict__) for f in spec.fields],
        )


class AssetOut(ItemOut):
    review_flags: list[ReviewFlagOut]  # worked out from the asset as it is now
    outdated: bool  # the chosen direction (or what came before it) changed since it was written


class AssetStage(BaseModel):
    spec: list[AssetSpecOut]
    assets: list[AssetOut]
    job: JobOut | None  # the latest generation of all assets
    field_jobs: dict[str, JobOut]  # the latest rewrite of each field, keyed "<asset id>:<field>"
    blocked_reason: str | None  # why generating isn't possible yet
