"""Fitness calculation engine — 100% deterministic, no AI involved.

All functions take data in and return plain dicts/floats. Services decide
*what* to compute; this module decides *how*. Every formula is unit-tested
in tests/test_fitness_service.py.
"""
from __future__ import annotations

import statistics
from datetime import date, timedelta
from typing import Sequence

from app.models.progress import WeightLog
from app.models.workout import WorkoutSet, WorkoutSession
from app.utils.datetime import iso_week_start, week_label


# ------------------------------------------------------------------
# Weight
# ------------------------------------------------------------------
def weight_change(logs: Sequence[WeightLog], *, within_days: int | None = None,
                  ref: date | None = None) -> dict:
    """Absolute change (kg) between the first and last log — chronologically."""
    ordered = sorted(logs, key=lambda l: (l.date, l.id))
    if within_days is not None:
        cutoff = (ref or ordered[-1].date if ordered else date.today()) - timedelta(days=within_days)
        ordered = [l for l in ordered if l.date >= cutoff]
    if not ordered:
        return {"change_kg": 0.0, "start_kg": None, "current_kg": None, "direction": "flat"}
    start, current = ordered[0], ordered[-1]
    change = round(float(current.weight) - float(start.weight), 2)
    direction = "up" if change > 0.15 else "down" if change < -0.15 else "flat"
    return {
        "change_kg": change,
        "start_kg": float(start.weight),
        "current_kg": float(current.weight),
        "direction": direction,
    }


def weight_rate_per_week(logs: Sequence[WeightLog]) -> float:
    """Least-squares slope of weight over time — kg/week (robust to gaps)."""
    ordered = sorted(logs, key=lambda l: (l.date, l.id))
    if len(ordered) < 2:
        return 0.0
    t0 = ordered[0].date
    xs = [(l.date - t0).days / 7.0 for l in ordered]
    ys = [float(l.weight) for l in ordered]
    mean_x, mean_y = statistics.fmean(xs), statistics.fmean(ys)
    var = sum((x - mean_x) ** 2 for x in xs)
    if var == 0:
        return 0.0
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / var
    return round(slope, 3)


def weight_sparkline(logs: Sequence[WeightLog], n: int = 14) -> list[float]:
    ordered = sorted(logs, key=lambda l: (l.date, l.id))
    return [round(float(l.weight), 1) for l in ordered[-n:]]


# ------------------------------------------------------------------
# Training frequency / consistency
# ------------------------------------------------------------------
def sessions_this_week(sessions: Sequence[WorkoutSession], ref: date) -> int:
    week_start = iso_week_start(ref)
    return sum(1 for s in sessions if week_start <= s.date <= ref)


def consistency_weeks(sessions: Sequence[WorkoutSession], ref: date, weeks: int = 12) -> list[dict]:
    """Per-ISO-week trained weekday grid for the last `weeks` weeks."""
    this_week = iso_week_start(ref)
    by_week: dict[date, set[int]] = {}
    for s in sessions:
        by_week.setdefault(iso_week_start(s.date), set()).add(s.date.weekday())

    out = []
    for i in range(weeks - 1, -1, -1):
        ws = this_week - timedelta(weeks=i)
        trained_days = sorted(by_week.get(ws, set()))
        out.append({
            "week_start": ws.isoformat(),
            "label": week_label(ws),
            "trained": [1 if d in trained_days else 0 for d in range(7)],
            "count": len(trained_days),
        })
    return out


def frequency_per_week(sessions: Sequence[WorkoutSession], days: int = 28, ref: date | None = None) -> float:
    if not sessions:
        return 0.0
    cutoff = (ref or max(s.date for s in sessions)) - timedelta(days=days - 1)
    recent = [s for s in sessions if s.date >= cutoff]
    return round(len(recent) / (days / 7.0), 2)


# ------------------------------------------------------------------
# Volume
# ------------------------------------------------------------------
def weekly_volume(sets: Sequence[WorkoutSet], sessions_by_id: dict[int, WorkoutSession],
                  weeks: int = 8, ref: date | None = None) -> list[dict]:
    """Tonnes lifted (weight × reps / 1000) grouped by ISO week."""
    by_week: dict[date, float] = {}
    for s in sets:
        session = sessions_by_id.get(s.session_id)
        if session is None:
            continue
        by_week[iso_week_start(session.date)] = by_week.get(iso_week_start(session.date), 0.0) + s.volume

    this_week = iso_week_start(ref or date.today())
    out = []
    for i in range(weeks - 1, -1, -1):
        ws = this_week - timedelta(weeks=i)
        tonnes = round(by_week.get(ws, 0.0) / 1000.0, 2)
        out.append({"week_start": ws.isoformat(), "label": week_label(ws), "tonnes": tonnes})
    return out


