"""Dashboard schema — the aggregated payload consumed by the existing frontend."""
from __future__ import annotations

from pydantic import BaseModel


class DashboardOut(BaseModel):
    """GET /api/dashboard — canonical structured payload.

    The frontend adapter (forgeai/assets/js/api.js) maps this into its own
    display shape; nothing here is hardcoded — everything is computed from DB.
    """
    user: dict
    generated_at: str
    weight: dict            # current_kg, change_30d_kg, rate_per_week_kg, spark
    nutrition: dict         # today, averages_7d, targets, protein_remaining_g
    training: dict          # sessions_this_week, target, consistency, volume, strength
    muscle_trends: list[dict]
    latest_insight: dict | None
    recent_workouts: list[dict]
