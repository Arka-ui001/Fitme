"""Nutrition models: food catalog, meals, food logs and derived daily totals.

DailyNutrition rows are a *cache* computed deterministically by
services/nutrition_service.py from FoodLog rows — they are recomputed,
never hand-fed, and never calculated by an LLM.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout")


class FoodItem(Base):
    """Global catalog. Nutrients are PER SERVING (serving_size in grams/ml)."""
    __tablename__ = "food_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    serving_size: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    calories: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)   # kcal per serving
    protein: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)    # g
    carbohydrates: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fat: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fiber: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class Meal(TimestampMixin, Base):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    meal_type: Mapped[str] = mapped_column(String(20), nullable=False)    # breakfast | lunch | ...
    notes: Mapped[str | None] = mapped_column(String(255))

    logs: Mapped[list["FoodLog"]] = relationship(back_populates="meal", cascade="all, delete-orphan")


class FoodLog(TimestampMixin, Base):
    __tablename__ = "food_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_id: Mapped[int] = mapped_column(ForeignKey("meals.id", ondelete="CASCADE"), index=True, nullable=False)
    food_item_id: Mapped[int] = mapped_column(ForeignKey("food_items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)   # number of servings

    meal: Mapped[Meal] = relationship(back_populates="logs")
    food_item: Mapped[FoodItem] = relationship()


class DailyNutrition(Base):
    """Deterministic per-day totals (recomputed from FoodLog — see nutrition_service)."""
    __tablename__ = "daily_nutrition"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_daily_user_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    calories: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    protein: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    carbohydrates: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fat: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fiber: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
