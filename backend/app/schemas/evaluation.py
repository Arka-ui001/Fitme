"""Evaluation & goal schemas."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, ConfigDict


class FeedbackRequest(BaseModel):
    feedback: str = Field(pattern="^(correct|partially_correct|incorrect)$")
    comment: str | None = Field(default=None, max_length=2000)


class AIEvaluationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_id: int
    feedback: str
    comment: str | None
    created_at: datetime


class GoalCreate(BaseModel):
    goal_type: str = Field(pattern="^(muscle_gain|fat_loss|maintenance|recomposition)$")
    target_weight: float | None = Field(default=None, gt=20, lt=400)
    target_calories: float | None = Field(default=None, gt=0, le=10000)
    target_protein: float | None = Field(default=None, gt=0, le=500)
    start_date: date | None = None
    end_date: date | None = None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    goal_type: str
    target_weight: float | None
    target_calories: float | None
    target_protein: float | None
    start_date: date | None
    end_date: date | None
    is_active: bool
