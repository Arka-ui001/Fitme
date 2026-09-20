"""Analysis (photo/video) schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AnalysisOut(BaseModel):
    """Unified analysis record (photo or video)."""
    id: int
    kind: str                       # photo | video
    media: dict                     # metadata of the underlying photo/video
    model_name: str
    model_version: str
    analysis: dict                  # structured analysis_json
    confidence: float | None
    created_at: datetime | None


class AnalysisListOut(BaseModel):
    items: list[AnalysisOut]
    count: int


class UploadResult(BaseModel):
    media_id: int
    analysis_id: int | None = None
    kind: str
    file_key: str
    analysis: dict | None = None
    confidence: float | None = None


ALLOWED_PHOTO_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_PHOTO_MIMES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov"}
ALLOWED_VIDEO_MIMES = {"video/mp4", "video/quicktime", "application/octet-stream"}
