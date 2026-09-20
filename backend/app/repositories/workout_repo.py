"""Workout repositories: sessions, sets, exercise catalog."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workout import Exercise, WorkoutSession, WorkoutSet
from app.repositories.base import BaseRepository


class SessionRepository(BaseRepository[WorkoutSession]):
    model = WorkoutSession

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_for_user(self, session_id: int, user_id: int) -> WorkoutSession | None:
        return self.db.scalar(select(WorkoutSession).where(
            WorkoutSession.id == session_id, WorkoutSession.user_id == user_id))

    def range(self, user_id: int, start: date | None = None, end: date | None = None,
              limit: int | None = None) -> list[WorkoutSession]:
        stmt = select(WorkoutSession).where(WorkoutSession.user_id == user_id)
        if start:
            stmt = stmt.where(WorkoutSession.date >= start)
        if end:
            stmt = stmt.where(WorkoutSession.date <= end)
        stmt = stmt.order_by(WorkoutSession.date.desc(), WorkoutSession.id.desc())
        if limit:
            stmt = stmt.limit(limit)
        return list(self.db.scalars(stmt).all())

    def sets_in_range(self, user_id: int, start: date, end: date) -> list[WorkoutSet]:
        """All sets belonging to sessions in [start, end] — chronological."""
        stmt = (
            select(WorkoutSet)
            .join(WorkoutSession, WorkoutSet.session_id == WorkoutSession.id)
            .where(WorkoutSession.user_id == user_id, WorkoutSession.date >= start, WorkoutSession.date <= end)
            .order_by(WorkoutSession.date.asc(), WorkoutSet.id.asc())
        )
        return list(self.db.scalars(stmt).all())


class ExerciseRepository(BaseRepository[Exercise]):
    model = Exercise

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_or_create(self, name: str, muscle_group: str | None = None) -> Exercise:
        stmt = select(Exercise).where(Exercise.name == name.strip())
        obj = self.db.scalar(stmt)
        if obj:
            return obj
        obj = Exercise(name=name.strip(), muscle_group=(muscle_group or "full_body"))
        self.db.add(obj)
        self.db.flush()
        return obj

    def all(self) -> list[Exercise]:
        return list(self.db.scalars(select(Exercise).order_by(Exercise.name)).all())
