"""Fitness goals."""
from __future__ import annotations

from datetime import date

from sqlalchemy import Boolean, Date, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

GOAL_TYPES = ("muscle_gain", "fat_loss", "maintenance", "recomposition")


class FitnessGoal(TimestampMixin, Base):
    __tablename__ = "fitness_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    goal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_weight: Mapped[float | None] = mapped_column(Float)          # kg
    target_calories: Mapped[float | None] = mapped_column(Float)        # kcal/day
    target_protein: Mapped[float | None] = mapped_column(Float)         # g/day
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
