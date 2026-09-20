"""Demo seed — realistic development data for ONE clearly-marked demo user.

Run:  python -m app.db.seed [--reset] [--if-missing]

- Creates demo@forgeai.dev (password from DEMO_USER_PASSWORD, default
  forgeai-demo) with `is_demo = True`.
- ~16 weeks of weight logs, 4 measurement snapshots, 8 weeks of PPL sessions
  with progressive overload, a food catalog, 7 days of meals, photo sessions
  (placeholder PNGs), a coach conversation, memories and AI reports.
- Deterministic (seeded RNG) and independent of real users: it never touches
  accounts created through /api/auth/register.
"""
from __future__ import annotations

import random
import sys
from datetime import date, datetime, time, timedelta, timezone

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.models import Base
from app.models import (
    AIEvaluation, AIReport, BodyMeasurement, Conversation, Exercise,
    FitnessGoal, FoodItem, FoodLog, Meal, Memory, Message, PhotoAnalysis,
    ProgressPhoto, User, UserProfile, WeightLog, WorkoutSession, WorkoutSet,
)
from app.services import nutrition_service as N

TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c626001000000ffff030000060005"
    "57bfabd40000000049454e44ae426082"
)

EXERCISES = [
    ("Bench Press", "chest", "barbell"), ("Incline DB Press", "chest", "dumbbell"),
    ("Cable Fly", "chest", "cable"), ("Overhead Press", "shoulders", "barbell"),
    ("Lateral Raise", "shoulders", "dumbbell"), ("Triceps Pushdown", "arms", "cable"),
    ("Barbell Curl", "arms", "barbell"), ("Deadlift", "back", "barbell"),
    ("Barbell Row", "back", "barbell"), ("Lat Pulldown", "back", "cable"),
    ("Squat", "legs", "barbell"), ("Leg Press", "legs", "machine"),
    ("Romanian Deadlift", "legs", "barbell"), ("Plank", "core", "bodyweight"),
]

FOODS = [
    ("Oats (dry)", 80, 303, 11.0, 52.0, 5.5, 8.0),
    ("Whey protein", 30, 120, 24.0, 3.0, 1.5, 0.0),
    ("Banana", 120, 107, 1.3, 27.0, 0.4, 3.1),
    ("Chicken breast", 150, 248, 46.5, 0.0, 5.4, 0.0),
    ("Cooked white rice", 180, 234, 4.5, 51.0, 0.5, 0.9),
    ("Greek yogurt", 170, 100, 17.0, 6.0, 0.7, 0.0),
    ("Almonds", 30, 174, 6.4, 6.1, 15.0, 3.8),
    ("Paneer", 100, 265, 18.0, 3.5, 21.0, 0.0),
    ("Dal (cooked)", 200, 232, 14.0, 40.0, 4.0, 8.0),
    ("Olive oil", 15, 133, 0.0, 0.0, 15.0, 0.0),
    ("Salad (mixed veg)", 150, 45, 2.0, 8.0, 0.4, 3.0),
    ("Coconut water", 250, 45, 0.5, 9.0, 0.5, 0.0),
    ("Dates (2)", 40, 113, 1.0, 30.0, 0.2, 3.5),
]

PPL_PLAN = {
    0: [("Bench Press", "chest"), ("Incline DB Press", "chest"), ("Overhead Press", "shoulders"),
        ("Cable Fly", "chest"), ("Triceps Pushdown", "arms")],          # Push A
    1: [("Deadlift", "back"), ("Barbell Row", "back"), ("Lat Pulldown", "back"),
        ("Barbell Curl", "arms")],                                       # Pull A
    3: [("Squat", "legs"), ("Leg Press", "legs"), ("Romanian Deadlift", "legs")],  # Legs A
    4: [("Incline DB Press", "chest"), ("Overhead Press", "shoulders"), ("Lateral Raise", "shoulders"),
        ("Triceps Pushdown", "arms")],                                   # Push B
    5: [("Barbell Row", "back"), ("Lat Pulldown", "back"), ("Barbell Curl", "arms")],  # Upper B
}
SESSION_NAMES = {0: "Push A", 1: "Pull A", 3: "Legs A", 4: "Push B", 5: "Upper B"}
BASE_LOAD = {
    "Bench Press": 25, "Incline DB Press": 14, "Cable Fly": 10, "Overhead Press": 22.5,
    "Lateral Raise": 6, "Triceps Pushdown": 17.5, "Barbell Curl": 12.5, "Deadlift": 77.5,
    "Barbell Row": 40, "Lat Pulldown": 45, "Squat": 62.5, "Leg Press": 120,
    "Romanian Deadlift": 50, "Plank": 0,
}


