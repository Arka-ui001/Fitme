"""Nutrition calculation engine — 100% deterministic (spec: never use an LLM
for arithmetic). All totals derive from FoodLog × FoodItem; DailyNutrition
rows are a recomputed cache of these functions."""
from __future__ import annotations

import statistics
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.nutrition import DailyNutrition, FoodItem, FoodLog, Meal
from app.repositories.nutrition_repo import DailyNutritionRepository
from app.utils.datetime import today


def serving_totals(item: FoodItem, quantity: float) -> dict:
    """Totals for one FoodLog (quantity = weight in grams/ml). Deterministic."""
    # quantity is actual weight; calculate factor based on serving size
    q = float(quantity)
    # Calculate factor based on serving size: quantity is weight in grams/ml.
    # Number of servings = quantity / serving_size (grams per serving).
    factor = q / float(item.serving_size) if item.serving_size else 0
    return {
        "calories": round(float(item.calories) * factor, 1),
        "protein": round(float(item.protein) * factor, 1),
        "carbohydrates": round(float(item.carbohydrates) * factor, 1),
        "fat": round(float(item.fat) * factor, 1),
        "fiber": round(float(item.fiber) * factor, 1),
    }


def sum_totals(rows: list[dict]) -> dict:
    keys = ("calories", "protein", "carbohydrates", "fat", "fiber")
    return {k: round(sum(r.get(k, 0.0) for r in rows), 1) for k in keys}


def meal_totals(meal: Meal) -> dict:
    return sum_totals([serving_totals(log.food_item, log.quantity) for log in meal.logs])


def day_totals_from_logs(meals: list[Meal]) -> dict:
    return sum_totals([meal_totals(m) for m in meals])


# ------------------------------------------------------------------
# DailyNutrition cache maintenance
# ------------------------------------------------------------------
def recompute_daily_totals(db: Session, user_id: int, day: date) -> DailyNutrition:
    """Recompute and upsert the DailyNutrition row for (user, day).
    Called after every food-log write — totals are always derived, never trusted."""
    db.flush()  # make pending logs/meals visible to the queries below
    from sqlalchemy import select
    meals = list(db.scalars(select(Meal).where(Meal.user_id == user_id, Meal.date == day)).all())
    totals = day_totals_from_logs(meals)
    repo = DailyNutritionRepository(db)
    return repo.upsert(user_id, day, **totals)


# ------------------------------------------------------------------
# Aggregates
# ------------------------------------------------------------------
def weekly_averages(rows: list[DailyNutrition], days: int = 7) -> dict:
    """Mean of daily totals across logged days within the window."""
    cutoff = today() - timedelta(days=days - 1)
    recent = [r for r in rows if r.date >= cutoff]
    if not recent:
        return {"days_logged": 0, "calories": 0.0, "protein": 0.0, "carbohydrates": 0.0, "fat": 0.0, "fiber": 0.0}
    def mean(attr: str) -> float:
        return round(statistics.fmean(float(getattr(r, attr)) for r in recent), 0)
    return {
        "days_logged": len(recent),
        "calories": mean("calories"),
        "protein": mean("protein"),
        "carbohydrates": mean("carbohydrates"),
        "fat": mean("fat"),
        "fiber": mean("fiber"),
    }


def protein_remaining(today_protein: float, target_protein: float | None) -> float | None:
    if target_protein is None:
        return None
    return round(max(0.0, float(target_protein) - float(today_protein)), 1)
