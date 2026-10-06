import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ItemOut(BaseModel):
    id: uuid.UUID
    kind: str
    key: str
    position: int
    data: dict[str, Any]
    origin: str
    selected: bool
    approved_at: datetime | None
    version: int  # number of the latest saved revision
    unsaved_changes: bool  # edited since the latest revision
    updated_at: datetime


class ItemEdit(BaseModel):
    """Autosave: only the fields sent are changed."""

    data: dict[str, Any] = Field(min_length=1)


class SaveVersion(BaseModel):
    label: str | None = Field(default=None, max_length=120)

    @field_validator("label")
    @classmethod
    def clean(cls, v: str | None) -> str | None:
        v = " ".join(v.split()) if v else ""
        return v or None


class RevisionOut(BaseModel):
    number: int
    source: str
    label: str | None
    field: str | None
    restored_from: int | None
    project_version: int
    provider: str | None
    model: str | None
    prompt_version: str | None
    created_at: datetime
    data: dict[str, Any]

    model_config = {"from_attributes": True}
