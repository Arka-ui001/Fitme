"""Dashboard aggregation — everything GET /api/dashboard returns, computed
from the DB via the deterministic engines. Also generates the rule-based
"latest insight" (persisted as an AIReport so evaluation can grade it)."""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai import AIReport
from app.models.user import User
from app.repositories.ai_repo import ReportRepository
from app.repositories.nutrition_repo import DailyNutritionRepository, MealRepository
from app.repositories.progress_repo import WeightLogRepository
from app.repositories.user_repo import UserRepository
from app.repositories.workout_repo import ExerciseRepository, SessionRepository
from app.services import fitness_service as F
from app.services import nutrition_service as N
from app.utils.datetime import as_aware, humanize, iso_week_start, today, utcnow

INSIGHT_MAX_AGE_HOURS = 24
KEY_LIFTS = ("bench press", "squat", "deadlift", "overhead press", "incline db press")


class DashboardService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)
        self.weights = WeightLogRepository(db)
        self.sessions = SessionRepository(db)
        self.nutrition_rows = DailyNutritionRepository(db)
        self.meals = MealRepository(db)
        self.exercises = ExerciseRepository(db)
        self.reports = ReportRepository(db)

    # ------------------------------------------------------------------
    def active_goal(self, user_id: int):
        from sqlalchemy import select
        from app.models.goal import FitnessGoal
        return self.db.scalar(select(FitnessGoal).where(
            FitnessGoal.user_id == user_id, FitnessGoal.is_active == True  # noqa: E712
        ).order_by(FitnessGoal.start_date.desc()).limit(1))

    def targets(self, user_id: int) -> dict:
        goal = self.active_goal(user_id)
        return {
            "calories": float(goal.target_calories) if goal and goal.target_calories else 2500.0,
            "protein": float(goal.target_protein) if goal and goal.target_protein else 130.0,
            "carbohydrates": 340.0, "fat": 80.0, "fiber": 30.0,  # sensible defaults; goal can override later
            "sessions_per_week": int((self.users.get_profile(user_id).training_frequency if
                                      self.users.get_profile(user_id) else None) or 5),
        }

    # ------------------------------------------------------------------
    def weight_block(self, user_id: int) -> dict:
        logs = self.weights.range(user_id)
        change_30d = F.weight_change(logs, within_days=30)
        current = F.weight_change(logs)
        return {
            "current_kg": current["current_kg"],
            "change_30d_kg": change_30d["change_kg"],
            "rate_per_week_kg": F.weight_rate_per_week(logs),
            "direction": current["direction"],
            "spark": F.weight_sparkline(logs, n=14),
            "logs_count": len(logs),
        }

    def nutrition_block(self, user_id: int) -> dict:
        t = targets = self.targets(user_id)
        day = today()
        meals = self.meals.for_day(user_id, day)
        today_totals = N.day_totals_from_logs(meals)
        rows = self.nutrition_rows.range(user_id, day - timedelta(days=27), day)
        averages = N.weekly_averages(rows, days=7)
        return {
            "today": {"date": day.isoformat(), **today_totals},
            "averages_7d": averages,
            "targets": {k: targets[k] for k in ("calories", "protein", "carbohydrates", "fat", "fiber")},
            "protein_remaining_g": N.protein_remaining(today_totals["protein"], targets["protein"]),
            "calories_remaining_kcal": round(max(0.0, targets["calories"] - today_totals["calories"]), 0),
        }

    def training_block(self, user_id: int) -> dict:
        day = today()
        sessions = self.sessions.range(user_id, start=day - timedelta(days=180), end=day)
        sessions_by_id = {s.id: s for s in sessions}
        sets = self.sessions.sets_in_range(user_id, day - timedelta(days=70), day)
        sets_by_id = {s.id: s for s in sets}

        weekly_vol = F.weekly_volume(sets, sessions_by_id, weeks=8, ref=day)
        muscle_vol = F.muscle_group_volume(sets)

        # Strength trends for the key lifts that actually have data.
        strength = []
        names = {s.exercise.lower() for s in sets}
        for lift in KEY_LIFTS:
            if lift in names:
                strength.append({"exercise": lift, "points": F.strength_trend(sets, sessions_by_id, lift, weeks=8)})

        consistency = F.consistency_weeks(sessions, day, weeks=12)
        target = self.targets(user_id)["sessions_per_week"]
        return {
            "sessions_this_week": F.sessions_this_week(sessions, day),
            "target_per_week": target,
            "frequency_per_week": F.frequency_per_week(sessions, days=28),
            "consistency_weeks": consistency,
            "weekly_volume": weekly_vol,
            "muscle_volume": muscle_vol,
            "strength_trends": strength,
        }

    def muscle_trends_block(self, user_id: int) -> list[dict]:
        day = today()
        sets = self.sessions.sets_in_range(user_id, day - timedelta(days=56), day)
        sessions_by_id = {s.id: s for s in self.sessions.range(user_id, day - timedelta(days=56), day)}
        by_group_week: dict[str, dict[date, float]] = defaultdict(dict)
        for s in sets:
            mg = (s.muscle_group or "unknown").lower()
            ws = iso_week_start(sessions_by_id[s.session_id].date)
            by_group_week[mg][ws] = by_group_week[mg].get(ws, 0.0) + s.volume
        out = []
        for mg, weekly in by_group_week.items():
            this_week = iso_week_start(day)
            series = [round(weekly.get(this_week - timedelta(weeks=i), 0.0) / 1000.0, 2)
                      for i in range(5, -1, -1)]
            trend = F.qualitative_trend(series)
            sets_last_week = sum(
                1 for s in sets
                if (s.muscle_group or "").lower() == mg
                and sessions_by_id[s.session_id].date >= day - timedelta(days=7)
            )
            out.append({
                "muscle_group": mg,
                "trend": trend["trend"],                      # improving | stable | declining (qualitative)
                "confidence": trend["confidence"],            # data-coverage confidence, NOT fake precision
                "weekly_tonnage": series,
                "sets_last_week": sets_last_week,
                "basis": f"{len(weekly)} weeks of logged sets",
            })
        return sorted(out, key=lambda m: -m["weekly_tonnage"][-1])

    def recent_workouts(self, user_id: int, limit: int = 5) -> list[dict]:
        sessions = self.sessions.range(user_id, limit=limit)
        out = []
        for s in sessions:
            out.append({
                "id": s.id, "date": s.date.isoformat(), "name": s.name,
                "duration_min": s.duration, "sets": len(s.sets),
                "volume_kg": round(sum(st.volume for st in s.sets), 1),
            })
        return out

    # ------------------------------------------------------------------
    # Insight (deterministic; persisted as AIReport for evaluation)
    # ------------------------------------------------------------------
    def latest_insight(self, user: User, snapshot: dict) -> dict:
        fresh = self.reports.latest(user.id, types=("daily", "weekly", "training", "nutrition"))
        if fresh is not None and fresh.created_at and \
                (utcnow() - as_aware(fresh.created_at)).total_seconds() < INSIGHT_MAX_AGE_HOURS * 3600:
            content = fresh.content_json
            return {"report_id": fresh.id, **content,
                    "model_name": fresh.model_name, "model_version": fresh.model_version,
                    "created_at": fresh.created_at.isoformat(), "updated": humanize(fresh.created_at)}

        content = self._rule_insight(snapshot)
        report = self.reports.create(
            user_id=user.id, report_type="daily",
            period_start=utcnow() - timedelta(days=30), period_end=utcnow(),
            content_json=content, model_name=settings.AI_MODEL_NAME,
            model_version=settings.AI_MODEL_VERSION, confidence=content.get("confidence", 0.75),
        )
        self.db.flush()
        return {"report_id": report.id, **content,
                "model_name": settings.AI_MODEL_NAME, "model_version": settings.AI_MODEL_VERSION,
                "created_at": report.created_at.isoformat() if report.created_at else None,
                "updated": "just now"}

    def _rule_insight(self, snap: dict) -> dict:
        """Deterministic, honest insight from real aggregates only."""
        w, n, t = snap["weight"], snap["nutrition"], snap["training"]
        evidence = ["workout log", "nutrition log", "bodyweight log"]
        parts = []
        confidence = 0.7

        sessions, target = t["sessions_this_week"], t["target_per_week"]
        protein_today = n["today"]["protein"]
        protein_target = n["targets"]["protein"]
        weight_note = ""
        if w["current_kg"] is not None and w["change_30d_kg"] is not None:
            direction = "up" if w["change_30d_kg"] > 0.15 else "down" if w["change_30d_kg"] < -0.15 else "steady"
            weight_note = (f"Bodyweight is {direction} ({w['current_kg']} kg, "
                           f"{w['change_30d_kg']:+.1f} kg over 30 days). ")
            confidence += 0.05

        if sessions >= target:
            parts.append(f"You've hit this week's training target ({sessions}/{target} sessions)")
        elif target:
            parts.append(f"Training is at {sessions}/{target} sessions this week")

        if protein_target and protein_today < protein_target:
            parts.append(f"protein is slightly below today's target ({protein_today:.0f} g of {protein_target:.0f} g)")
        elif protein_target:
            parts.append(f"protein target met ({protein_today:.0f} g)")

        text = weight_note + (f"Your {' and '.join(parts)}. " if parts else "") + \
               "Keep logging consistently — trends sharpen as data accumulates."
        return {
            "title": "Daily insight",
            "text": text.strip(),
            "confidence": round(min(confidence, 0.85), 2),
            "evidence": evidence,
            "sources": ["Workouts", "Nutrition", "Bodyweight"],
        }

    # ------------------------------------------------------------------
    def snapshot(self, user: User) -> dict:
        """Lightweight aggregate reused by the coach for grounding."""
        return {
            "weight": self.weight_block(user.id),
            "nutrition": self.nutrition_block(user.id),
            "training": self.training_block(user.id),
            "goal_type": (self.active_goal(user.id).goal_type if self.active_goal(user.id) else None),
        }

    def dashboard(self, user: User) -> dict:
        snap = {
            "weight": self.weight_block(user.id),
            "nutrition": self.nutrition_block(user.id),
            "training": self.training_block(user.id),
        }
        muscle_trends = self.muscle_trends_block(user.id)
        insight = self.latest_insight(user, {**snap, "muscle_trends": muscle_trends})
        goal = self.active_goal(user.id)
        return {
            "user": {"name": user.name, "is_demo": user.is_demo},
            "generated_at": utcnow().isoformat(),
            "weight": snap["weight"],
            "nutrition": snap["nutrition"],
            "training": snap["training"],
            "muscle_trends": muscle_trends,
            "latest_insight": insight,
            "recent_workouts": self.recent_workouts(user.id),
            "goal_type": goal.goal_type if goal else None,
        }