def _week_progression(weeks_ago: int) -> float:
    """Loads ramp from 0.80× → 1.00× across 8 weeks of history."""
    return 0.80 + (7 - weeks_ago) * (0.20 / 7)


def _log_seed_header() -> None:
    print("Seeding demo data —"
          f" user={settings.DEMO_USER_EMAIL} (is_demo=True), deterministic RNG(42)")


def seed(db, *, reset: bool = False) -> None:
    _log_seed_header()
    # Defensive cleanup: orphaned profile rows from legacy dev databases.
    db.query(UserProfile).filter(
        ~UserProfile.user_id.in_(db.query(User.id))
    ).delete(synchronize_session=False)
    db.commit()
    existing = db.query(User).filter(User.email == settings.DEMO_USER_EMAIL.lower()).one_or_none()
    if existing:
        if reset:
            print(f"  removing previous demo user #{existing.id} and all of its data…")
            # explicit profile cleanup (safe even if a previous run left orphans)
            db.query(UserProfile).filter_by(user_id=existing.id).delete()
            db.delete(existing)
            db.commit()
        elif "--if-missing" in sys.argv:
            print("  demo user already present — nothing to do.")
            return
        else:
            print("  demo user already present — pass --reset to rebuild.")
            return

    rng = random.Random(42)
    user = User(email=settings.DEMO_USER_EMAIL.lower(), name="Arka (demo)",
                password_hash=_hash(settings.DEMO_USER_PASSWORD), is_demo=True)
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id, age=25, sex="male", height_cm=173,
                       activity_level="moderate", goal="muscle_gain", training_frequency=5))

    day = date.today()

    # ---------------- goal ----------------
    db.add(FitnessGoal(user_id=user.id, goal_type="muscle_gain", target_weight=66.0,
                       target_calories=2500.0, target_protein=130.0,
                       start_date=day - timedelta(days=120), is_active=True))

    db.commit()
    counts = {
        "weight_logs": db.query(WeightLog).filter_by(user_id=user.id).count(),
        "measurements": db.query(BodyMeasurement).filter_by(user_id=user.id).count(),
        "sessions": db.query(WorkoutSession).filter_by(user_id=user.id).count(),
        "sets": db.query(WorkoutSet).join(WorkoutSession)
                .filter(WorkoutSession.user_id == user.id).count(),
        "meals": db.query(Meal).filter_by(user_id=user.id).count(),
        "photos": db.query(ProgressPhoto).filter_by(user_id=user.id).count(),
        "memories": db.query(Memory).filter_by(user_id=user.id).count(),
        "reports": db.query(AIReport).filter_by(user_id=user.id).count(),
    }
    print("  demo user ready OK  " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    print(f"  login: {settings.DEMO_USER_EMAIL} / {settings.DEMO_USER_PASSWORD}")


def _msg(db, conv, role, content, context_json=None):
    db.add(Message(conversation_id=conv.id, role=role, content=content,
                   token_count=max(1, len(content) // 4), context_json=context_json))


def _hash(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def main() -> None:
    Base.metadata.create_all(engine)   # seed works with or without alembic (dev convenience)
    db = SessionLocal()
    try:
        seed(db, reset="--reset" in sys.argv)
    finally:
        db.close()


if __name__ == "__main__":
    main()
