"""The AI usage log: what each model call cost, recorded by the job runner."""

from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.ai.provider import Usage
from app.config import get_settings
from app.models import AiJob, AiUsage, Project


def cost_micro_usd(input_tokens: int, output_tokens: int) -> int:
    """Cost in millionths of a dollar. Prices are per million tokens, so tokens x price."""
    s = get_settings()
    return round(input_tokens * s.ai_price_input_per_mtok + output_tokens * s.ai_price_output_per_mtok)


def record(db: Session, job: AiJob, provider: str, calls: Iterable[Usage]) -> None:
    calls = list(calls)
    if not calls:
        return
    project = db.get(Project, job.project_id)
    if project is None:  # deleted while the model was working; nobody to bill it to
        return
    for call in calls:
        db.add(
            AiUsage(
                user_id=project.owner_id,
                project_id=project.id,
                job_id=job.id,
                step=job.kind,
                provider=provider,
                model=call.model,
                input_tokens=call.input_tokens,
                output_tokens=call.output_tokens,
                cost_micro_usd=cost_micro_usd(call.input_tokens, call.output_tokens),
            )
        )
