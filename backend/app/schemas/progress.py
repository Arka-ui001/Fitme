"""Progress schemas: weight, measurements, photos."""
from __future__ import annotations

import datetime

from pydantic import BaseModel, Field, ConfigDict


class WeightLogCreate(BaseModel):
    weight: float = Field(gt=20, lt=400, description="Kilograms.")
    date: datetime.date | None = None   # defaults to today  (module-qualified: a field named `date` would otherwise shadow the type during pydantic's annotation eval)
    notes: str | None = Field(default=None, max_length=500)


class WeightLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weight: float
    date: datetime.date
    notes: str | None
    created_at: datetime.datetime


class MeasurementCreate(BaseModel):
    """All fields optional — partial snapshots are allowed and append-only."""
    date: datetime.date | None = None
    waist: float | None = Field(default=None, gt=0, lt=250)
    chest: float | None = Field(default=None, gt=0, lt=250)
    left_arm: float | None = Field(default=None, gt=0, lt=120)
    right_arm: float | None = Field(default=None, gt=0, lt=120)
    left_thigh: float | None = Field(default=None, gt=0, lt=150)
    right_thigh: float | None = Field(default=None, gt=0, lt=150)
    shoulders: float | None = Field(default=None, gt=0, lt=250)
    neck: float | None = Field(default=None, gt=0, lt=100)
    notes: str | None = Field(default=None, max_length=500)


class MeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: datetime.date
    waist: float | None
    chest: float | None
    left_arm: float | None
    right_arm: float | None
    left_thigh: float | None
    right_thigh: float | None
    shoulders: float | None
    neck: float | None
    notes: str | None


class ProgressPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    photo_type: str
    captured_at: datetime.datetime
    bodyweight: float | None
    notes: str | None
    file_key: str  # storage key — fetch via GET /api/files/{key}; no raw filesystem paths


class ObservationOut(BaseModel):
    title: str
    text: str
    confidence: float | None = None
    date: datetime.datetime | None = None


class ProgressOverview(BaseModel):
    """Aggregated payload for GET /api/progress."""
    weight_points: list[dict]
    measurements: list[MeasurementOut]
    photos: dict
    observations: list[ObservationOut]
    summary: dict
