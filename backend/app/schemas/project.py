import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.brief import AiEngine, CampaignType

NAME_MAX = 200


def _clean_name(v: str) -> str:
    name = " ".join(v.split())  # collapse stray whitespace and newlines
    if not name:
        raise ValueError("Please enter a campaign name.")
    return name


class ProjectCreate(BaseModel):
    name: str = Field(max_length=NAME_MAX)
    # Asked in the "new campaign" dialog and stored on the brief, where they can be changed.
    campaign_type: CampaignType | None = None
    ai_engine: AiEngine = "claude"

    @field_validator("name")
    @classmethod
    def clean(cls, v: str) -> str:
        return _clean_name(v)


class ProjectRename(BaseModel):
    name: str = Field(max_length=NAME_MAX)

    @field_validator("name")
    @classmethod
    def clean(cls, v: str) -> str:
        return _clean_name(v)


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    stage: str
    is_demo: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceStats(BaseModel):
    """Counts for the dashboard cards. All are real counts, never estimates."""

    active_campaigns: int
    assets_drafted: int
    ready_to_export: int


class DashboardOut(BaseModel):
    projects: list[ProjectOut]
    stats: WorkspaceStats
