"""Progress repositories: weight logs, measurements, photos, analyses."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.progress import BodyMeasurement, PhotoAnalysis, ProgressPhoto, WeightLog
from app.repositories.base import BaseRepository


class WeightLogRepository(BaseRepository[WeightLog]):
    model = WeightLog

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def range(self, user_id: int, start: date | None = None, end: date | None = None) -> list[WeightLog]:
        stmt = select(WeightLog).where(WeightLog.user_id == user_id)
        if start:
            stmt = stmt.where(WeightLog.date >= start)
        if end:
            stmt = stmt.where(WeightLog.date <= end)
        return list(self.db.scalars(stmt.order_by(WeightLog.date.asc(), WeightLog.id.asc())).all())

    def latest_before(self, user_id: int, day: date) -> WeightLog | None:
        return self.db.scalar(
            select(WeightLog).where(WeightLog.user_id == user_id, WeightLog.date <= day)
            .order_by(WeightLog.date.desc(), WeightLog.id.desc())
        )


class MeasurementRepository(BaseRepository[BodyMeasurement]):
    model = BodyMeasurement

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def history(self, user_id: int, limit: int | None = None) -> list[BodyMeasurement]:
        stmt = select(BodyMeasurement).where(BodyMeasurement.user_id == user_id) \
            .order_by(BodyMeasurement.date.desc(), BodyMeasurement.id.desc())
        if limit:
            stmt = stmt.limit(limit)
        return list(self.db.scalars(stmt).all())


class PhotoRepository(BaseRepository[ProgressPhoto]):
    model = ProgressPhoto

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_user(self, photo_id: int, user_id: int) -> ProgressPhoto | None:
        return self.db.scalar(select(ProgressPhoto).where(
            ProgressPhoto.id == photo_id, ProgressPhoto.user_id == user_id))

    def all_ordered(self, user_id: int) -> list[ProgressPhoto]:
        return list(self.db.scalars(select(ProgressPhoto).where(
            ProgressPhoto.user_id == user_id).order_by(ProgressPhoto.captured_at.asc())).all())


class PhotoAnalysisRepository(BaseRepository[PhotoAnalysis]):
    model = PhotoAnalysis

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_user(self, analysis_id: int, user_id: int) -> PhotoAnalysis | None:
        return self.db.scalar(
            select(PhotoAnalysis)
            .options(joinedload(PhotoAnalysis.photo))
            .where(PhotoAnalysis.id == analysis_id, ProgressPhoto.user_id == user_id)
            .join(ProgressPhoto, PhotoAnalysis.photo_id == ProgressPhoto.id)
        )
