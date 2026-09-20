"""Workout schemas."""
from __future__ import annotations

import datetime

from pydantic import BaseModel, Field, ConfigDict


class WorkoutSetIn(BaseModel):
    exercise: str = Field(min_length=1, max_length=120)
    muscle_group: str | None = Field(default=None, max_length=30)
    set_number: int = Field(default=1, ge=1, le=50)
    weight: float = Field(default=0, ge=0, le=1000, description="Kg (0 for bodyweight sets).")
    reps: int = Field(ge=0, le=500)
    rir: float | None = Field(default=None, ge=0, le=20)
    rpe: float | None = Field(default=None, ge=1, le=10)
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)


class WorkoutSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise: str
    muscle_group: str | None
    set_number: int
    weight: float
    reps: int
    rir: float | None
    rpe: float | None
    rest_seconds: int | None
    volume: float
    est_1rm: float


class WorkoutSessionCreate(BaseModel):
    date: datetime.date | None = None
    name: str | None = Field(default=None, max_length=120)
    duration: int | None = Field(default=None, ge=0, le=600, description="Minutes.")
    notes: str | None = Field(default=None, max_length=2000)
    sets: list[WorkoutSetIn] = Field(default_factory=list, description="Optional — sets can also be added via /{id}/sets.")


class WorkoutSetAdd(BaseModel):
    """POST /api/workouts/{id}/sets — one or more sets."""
    sets: list[WorkoutSetIn] = Field(min_length=1, max_length=50)


class WorkoutSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: datetime.date
    name: str | None
    duration: int | None
    notes: str | None
    sets: list[WorkoutSetOut] = []
    volume_kg: float = 0.0


class WorkoutListOut(BaseModel):
    """Aggregated payload for GET /api/workouts."""
    today: dict | None = None
    week: list[dict]
    sessions: list[WorkoutSessionOut]
    prs: list[dict]
    stats: dict
