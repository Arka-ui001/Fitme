"""Generic repository — thin data-access helpers; business logic lives in services."""
from __future__ import annotations

from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, db: Session):
        self.db = db

    def get(self, id_: int) -> ModelT | None:
        return self.db.get(self.model, id_)

    def create(self, **fields) -> ModelT:
        obj = self.model(**fields)
        self.db.add(obj)
        self.db.flush()
        return obj

    def delete(self, obj: ModelT) -> None:
        self.db.delete(obj)
        self.db.flush()

    def list_for_user(self, user_id: int, *, limit: int | None = None, offset: int = 0,
                      order_desc: bool = True) -> list[ModelT]:
        stmt = select(self.model).where(self.model.user_id == user_id)  # type: ignore[attr-defined]
        col = self.model.date if hasattr(self.model, "date") else getattr(self.model, "created_at", None)  # type: ignore[attr-defined]
        if col is not None:
            stmt = stmt.order_by(col.desc() if order_desc else col.asc())
        if offset:
            stmt = stmt.offset(offset)
        if limit:
            stmt = stmt.limit(limit)
        return list(self.db.scalars(stmt).all())
