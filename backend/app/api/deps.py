"""Shared API dependencies: DB session, current user, pagination."""
from __future__ import annotations

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AuthError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repo import UserRepository

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthError("missing_token", "Authorization header with a Bearer token is required.")
    user_id = decode_access_token(credentials.credentials)
    user = UserRepository(db).get(user_id)
    if user is None:
        raise AuthError("user_not_found", "This account no longer exists.")
    return user


class Pagination:
    def __init__(self,
                 limit: int = Query(default=20, ge=1, le=100),
                 offset: int = Query(default=0, ge=0)):
        self.limit = limit
        self.offset = offset


def get_pagination(pagination: Pagination = Depends()) -> Pagination:
    return pagination
