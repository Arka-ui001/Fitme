"""Workout models: exercise catalog, sessions and individual sets."""
from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

MUSCLE_GROUPS = ("chest", "shoulders", "arms", "back", "legs", "core", "full_body")


class Exercise(TimestampMixin, Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    muscle_group: Mapped[str] = mapped_column(String(30), nullable=False)
    equipment: Mapped[str | None] = mapped_column(String(60))             # barbell | dumbbell | cable | machine | bodyweight


class WorkoutSession(TimestampMixin, Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(120))                 # e.g. "Push A"
    duration: Mapped[int | None] = mapped_column(Integer)                 # minutes
    notes: Mapped[str | None] = mapped_column(Text)

    sets: Mapped[list["WorkoutSet"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="WorkoutSet.id"
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    exercise: Mapped[str] = mapped_column(String(120), nullable=False)            # denormalized name (spec field)
    exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercises.id"))   # normalized link when known
    muscle_group: Mapped[str | None] = mapped_column(String(30))
    set_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)     # kg (0 for bodyweight)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rir: Mapped[float | None] = mapped_column(Float)                      # reps in reserve
    rpe: Mapped[float | None] = mapped_column(Float)                      # rate of perceived exertion
    rest_seconds: Mapped[int | None] = mapped_column(Integer)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")

    @property
    def volume(self) -> float:
        return float(self.weight) * int(self.reps or 0)

    @property
    def est_1rm(self) -> float:
        """Epley formula — deterministic estimate used for PR / trend tracking."""
        if self.reps <= 0 or self.weight <= 0:
            return 0.0
        if self.reps == 1:
            return float(self.weight)
        return round(float(self.weight) * (1 + self.reps / 30.0), 2)
