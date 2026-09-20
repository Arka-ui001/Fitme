"""Auth & user schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128, description="Plain password — hashed with bcrypt, never stored or logged.")
    name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    age: int | None = None
    sex: str | None = None
    height_cm: float | None = None
    activity_level: str | None = None
    goal: str | None = None
    training_frequency: int | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    is_demo: bool = False
    created_at: datetime
    profile: UserProfileOut | None = None


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    age: int | None = None
    birth_year: int | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    goal: str | None = None
    target_weight: float | None = None
    training_frequency: int | None = None
    target_calories: float | None = None
    target_protein: float | None = None

