"""User repositories."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User, UserProfile
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email.lower().strip()))

    def create_user(self, *, email: str, password_hash: str, name: str, is_demo: bool = False) -> User:
        user = User(email=email.lower().strip(), password_hash=password_hash, name=name.strip(), is_demo=is_demo)
        self.db.add(user)
        self.db.flush()
        self.db.add(UserProfile(user_id=user.id))
        self.db.flush()
        return user

    def get_profile(self, user_id: int) -> UserProfile | None:
        return self.db.get(UserProfile, user_id)

    def upsert_profile(self, user_id: int, **fields) -> UserProfile:
        profile = self.db.get(UserProfile, user_id)
        if profile is None:
            profile = UserProfile(user_id=user_id)
            self.db.add(profile)
        for key, value in fields.items():
            if value is not None:
                setattr(profile, key, value)
        self.db.flush()
        return profile
