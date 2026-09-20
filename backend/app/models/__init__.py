"""All ORM models — import this module in Alembic env / seeds."""
from app.models.base import Base
from app.models.user import User, UserProfile
from app.models.progress import WeightLog, BodyMeasurement, ProgressPhoto, PhotoAnalysis
from app.models.workout import Exercise, WorkoutSession, WorkoutSet
from app.models.nutrition import FoodItem, Meal, FoodLog, DailyNutrition
from app.models.goal import FitnessGoal
from app.models.video import ExerciseVideo, VideoAnalysis
from app.models.ai import Conversation, Message, Memory, AIReport, AIEvaluation

__all__ = [
    "Base",
    "User", "UserProfile",
    "WeightLog", "BodyMeasurement", "ProgressPhoto", "PhotoAnalysis",
    "Exercise", "WorkoutSession", "WorkoutSet",
    "FoodItem", "Meal", "FoodLog", "DailyNutrition",
    "FitnessGoal",
    "ExerciseVideo", "VideoAnalysis",
    "Conversation", "Message", "Memory", "AIReport", "AIEvaluation",
]
