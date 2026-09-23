"""Nutrition routes: overview, food catalog, meals + logging."""
from __future__ import annotations

from datetime import timedelta

import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.user import User
from app.repositories.nutrition_repo import (
    DailyNutritionRepository, FoodItemRepository, MealRepository,
)
from app.schemas.common import ok
from app.schemas.nutrition import FoodItemCreate, FoodLogCreate, MealCreate
from app.services import nutrition_service as N
from app.services.dashboard_service import DashboardService
from app.utils.datetime import today

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


class FoodLogItem(BaseModel):
    food_item_id: int
    quantity: float = Field(gt=0, le=100)


class MealWithLogsCreate(MealCreate):
    """POST /api/nutrition/meals — create (or merge into) a meal and optionally log foods."""
    logs: list[FoodLogItem] = Field(default_factory=list)

# Request model for AI nutrition lookup
class FoodLookupRequest(BaseModel):
    name: str = Field(..., description="Food name to lookup via AI")


@router.get("")
def nutrition_overview(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    day = today()
    meals_repo = MealRepository(db)
    daily_repo = DailyNutritionRepository(db)

    meals = meals_repo.for_day(current_user.id, day)
    meal_payloads = [{
        "id": m.id, "date": m.date.isoformat(), "meal_type": m.meal_type, "notes": m.notes,
        "logs": [{
            "id": log.id, "quantity": log.quantity,
            "food_item": {"id": log.food_item.id, "name": log.food_item.name,
                          "serving_size": log.food_item.serving_size},
            "totals": N.serving_totals(log.food_item, log.quantity),
        } for log in m.logs],
        "totals": N.meal_totals(m),
    } for m in meals]

    rows = daily_repo.range(current_user.id, day - timedelta(days=27), day)
    weekly_values = [{"date": r.date.isoformat(), "calories": r.calories, "protein": r.protein} for r in rows]
    targets = DashboardService(db).targets(current_user.id)
    today_totals = N.day_totals_from_logs(meals)

    return ok({
        "today": {
            "date": day.isoformat(),
            **today_totals,
            "targets": targets,
            "protein_remaining_g": N.protein_remaining(today_totals["protein"], targets.get("protein")),
        },
        "meals": meal_payloads,
        "weekly": {"values": weekly_values, "averages": N.weekly_averages(rows, days=7)},
    })


@router.post("/food", status_code=201)
def create_food(payload: FoodItemCreate,
                current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Add to the global food catalog. Deterministic nutrients per serving."""
    repo = FoodItemRepository(db)
    item, was_created = repo.get_or_create(**payload.model_dump())
    if not was_created:
        return ok({"id": item.id, "created": False, "name": item.name})
    db.commit()
    return ok({"id": item.id, "created": True, "name": item.name})


@router.post("/meals", status_code=201)
def create_meal(payload: MealWithLogsCreate,
                current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    day = payload.date or today()
    meal = MealRepository(db).find_or_create(current_user.id, day, payload.meal_type)
    if payload.notes:
        meal.notes = payload.notes
    food_repo = FoodItemRepository(db)
    for entry in payload.logs:
        item = food_repo.get(entry.food_item_id)
        if item is None:
            raise NotFoundError("food_not_found", f"No food item #{entry.food_item_id}.")
        meal.logs.append(_make_food_log(entry, item))
    totals = N.recompute_daily_totals(db, current_user.id, day)
    db.commit()
    return ok({
        "meal_id": meal.id, "date": meal.date.isoformat(), "meal_type": meal.meal_type,
        "items_logged": len(payload.logs),
        "daily_totals": {"calories": totals.calories, "protein": totals.protein,
                         "carbohydrates": totals.carbohydrates, "fat": totals.fat, "fiber": totals.fiber},
    })


def _make_food_log(entry: FoodLogItem, item):
    from app.models.nutrition import FoodLog
    return FoodLog(food_item_id=item.id, food_item=item, quantity=entry.quantity)