def muscle_group_volume(sets: Sequence[WorkoutSet]) -> list[dict]:
    """Sets and tonnage per muscle group, descending by sets."""
    agg: dict[str, dict] = {}
    for s in sets:
        mg = (s.muscle_group or "unknown").lower()
        row = agg.setdefault(mg, {"muscle_group": mg, "sets": 0, "tonnage_kg": 0.0})
        row["sets"] += 1
        row["tonnage_kg"] += s.volume
    return sorted(
        ({"muscle_group": k, "sets": v["sets"], "tonnage_kg": round(v["tonnage_kg"], 1)}
         for k, v in agg.items()),
        key=lambda r: r["sets"], reverse=True,
    )


# ------------------------------------------------------------------
# Progressive overload: PRs and strength trends
# ------------------------------------------------------------------
def exercise_prs(sets: Sequence[WorkoutSet], sessions_by_id: dict[int, WorkoutSession]) -> list[dict]:
    """Personal records: moments where a user's best estimated 1RM for an
    exercise improved. Returns the most recent PR per exercise."""
    best: dict[str, tuple[float, WorkoutSet]] = {}
    ordered = sorted(sets, key=lambda s: (sessions_by_id[s.session_id].date, s.id))
    prs: dict[str, dict] = {}
    for s in ordered:
        name = s.exercise
        e1 = s.est_1rm
        if e1 <= 0:
            continue
        if name not in best or e1 > best[name][0]:
            best[name] = (e1, s)
            session = sessions_by_id[s.session_id]
            prs[name] = {
                "exercise": name,
                "weight": float(s.weight),
                "reps": int(s.reps),
                "est_1rm": e1,
                "date": session.date.isoformat(),
            }
    return sorted(prs.values(), key=lambda p: p["date"], reverse=True)


def strength_trend(sets: Sequence[WorkoutSet], sessions_by_id: dict[int, WorkoutSession],
                   exercise: str, weeks: int = 8) -> list[dict]:
    """Best estimated 1RM per ISO week for one exercise."""
    by_week: dict[date, float] = {}
    for s in sets:
        if s.exercise.lower() != exercise.lower():
            continue
        session = sessions_by_id.get(s.session_id)
        if session is None:
            continue
        ws = iso_week_start(session.date)
        by_week[ws] = max(by_week.get(ws, 0.0), s.est_1rm)
    this_week = iso_week_start(date.today())
    out = []
    for i in range(weeks - 1, -1, -1):
        ws = this_week - timedelta(weeks=i)
        val = by_week.get(ws)
        out.append({"week_start": ws.isoformat(), "label": week_label(ws), "est_1rm": round(val, 1) if val else None})
    return out


# ------------------------------------------------------------------
# Qualitative muscle trend (no fake precision)
# ------------------------------------------------------------------
def qualitative_trend(weekly_values: Sequence[float]) -> dict:
    """'improving' | 'stable' | 'declining' from a weekly series, plus a
    data-coverage confidence (how much evidence the trend rests on)."""
    vals = [float(v) for v in weekly_values if v is not None]
    if len(vals) < 3:
        return {"trend": "stable", "confidence": 0.35 if vals else 0.0}
    first_half = statistics.fmean(vals[: len(vals) // 2])
    second_half = statistics.fmean(vals[len(vals) // 2:])
    base = first_half if first_half > 0 else 1.0
    change = (second_half - first_half) / base
    if change > 0.05:
        trend = "improving"
    elif change < -0.05:
        trend = "declining"
    else:
        trend = "stable"
    # Confidence grows with evidence volume and consistency, capped at 0.85.
    n = len(vals)
    mean = statistics.fmean(vals)
    noise = (statistics.pstdev(vals) / mean) if mean > 0 else 1.0
    confidence = min(0.85, 0.40 + 0.05 * (n - 2) - (0.05 if noise > 0.4 else 0.0))
    return {"trend": trend, "confidence": round(max(0.3, confidence), 2)}
