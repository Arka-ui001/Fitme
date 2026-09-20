"""Body progress models: weight logs, measurements (append-only history),
progress photos and their structured AI analyses."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

# photo_type ∈ PHOTO_TYPES
PHOTO_TYPES = ("front", "side", "back")


class WeightLog(TimestampMixin, Base):
    __tablename__ = "weight_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False)          # kg
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class BodyMeasurement(TimestampMixin, Base):
    """Historical snapshot — rows are NEVER updated, only appended."""
    __tablename__ = "body_measurements"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    waist: Mapped[float | None] = mapped_column(Float)        # cm
    chest: Mapped[float | None] = mapped_column(Float)
    left_arm: Mapped[float | None] = mapped_column(Float)
    right_arm: Mapped[float | None] = mapped_column(Float)
    left_thigh: Mapped[float | None] = mapped_column(Float)
    right_thigh: Mapped[float | None] = mapped_column(Float)
    shoulders: Mapped[float | None] = mapped_column(Float)
    neck: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)


class ProgressPhoto(TimestampMixin, Base):
    __tablename__ = "progress_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)   # storage key, NOT a filesystem path
    original_filename: Mapped[str | None] = mapped_column(String(255))    # kept for reference only
    mime_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    photo_type: Mapped[str] = mapped_column(String(10), nullable=False)   # front | side | back
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    bodyweight: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)

    analyses: Mapped[list["PhotoAnalysis"]] = relationship(back_populates="photo", cascade="all, delete-orphan")


class PhotoAnalysis(TimestampMixin, Base):
    """Structured AI output — never just prose; see services/ai/base.py."""
    __tablename__ = "photo_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("progress_photos.id", ondelete="CASCADE"), index=True, nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    analysis_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)               # 0..1

    photo: Mapped[ProgressPhoto] = relationship(back_populates="analyses")
