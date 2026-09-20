"""Authentication service — hashing and tokens live in core/security;
this service composes user lookup + verification + token issuance."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AuthError, ConflictError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.repositories.user_repo import UserRepository


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def register(self, *, email: str, password: str, name: str) -> User:
        if self.users.get_by_email(email):
            raise ConflictError("email_taken", "An account with this email already exists.")
        user = self.users.create_user(email=email, password_hash=hash_password(password), name=name)
        return user

    def login(self, *, email: str, password: str) -> tuple[User, str, int]:
        user = self.users.get_by_email(email)
        # Constant-shape failure: same error for unknown email and wrong password.
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("invalid_credentials", "Incorrect email or password.")
        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        return user, create_access_token(user.id), expires_in
