"""Review and Export (client brief 4.9): the approval checklist and the PDF and Word files.

Approving uses the shared item routes in app/routers/items.py. Exports work at any time, but
only a campaign with every part approved is marked final; a draft says so on every page.
"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app import export_files, pipeline, review
from app.db import get_db
from app.deps import get_owned_project
from app.events import track
from app.models import Project, ProjectStage
from app.schemas.review import ReviewStage

router = APIRouter(prefix="/projects/{project_id}", tags=["review"])

FORMATS = {
    "pdf": (export_files.to_pdf, "application/pdf"),
    "docx": (export_files.to_docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}


@router.get("/review", response_model=ReviewStage)
def get_review(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    rows = review.checklist(review.Parts(db, project))
    final = review.is_final(rows)
    return ReviewStage(
        checklist=rows,
        final=final,
        status_note=review.FINAL_NOTE if final else review.DRAFT_NOTE,
        not_published=review.NOT_PUBLISHED,
        ai_note=review.AI_NOTE,
        version_label=review.version_label(project),
    )


def _export(fmt: str, project: Project, db: Session) -> Response:
    pkg = review.package(db, project)
    build, media_type = FORMATS[fmt]
    body = build(pkg)
    # Only that an export happened is counted, never what was in it.
    track(db, f"exported_{fmt}", user_id=project.owner_id, project_id=project.id)
    if not project.is_demo:
        pipeline.advance(project, ProjectStage.REVIEW)  # the dashboard now continues at Review
    db.commit()
    return Response(
        content=body,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{export_files.filename(pkg, fmt)}"',
            "Cache-Control": "no-store",  # private campaign text, never cached on the way
        },
    )


@router.get("/export.pdf")
def export_pdf(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    return _export("pdf", project, db)


@router.get("/export.docx")
def export_docx(project: Project = Depends(get_owned_project), db: Session = Depends(get_db)):
    return _export("docx", project, db)
