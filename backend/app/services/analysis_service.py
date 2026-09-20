"""Analysis orchestration: upload → validate → store → analyze (provider) → persist.

Routes stay thin; this is where the workflow lives. The AI provider is
resolved through app/services/ai/provider.py — never called inline with
provider SDKs (spec §21).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFoundError
from app.models.progress import PhotoAnalysis, ProgressPhoto
from app.models.video import ExerciseVideo, VideoAnalysis
from app.repositories.progress_repo import PhotoAnalysisRepository, PhotoRepository
from app.repositories.ai_repo import VideoAnalysisRepository, VideoRepository
from app.services.ai.base import PhotoAnalysisInput, UserContext, VideoAnalysisInput
from app.services.ai.provider import get_provider
from app.services.storage import get_storage
from app.services.upload_service import UploadService


class AnalysisService:
    def __init__(self, db: Session):
        self.db = db
        self.uploads = UploadService()
        self.photos = PhotoRepository(db)
        self.photo_analyses = PhotoAnalysisRepository(db)
        self.storage = get_storage()
        self.videos = VideoRepository(db)
        self.video_analyses = VideoAnalysisRepository(db)

    # ---------------- helpers ----------------

    def _read(self, file: UploadFile) -> bytes:
        payload = file.file.read()
        file.file.close()
        return payload

    def _previous_photo_context(self, user_id: int) -> tuple[int, list[str]]:
        prior = self.photos.all_ordered(user_id)
        return len(prior), [p.captured_at.strftime("%d %b %Y") for p in prior]

    def _user_context(self, user, memories: list[str]) -> UserContext:
        return UserContext(name=user.name, memories=memories)

    # ---------------- photos ----------------
    def upload_photo(self, *, user, file: UploadFile, photo_type: str,
                     captured_at: datetime | None, bodyweight: float | None,
                     notes: str | None, analyze: bool = True,
                     memories: list[str] | None = None) -> tuple[ProgressPhoto, PhotoAnalysis | None]:
        payload = self._read(file)
        validated = self.uploads.validate(filename=file.filename, content_type=file.content_type,
                                          payload=payload, kind="photo")
        storage = get_storage()
        key = self.uploads.storage_key("photo", validated.extension)
        storage.save(validated.content, key)

        photo = self.photos.create(
            user_id=user.id, file_path=key, original_filename=file.filename,
            mime_type=validated.mime_type, size_bytes=validated.size_bytes,
            photo_type=photo_type, captured_at=(captured_at or datetime.now(timezone.utc)),
            bodyweight=bodyweight, notes=notes,
        )
        analysis = None
        if analyze:
            count, dates = self._previous_photo_context(user.id)
            count = max(0, count - 1)  # exclude the just-inserted photo
            provider = get_provider()
            result = provider.analyze_photo(PhotoAnalysisInput(
                photo_id=photo.id, photo_type=photo_type,
                captured_at=photo.captured_at.strftime("%d %b %Y"),
                bodyweight_kg=bodyweight, notes=notes,
                previous_photos_count=count, previous_session_dates=dates,
                user=self._user_context(user, memories or []),
            ))
            analysis = self.photo_analyses.create(
                photo_id=photo.id, model_name=result.model_name, model_version=result.model_version,
                analysis_json=result.model_dump(), confidence=result.confidence,
            )
        return photo, analysis

    # ---------------- videos ----------------
    def upload_video(self, *, user, file: UploadFile, exercise: str | None,
                     duration_s: float | None, notes: str | None, analyze: bool = True,
                     memories: list[str] | None = None) -> tuple[ExerciseVideo, VideoAnalysis | None]:
        payload = self._read(file)
        validated = self.uploads.validate(filename=file.filename, content_type=file.content_type,
                                          payload=payload, kind="video")
        storage = get_storage()
        key = self.uploads.storage_key("video", validated.extension)
        storage.save(validated.content, key)

        video = self.videos.create(
            user_id=user.id, file_path=key, original_filename=file.filename,
            mime_type=validated.mime_type, size_bytes=validated.size_bytes,
            exercise=exercise, uploaded_at=datetime.now(timezone.utc), duration=duration_s,
        )
        analysis = None
        if analyze:
            provider = get_provider()
            result = provider.analyze_video(VideoAnalysisInput(
                video_id=video.id, exercise=exercise, duration_s=duration_s, notes=notes,
                user=self._user_context(user, memories or []),
            ))
            analysis = self.video_analyses.create(
                video_id=video.id, model_name=result.model_name, model_version=result.model_version,
                analysis_json=result.model_dump(), confidence=result.confidence,
            )
        return video, analysis

    # ---------------- unified read ----------------
    def get_analysis(self, *, analysis_id: int, user_id: int, kind: str | None = None) -> dict:
        if kind not in (None, "photo", "video"):
            raise NotFoundError("invalid_kind", "kind must be 'photo' or 'video'.")

        pa = None if kind == "video" else self.photo_analyses.get_for_user(analysis_id, user_id)
        if pa:
            return {
                "id": pa.id, "kind": "photo",
                "media": {"photo_id": pa.photo_id, "photo_type": pa.photo.photo_type,
                          "file_key": pa.photo.file_path,
                          "captured_at": pa.photo.captured_at.isoformat(),
                          "bodyweight": pa.photo.bodyweight},
                "model_name": pa.model_name, "model_version": pa.model_version,
                "analysis": pa.analysis_json, "confidence": pa.confidence,
                "created_at": pa.created_at.isoformat() if pa.created_at else None,
            }
        va = None if kind == "photo" else self.video_analyses.get_for_user(analysis_id, user_id)
        if va:
            return {
                "id": va.id, "kind": "video",
                "media": {"video_id": va.video_id, "exercise": va.video.exercise,
                          "file_key": va.video.file_path,
                          "duration_s": va.video.duration},
                "model_name": va.model_name, "model_version": va.model_version,
                "analysis": va.analysis_json, "confidence": va.confidence,
                "created_at": va.created_at.isoformat() if va.created_at else None,
            }
        raise NotFoundError("analysis_not_found", f"No analysis #{analysis_id} for this user.")
