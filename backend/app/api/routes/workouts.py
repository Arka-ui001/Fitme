"""Workout routes: list (aggregated), create session, add sets."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.user import User
from app.repositories.workout_repo import ExerciseRepository, SessionRepository
from app.schemas.common import ok
from app.schemas.workout import WorkoutSessionCreate, WorkoutSetAdd
from app.services import fitness_service as F
from app.services.dashboard_service import DashboardService
from app.utils.datetime import iso_week_start, today

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _session_out(session) -> dict:
    return {
        "id": session.id, "date": session.date.isoformat(), "name": session.name,
        "duration": session.duration, "notes": session.notes,
        "sets": [{
            "id": st.id, "exercise": st.exercise, "muscle_group": st.muscle_group,
            "set_number": st.set_number, "weight": st.weight, "reps": st.reps,
            "rir": st.rir, "rpe": st.rpe, "rest_seconds": st.rest_seconds,
            "volume": st.volume, "est_1rm": st.est_1rm,
        } for st in session.sets],
        "volume_kg": round(sum(st.volume for st in session.sets), 1),
    }


@router.get("")
def list_workouts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repo = SessionRepository(db)
    day = today()
    sessions = repo.range(current_user.id, start=day - timedelta(days=180), end=day, limit=20)
    sessions_by_id = {s.id: s for s in sessions}
    sets = repo.sets_in_range(current_user.id, day - timedelta(days=70), day)

    # current week grid Mon..Sun – base week on most recent session if any
    week = []
    # Determine reference date: most recent session date or today
    ref_date = sessions[0].date if sessions else day
    ws = iso_week_start(ref_date)
    by_date = {}
    for s in repo.range(current_user.id, start=ws, end=ws + timedelta(days=6)):
        by_date[s.date] = s
    for i in range(7):
        d = ws + timedelta(days=i)
        s = by_date.get(d)
        week.append({
            "day": d.strftime("%a"), "date": d.isoformat(),
            "trained": s is not None, "session_id": s.id if s else None,
            "name": s.name if s else None,
        })

    # PRs from the last 90 days of sets
    pr_sets = repo.sets_in_range(current_user.id, day - timedelta(days=90), day)
    all_sessions_by_id = {s.id: s for s in repo.range(current_user.id, start=day - timedelta(days=90), end=day)}
    prs = F.exercise_prs(pr_sets, all_sessions_by_id)[:6]

    dash = DashboardService(db)
    stats = {
        "weekly_volume": F.weekly_volume(sets, sessions_by_id, weeks=8, ref=day),
        "muscle_volume": F.muscle_group_volume(sets),
        "frequency_per_week": F.frequency_per_week(sessions, days=28, ref=day),
        "targets": dash.targets(current_user.id),
    }

    today_session = by_date.get(day)
    return ok({
        "today": _session_out(today_session) if today_session else None,
        "week": week,
        "sessions": [_session_out(s) for s in sessions],
        "prs": prs,
        "stats": stats,
    })


@router.post("", status_code=201)
def create_session(payload: WorkoutSessionCreate,
                   current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repo = SessionRepository(db)
    exercises = ExerciseRepository(db)
    session = repo.create(user_id=current_user.id, date=payload.date or today(),
                          name=payload.name, duration=payload.duration, notes=payload.notes)
    for set_in in payload.sets:
        exercise = exercises.get_or_create(set_in.exercise, set_in.muscle_group)
        session.sets.append(_make_set(set_in, exercise.id, exercise.muscle_group))
    db.commit()
    return ok(_session_out(session))


@router.post("/{session_id}/sets", status_code=201)
def add_sets(session_id: int, payload: WorkoutSetAdd,
             current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repo = SessionRepository(db)
    exercises = ExerciseRepository(db)
    session = repo.get_for_user(session_id, current_user.id)
    if session is None:
        raise NotFoundError("session_not_found", f"No workout session #{session_id} for this user.")
    for set_in in payload.sets:
        exercise = exercises.get_or_create(set_in.exercise, set_in.muscle_group)
        session.sets.append(_make_set(set_in, exercise.id, exercise.muscle_group))
    db.commit()
    db.refresh(session)
    return ok(_session_out(session))


def _make_set(set_in, exercise_id: int, muscle_group: str):
    from app.models.workout import WorkoutSet
    return WorkoutSet(
        exercise=set_in.exercise, exercise_id=exercise_id,
        muscle_group=(set_in.muscle_group or muscle_group),
        set_number=set_in.set_number, weight=set_in.weight, reps=set_in.reps,
        rir=set_in.rir, rpe=set_in.rpe, rest_seconds=set_in.rest_seconds,
    )
