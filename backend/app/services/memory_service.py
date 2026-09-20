"""Persistent AI memory — the coach reads top-K memories instead of the
entire chat history (spec §10). Extraction hooks are deterministic today;
an AI provider can enrich them later without changing call sites."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ai import Memory
from app.repositories.ai_repo import MemoryRepository
from app.services.ai.base import UserContext

DEFAULT_IMPORTANCE = {
    "profile": 0.9, "preference": 0.8, "goal": 0.85, "training": 0.6,
    "nutrition": 0.6, "progress": 0.65, "recommendation": 0.55, "outcome": 0.7,
}


class MemoryService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = MemoryRepository(db)

    def remember(self, *, user_id: int, category: str, content: str,
                 importance: float | None = None, source: str | None = None) -> Memory:
        if category not in DEFAULT_IMPORTANCE:
            from app.core.errors import AppError
            raise AppError("validation_error",
                           f"category must be one of: {', '.join(sorted(DEFAULT_IMPORTANCE))}")
        return self.repo.create(
            user_id=user_id, category=category, content=content.strip(),
            importance=importance if importance is not None else DEFAULT_IMPORTANCE[category],
            source=source,
        )

    def top_memories(self, user_id: int, limit: int = 8) -> list[Memory]:
        return self.repo.top(user_id, limit=limit)

    def to_context(self, user_id: int, limit: int = 8) -> tuple[list[str], list[Memory]]:
        rows = self.top_memories(user_id, limit)
        return [f"[{m.category}] {m.content}" for m in rows], rows

    # ---------------- deterministic extraction hooks ----------------
    def record_goal_context(self, user_id: int, goal_type: str, target_protein: float | None,
                            target_calories: float | None) -> None:
        self.remember(
            user_id=user_id, category="goal", source="goal",
            content=f"Active goal: {goal_type}"
                    + (f", protein target {target_protein:.0f} g/day" if target_protein else "")
                    + (f", calorie target {target_calories:.0f} kcal/day" if target_calories else "") + ".",
        )

    def record_evaluation_outcome(self, user_id: int, report_id: int, feedback: str) -> None:
        label = {"correct": "confirmed accurate", "partially_correct": "partially accurate",
                 "incorrect": "marked incorrect"}[feedback]
        self.remember(
            user_id=user_id, category="outcome", source="evaluation",
            content=f"User reviewed AI report #{report_id} and {label}.",
        )

    def enrich_context(self, ctx: UserContext, user_id: int) -> UserContext:
        memories, _ = self.to_context(user_id)
        ctx.memories = memories
        return ctx
