import uuid
from datetime import datetime

from pydantic import BaseModel


class JobOut(BaseModel):
    """What the page needs to follow a generation. Prompts and raw output stay on the server."""

    id: uuid.UUID
    kind: str
    status: str
    error: str | None
    attempts: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}
