"""Progress routes: overview, weight, measurements, photos (upload + list)."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.db.session import get_db
from app.models.progress import PHOTO_TYPES
from app.models.user import User
from app.repositories.ai_repo import ReportRepository
from app.repositories.progress_repo import MeasurementRepository, PhotoRepository, WeightLogRepository
from app.schemas.common import ok
from app.schemas.progress import MeasurementCreate, WeightLogCreate
from app.services import fitness_service as F
from app.services.dashboard_service import DashboardService
from app.services.memory_service import MemoryService
from app.services.rate_limit import upload_limit
from app.services.storage import get_storage
from app.utils.datetime import today

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("")
def progress_overview(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    weights = WeightLogRepository(db)
    measurements = MeasurementRepository(db)
    photos = PhotoRepository(db)

    logs = weights.range(current_user.id)
    day = today()
    weight_points = [{"date": l.date.isoformat(), "weight_kg": round(float(l.weight), 1)} for l in logs]

    # group photos into monthly "sessions" (like the frontend timeline)
    sessions: dict[str, dict] = {}
    for p in photos.all_ordered(current_user.id):
        label = p.captured_at.strftime("%B %Y")
        slot = sessions.setdefault(label, {
            "label": label, "date": p.captured_at.strftime("%d %b %Y"),
            "month": p.captured_at.strftime("%Y-%m"),
            "weight": p.bodyweight, "photos": [],
        })
        slot["photos"].append({
            "id": p.id, "photo_type": p.photo_type, "file_key": p.file_path,
            "captured_at": p.captured_at.isoformat(),
        })

    observations = []
    for r in ReportRepository(db).recent(current_user.id, limit=6):
        c = r.content_json or {}
        if c.get("title"):
            observations.append({
                "title": c.get("title", "Insight"),
                "text": c.get("text", ""),
                "confidence": (float(c["confidence"]) if c.get("confidence") is not None else None),
                "date": r.created_at.isoformat() if r.created_at else None,
            })
        if len(observations) >= 3:
            break

    change = F.weight_change(logs)
    summary = {
        "current_kg": change["current_kg"],
        "change_kg": change["change_kg"],
        "rate_per_week_kg": F.weight_rate_per_week(logs),
        "measurements_count": len(measurements.history(current_user.id)),
        "photo_sessions": len(sessions),
    }
    return ok({
        "weight_points": weight_points,
        "measurements": measurements.history(current_user.id, limit=50),
        "photos": {"sessions": list(sessions.values()), "count": sum(len(s["photos"]) for s in sessions.values())},
        "observations": observations,
        "summary": summary,
    })


@router.post("/weight", status_code=201)
def log_weight(payload: WeightLogCreate,
               current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repo = WeightLogRepository(db)
    entry = repo.create(user_id=current_user.id, weight=payload.weight,
                        date=payload.date or today(), notes=payload.notes)
    db.commit()
    return ok({
        "id": entry.id, "weight": entry.weight, "date": entry.date.isoformat(),
        "notes": entry.notes,
        "trend": F.weight_rate_per_week(repo.range(current_user.id)),
    })


@router.post("/measurements", status_code=201)
def log_measurements(payload: MeasurementCreate,
                     current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Append-only: a new historical row is always created — previous
    measurements are never modified (spec §3)."""
    repo = MeasurementRepository(db)
    row = repo.create(user_id=current_user.id, date=payload.date or today(),
                      waist=payload.waist, chest=payload.chest,
                      left_arm=payload.left_arm, right_arm=payload.right_arm,
                      left_thigh=payload.left_thigh, right_thigh=payload.right_thigh,
                      shoulders=payload.shoulders, neck=payload.neck, notes=payload.notes)
    db.commit()
    return ok({"id": row.id, "date": row.date.isoformat(), "history_length":
               len(repo.history(current_user.id))})


@router.get("/photos")
def list_photos(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    photos = PhotoRepository(db).all_ordered(current_user.id)
    return ok({"count": len(photos), "items": [{
        "id": p.id, "photo_type": p.photo_type, "file_key": p.file_path,
        "captured_at": p.captured_at.isoformat(), "bodyweight": p.bodyweight,
        "notes": p.notes,
    } for p in photos]})


@router.post("/photos", status_code=201)
def upload_photo(current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
                 request: Request = None,  # noqa: ARG001 (rate limiting)
                 file: UploadFile = File(...),
                 photo_type: str = Form("front"),
                 captured_at: str | None = Form(None),
                 bodyweight: float | None = Form(None),
                 notes: str | None = Form(None)):
    upload_limit(request)
    if photo_type not in PHOTO_TYPES:
        raise AppError("validation_error", f"photo_type must be one of {', '.join(PHOTO_TYPES)}.")
    captured = None
    if captured_at:
        from app.utils.datetime import parse_date
        captured = parse_date(captured_at)
        captured = captured and __import__("datetime").datetime.combine(
            captured, __import__("datetime").time(12, 0), tzinfo=__import__("datetime").timezone.utc)
    photo, _ = AnalysisServiceForRoute(db).upload_photo(
        user=current_user, file=file, photo_type=photo_type, captured_at=captured,
        bodyweight=bodyweight, notes=notes, analyze=False)
    db.commit()
    return ok({"id": photo.id, "file_key": photo.file_path, "photo_type": photo.photo_type,
               "captured_at": photo.captured_at.isoformat()})


def AnalysisServiceForRoute(db: Session):
    """Local import to avoid a circular import at module load."""
    from app.services.analysis_service import AnalysisService
    return AnalysisService(db)
