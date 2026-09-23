"""Nutrition repositories."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.nutrition import DailyNutrition, FoodItem, FoodLog, Meal
from app.repositories.base import BaseRepository


class FoodItemRepository(BaseRepository[FoodItem]):
    model = FoodItem

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_or_create(self, **fields) -> tuple[FoodItem, bool]:
        existing = self.db.scalar(select(FoodItem).where(FoodItem.name == fields["name"].strip()))
        if existing:
            return existing, False
        fields["name"] = fields["name"].strip()
        return self.create(**fields), True

    def search(self, query: str, limit: int = 20) -> list[FoodItem]:
        # Return only exact (case-insensitive) matches, no fuzzy fallback
        stmt = select(FoodItem).where(FoodItem.name.ilike(query.strip()))
        results = list(self.db.scalars(stmt).limit(limit).all())
        return results


class MealRepository(BaseRepository[Meal]):
    model = Meal

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_user(self, meal_id: int, user_id: int) -> Meal | None:
        return self.db.scalar(select(Meal).where(Meal.id == meal_id, Meal.user_id == user_id))

    def for_day(self, user_id: int, day: date) -> list[Meal]:
        stmt = select(Meal).where(Meal.user_id == user_id, Meal.date == day).order_by(Meal.id.asc())
        return list(self.db.scalars(stmt).all())

    def find_or_create(self, user_id: int, day: date, meal_type: str) -> Meal:
        meal = self.db.scalar(select(Meal).where(
            Meal.user_id == user_id, Meal.date == day, Meal.meal_type == meal_type))
        if meal is None:
            meal = self.create(user_id=user_id, date=day, meal_type=meal_type)
        return meal


class DailyNutritionRepository(BaseRepository[DailyNutrition]):
    model = DailyNutrition

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get(self, user_id: int, day: date) -> DailyNutrition | None:
        return self.db.scalar(select(DailyNutrition).where(
            DailyNutrition.user_id == user_id, DailyNutrition.date == day))

    def upsert(self, user_id: int, day: date, **totals) -> DailyNutrition:
        row = self.get(user_id, day)
        if row is None:
            row = DailyNutrition(user_id=user_id, date=day)
            self.db.add(row)
        for key in ("calories", "protein", "carbohydrates", "fat", "fiber"):
            setattr(row, key, round(float(totals.get(key, 0.0)), 1))
        self.db.flush()
        return row

    def range(self, user_id: int, start: date, end: date) -> list[DailyNutrition]:
        stmt = select(DailyNutrition).where(
            DailyNutrition.user_id == user_id, DailyNutrition.date >= start, DailyNutrition.date <= end
        ).order_by(DailyNutrition.date.asc())
        return list(self.db.scalars(stmt).all())
