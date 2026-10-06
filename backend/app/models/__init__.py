"""All ORM models. Import every model here so Alembic autogenerate can see it."""

from app.models.ai_job import AiJob, JobKind, JobStatus
from app.models.brief import Brief
from app.models.event import Event
from app.models.item import CampaignItem, ItemKind, ItemOrigin, Revision, RevisionSource
from app.models.project import Project, ProjectStage, ProjectStatus
from app.models.upload import Upload
from app.models.user import User

__all__ = [
    "AiJob",
    "Brief",
    "CampaignItem",
    "Event",
    "ItemKind",
    "ItemOrigin",
    "JobKind",
    "JobStatus",
    "Project",
    "ProjectStage",
    "ProjectStatus",
    "Revision",
    "RevisionSource",
    "Upload",
    "User",
]
