"""Nutrition schemas."""
from __future__ import annotations

import datetime

from pydantic import BaseModel, Field, ConfigDict


class FoodItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    serving_size: float = Field(default=100, gt=0, le=5000, description="Grams (or ml for liquids).")
    calories: float = Field(ge=0, le=5000, description="Kcal per serving.")
    protein: float = Field(default=0, ge=0, le=500)
    carbohydrates: float = Field(default=0, ge=0, le=500)
    fat: float = Field(default=0, ge=0, le=500)
    fiber: float = Field(default=0, ge=0, le=500)


class FoodItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    serving_size: float
    calories: float
    protein: float
    carbohydrates: float
    fat: float
    fiber: float


class MealCreate(BaseModel):
    date: datetime.date | None = None
    meal_type: str = Field(pattern="^(breakfast|lunch|dinner|snack|pre_workout|post_workout)$")
    notes: str | None = Field(default=None, max_length=255)


class FoodLogCreate(BaseModel):
    food_item_id: int
    quantity: float = Field(gt=0, le=5000, description="Weight in grams (or ml for liquids). Example: 150 means 150g of the food item.")


class FoodLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    food_item: FoodItemOut
    quantity: float
    totals: dict


class MealOut(BaseModel):
    id: int
    date: datetime.date
    meal_type: str
    notes: str | None
    logs: list[FoodLogOut]
    totals: dict


class NutritionOverview(BaseModel):
    """Aggregated payload for GET /api/nutrition."""
    today: dict
    meals: list[MealOut]
    weekly: dict
