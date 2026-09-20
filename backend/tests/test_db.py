"""Database operations: constraints, history semantics, cascade deletes."""
from datetime import date

from sqlalchemy import select

from app.models.progress import BodyMeasurement, WeightLog
from app.models.user import User
from app.repositories.user_repo import UserRepository


def test_unique_email_constraint(db_session):
    repo = UserRepository(db_session)
    repo.create_user(email="a@x.io", password_hash="h", name="A")
    db_session.commit()
    duplicate = User(email="a@x.io", password_hash="h", name="B")
    db_session.add(duplicate)
    try:
        db_session.commit()
        assert False, "expected IntegrityError"
    except Exception:
        db_session.rollback()
    assert db_session.scalar(select(User).where(User.email == "a@x.io")).name == "A"


def test_weight_logs_keep_full_history(db_session):
    repo = UserRepository(db_session)
    user = repo.create_user(email="h@x.io", password_hash="h", name="H")
    for i, w in enumerate([62.0, 62.5, 63.0]):
        db_session.add(WeightLog(user_id=user.id, weight=w, date=date(2026, 9, 1 + i)))
    db_session.commit()
    logs = db_session.scalars(select(WeightLog).where(WeightLog.user_id == user.id)).all()
    assert sorted(float(l.weight) for l in logs) == [62.0, 62.5, 63.0]


def test_measurements_never_overwritten(db_session):
    repo = UserRepository(db_session)
    user = repo.create_user(email="m@x.io", password_hash="h", name="M")
    db_session.add(BodyMeasurement(user_id=user.id, date=date(2026, 6, 1), waist=74.2))
    db_session.commit()
    db_session.add(BodyMeasurement(user_id=user.id, date=date(2026, 9, 1), waist=73.0))
    db_session.commit()
    rows = db_session.scalars(select(BodyMeasurement).where(BodyMeasurement.user_id == user.id)).all()
    assert len(rows) == 2 and {74.2, 73.0} == {float(r.waist) for r in rows}


def test_user_delete_cascades_owned_rows(db_session):
    from app.models.goal import FitnessGoal
    from app.models.progress import BodyMeasurement, WeightLog
    from app.models.user import UserProfile
    from app.models.workout import WorkoutSession

    repo = UserRepository(db_session)
    user = repo.create_user(email="c@x.io", password_hash="h", name="C")
    db_session.add(WeightLog(user_id=user.id, weight=62, date=date(2026, 9, 1)))
    db_session.add(BodyMeasurement(user_id=user.id, date=date(2026, 9, 1), waist=73))
    db_session.add(FitnessGoal(user_id=user.id, goal_type="muscle_gain"))
    db_session.add(WorkoutSession(user_id=user.id, date=date(2026, 9, 1)))
    db_session.commit()

    uid = user.id
    db_session.query(UserProfile).filter_by(user_id=uid).delete()
    db_session.delete(user)
    db_session.commit()

    assert db_session.scalar(select(WeightLog).where(WeightLog.user_id == uid)) is None
    assert db_session.scalar(select(BodyMeasurement).where(BodyMeasurement.user_id == uid)) is None
    assert db_session.scalar(select(WorkoutSession).where(WorkoutSession.user_id == uid)) is None
