"""Auth routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User, UserProfile
from app.models.goal import FitnessGoal
from app.models.progress import WeightLog
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut, ProfileUpdateRequest
from app.schemas.common import ok
from app.services.auth_service import AuthService
from app.services.rate_limit import auth_limit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    auth_limit(request)
    user = AuthService(db).register(email=payload.email, password=payload.password, name=payload.name)
    db.commit()
    return ok(UserOut.model_validate(user).model_dump())


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    auth_limit(request)
    user, token, expires_in = AuthService(db).login(email=payload.email, password=payload.password)
    db.commit()
    return ok({
        **TokenResponse(access_token=token, expires_in=expires_in).model_dump(),
        "user": UserOut.model_validate(user).model_dump(),
    })


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return ok(UserOut.model_validate(current_user).model_dump())


@router.put("/profile")
def update_profile(payload: ProfileUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.name:
        current_user.name = payload.name

    # UserProfile
    profile = db.query(UserProfile).filter_by(user_id=current_user.id).one_or_none()
    if profile is None:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    age = payload.age
    if age is None and payload.birth_year:
        age = 2026 - payload.birth_year
    if age is not None:
        profile.age = age
    if payload.height_cm is not None:
        profile.height_cm = payload.height_cm
    if payload.goal is not None:
        profile.goal = payload.goal
    if payload.training_frequency is not None:
        profile.training_frequency = payload.training_frequency

    # Weight log
    if payload.weight_kg is not None:
        from datetime import date
        today = date.today()
        log = db.query(WeightLog).filter_by(user_id=current_user.id, date=today).first()
        if log:
            log.weight = payload.weight_kg
        else:
            db.add(WeightLog(user_id=current_user.id, date=today, weight=payload.weight_kg))

    # FitnessGoal
    goal = db.query(FitnessGoal).filter_by(user_id=current_user.id, is_active=True).first()
    if goal is None:
        from datetime import date
        goal = FitnessGoal(user_id=current_user.id, start_date=date.today(), is_active=True, goal_type=payload.goal or "muscle_gain")
        db.add(goal)

    if payload.goal is not None:
        goal.goal_type = payload.goal
    if payload.target_weight is not None:
        goal.target_weight = payload.target_weight
    if payload.target_calories is not None:
        goal.target_calories = payload.target_calories
    if payload.target_protein is not None:
        goal.target_protein = payload.target_protein

    db.commit()
    db.refresh(current_user)
    return ok(UserOut.model_validate(current_user).model_dump())
