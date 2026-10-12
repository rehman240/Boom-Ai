from pydantic import BaseModel


class ChecklistRow(BaseModel):
    key: str  # brief, target, concept, assets, budget or measurement
    label: str
    status: str  # approved, waiting or missing
    detail: str  # what is approved, or what to do next
    item_ids: list[str]  # the items to approve for this part, so the screen can approve them here
    flags: int  # claims in this part that need a human check


class ReviewStage(BaseModel):
    checklist: list[ChecklistRow]
    final: bool  # every part approved, so an export is final rather than a draft
    status_note: str
    not_published: str  # always shown: nothing in the app posts, sends or spends
    ai_note: str
    version_label: str
