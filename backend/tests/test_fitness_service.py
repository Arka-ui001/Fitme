"""Fitness engine — weight trends, volume, PRs, qualitative trends."""
from datetime import date

from app.models.workout import WorkoutSession, WorkoutSet
from app.services import fitness_service as F


class L:  # weight-log stub
    def __init__(self, i, d, w):
        self.id, self.date, self.weight = i, d, w


def test_weight_change():
    logs = [L(1, date(2026, 6, 1), 61.8), L(2, date(2026, 7, 1), 62.5),
            L(3, date(2026, 9, 5), 63.4), L(4, date(2026, 9, 19), 63.6)]
    r = F.weight_change(logs)
    assert r["change_kg"] == 1.8 and r["direction"] == "up"
    r30 = F.weight_change(logs, within_days=30, ref=date(2026, 9, 19))
    assert r30["change_kg"] == 0.2                             # Sep 5 → Sep 19


def test_weight_rate_per_week_linear_regression():
    logs = [L(1, date(2026, 9, 1), 62.0), L(2, date(2026, 9, 8), 62.5), L(3, date(2026, 9, 15), 63.0)]
    assert F.weight_rate_per_week(logs) == 0.5     # perfectly linear 0.5 kg/week


def test_sessions_this_week_iso():
    s = WorkoutSession(id=1, user_id=1, date=date(2026, 9, 16))   # Wed
    assert F.sessions_this_week([s], date(2026, 9, 19)) == 1
    s2 = WorkoutSession(id=2, user_id=1, date=date(2026, 9, 12))  # previous Sat
    assert F.sessions_this_week([s, s2], date(2026, 9, 19)) == 1


def _mk_set(i, session_id, exercise, weight, reps, mg="chest"):
    return WorkoutSet(id=i, session_id=session_id, exercise=exercise, set_number=1,
                      weight=weight, reps=reps, muscle_group=mg)


def test_weekly_volume_and_muscle_split():
    sessions = {1: WorkoutSession(id=1, user_id=1, date=date(2026, 9, 14)),
                2: WorkoutSession(id=2, user_id=1, date=date(2026, 9, 16))}
    sets = [_mk_set(1, 1, "Bench Press", 100, 5), _mk_set(2, 2, "Squat", 80, 10, mg="legs"),
            _mk_set(3, 2, "Squat", 80, 10, mg="legs")]
    weeks = F.weekly_volume(sets, sessions, weeks=2, ref=date(2026, 9, 19))
    assert weeks[-1]["tonnes"] == (500 + 800 + 800) / 1000
    split = F.muscle_group_volume(sets)
    assert split[0]["muscle_group"] == "legs" and split[0]["sets"] == 2


def test_pr_detection_progressive_overload():
    sessions = {1: WorkoutSession(id=1, user_id=1, date=date(2026, 8, 1)),
                2: WorkoutSession(id=2, user_id=1, date=date(2026, 9, 1))}
    sets = [_mk_set(1, 1, "Bench Press", 25, 8),      # e1RM = 31.67
            _mk_set(2, 2, "Bench Press", 27.5, 8)]    # e1RM = 34.83 → PR
    prs = F.exercise_prs(sets, sessions)
    assert len(prs) == 1
    assert prs[0]["exercise"] == "Bench Press" and prs[0]["weight"] == 27.5


def test_est_1rm_epley():
    assert _mk_set(1, 1, "X", 100, 1).est_1rm == 100.0
    assert _mk_set(2, 1, "X", 100, 10).est_1rm == round(100 * (1 + 10 / 30), 2)


def test_qualitative_trend_no_fake_precision():
    improving = F.qualitative_trend([1.0, 1.1, 1.3, 1.6, 2.0])
    assert improving["trend"] == "improving" and improving["confidence"] <= 0.85
    flat = F.qualitative_trend([1.0, 1.01, 0.99, 1.0, 1.01])
    assert flat["trend"] == "stable"
    sparse = F.qualitative_trend([1.0])
    assert sparse["confidence"] <= 0.4               # little data → low confidence


def test_consistency_weeks_grid():
    sessions = [WorkoutSession(id=1, user_id=1, date=date(2026, 9, 14)),   # Mon
                WorkoutSession(id=2, user_id=1, date=date(2026, 9, 16))]   # Wed
    weeks = F.consistency_weeks(sessions, date(2026, 9, 19), weeks=2)
    this_week = weeks[-1]
    assert this_week["count"] == 2
    assert this_week["trained"][0] == 1 and this_week["trained"][2] == 1
    assert sum(this_week["trained"]) == 2
