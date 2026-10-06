from pydantic import BaseModel

from app.schemas.audience import ReviewFlagOut
from app.schemas.item import ItemOut
from app.schemas.job import JobOut


class DirectionOut(ItemOut):
    slot: str  # "1", "2" or "3", shown as Direction A, B and C
    review_flags: list[ReviewFlagOut]  # worked out from the direction as it is now
    # The brief, audience or exclusions changed after the AI last wrote this direction.
    outdated: bool


class DirectionStage(BaseModel):
    directions: list[DirectionOut]
    job: JobOut | None  # the latest generation of all three
    slot_jobs: dict[str, JobOut]  # the latest regeneration of each single direction
    blocked_reason: str | None  # why generating isn't possible yet
