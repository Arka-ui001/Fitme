"""Evaluation routes — human feedback on AI reports (spec §12)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.user import User
from app.repositories.ai_repo import EvaluationRepository, ReportRepository
from app.schemas.common import ok
from app.schemas.evaluation import FeedbackRequest
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/evaluations", tags=["evaluation"])


@router.post("/{report_id}/feedback", status_code=201)
def submit_feedback(report_id: int, payload: FeedbackRequest,
                    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = ReportRepository(db).get(report_id)
    if report is None or report.user_id != current_user.id:
        raise NotFoundError("report_not_found", f"No AI report #{report_id} for this user.")

    repo = EvaluationRepository(db)
    evaluation = repo.get_for_report(current_user.id, report_id)
    if evaluation is None:
        evaluation = repo.create(user_id=current_user.id, report_id=report_id,
                                 feedback=payload.feedback, comment=payload.comment)
    else:
        evaluation.feedback = payload.feedback
        evaluation.comment = payload.comment

    # Outcomes are memories — the coach should know what was wrong before.
    MemoryService(db).record_evaluation_outcome(current_user.id, report_id, payload.feedback)
    db.commit()
    return ok({
        "id": evaluation.id, "report_id": report_id, "feedback": evaluation.feedback,
        "comment": evaluation.comment, "report_type": report.report_type,
    })


@router.get("")
def list_evaluations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Reports + your feedback — the internal improvement loop view."""
    reports = ReportRepository(db).recent(current_user.id, limit=25)
    eval_repo = EvaluationRepository(db)
    items = []
    for r in reports:
        ev = eval_repo.get_for_report(current_user.id, r.id)
        items.append({
            "report_id": r.id, "report_type": r.report_type,
            "content": r.content_json, "confidence": r.confidence,
            "model_name": r.model_name, "model_version": r.model_version,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "feedback": ev.feedback if ev else None,
            "comment": ev.comment if ev else None,
        })
    return ok({"items": items,
               "stats": {
                   "total": len(items),
                   "evaluated": sum(1 for i in items if i["feedback"]),
               }})
