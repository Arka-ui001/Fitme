"""AI analysis routes (photo/video upload + structured result retrieval)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.progress import PHOTO_TYPES
from app.models.user import User
from app.schemas.common import ok
from app.services.analysis_service import AnalysisService
from app.services.memory_service import MemoryService
from app.services.rate_limit import upload_limit

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/photo", status_code=201)
def analyze_photo(request: Request,
                  current_user: User = Depends(get_current_user),
                  db: Session = Depends(get_db),
                  file: UploadFile = File(...),
                  photo_type: str = Form("front"),
                  captured_at: str | None = Form(None),
                  bodyweight: float | None = Form(None),
                  notes: str | None = Form(None)):
    """Upload a progress photo → stored + analyzed (provider per settings)."""
    upload_limit(request)
    if photo_type not in PHOTO_TYPES:
        from app.core.errors import AppError
        raise AppError("validation_error", f"photo_type must be one of {', '.join(PHOTO_TYPES)}.")

    captured = None
    if captured_at:
        from datetime import datetime, time, timezone

        from app.utils.datetime import parse_date
        parsed = parse_date(captured_at)
        captured = datetime.combine(parsed, time(12, 0), tzinfo=timezone.utc)

    memories, _ = MemoryService(db).to_context(current_user.id, limit=4)
    service = AnalysisService(db)
    photo, analysis = service.upload_photo(
        user=current_user, file=file, photo_type=photo_type, captured_at=captured,
        bodyweight=bodyweight, notes=notes, analyze=True, memories=memories)
    db.commit()
    return ok({
        "photo_id": photo.id, "file_key": photo.file_path,
        "analysis_id": analysis.id if analysis else None,
        "analysis": analysis.analysis_json if analysis else None,
        "confidence": analysis.confidence if analysis else None,
    })


@router.post("/video", status_code=201)
def analyze_video(request: Request,
                  current_user: User = Depends(get_current_user),
                  db: Session = Depends(get_db),
                  file: UploadFile = File(...),
                  exercise: str | None = Form(None),
                  duration: float | None = Form(None, description="Seconds, client-side metadata."),
                  notes: str | None = Form(None)):
    """Upload an exercise video → stored + analyzed (provider per settings)."""
    upload_limit(request)
    memories, _ = MemoryService(db).to_context(current_user.id, limit=4)
    service = AnalysisService(db)
    video, analysis = service.upload_video(
        user=current_user, file=file, exercise=exercise, duration_s=duration,
        notes=notes, analyze=True, memories=memories)
    db.commit()
    return ok({
        "video_id": video.id, "file_key": video.file_path,
        "analysis_id": analysis.id if analysis else None,
        "analysis": analysis.analysis_json if analysis else None,
        "confidence": analysis.confidence if analysis else None,
    })


@router.get("/{analysis_id}")
def get_analysis(analysis_id: int,
                 current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db),
                 kind: str | None = None):
    """Unified lookup. Photo and video analyses live in separate tables, so
    pass `kind=photo` or `kind=video` to disambiguate; without `kind`, photos
    are checked first."""
    return ok(AnalysisService(db).get_analysis(analysis_id=analysis_id, user_id=current_user.id,
                                               kind=kind))
