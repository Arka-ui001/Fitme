"""Small deterministic datetime helpers (no hidden clock usage in services —
functions that need "today" take it as an argument, which keeps tests honest)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(dt: datetime) -> datetime:
    """Normalize DB datetimes — SQLite returns naive values (stored as UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def today() -> date:
    return utcnow().date()


def iso_week_start(day: date) -> date:
    """Monday of the ISO week containing `day`."""
    return day - timedelta(days=day.weekday())


def week_label(day: date) -> str:
    return f"W{day.isocalendar()[1]:02d}"


def month_label(day: date) -> str:
    return day.strftime("%B %Y")


def days_ago(n: int, ref: date | None = None) -> date:
    return (ref or today()) - timedelta(days=n)


def humanize(dt: datetime, ref: datetime | None = None) -> str:
    """'just now', '5m ago', '2h ago', '3d ago' — used for insight freshness."""
    delta = (ref or utcnow()) - as_aware(dt)
    seconds = int(delta.total_seconds())
    if seconds < 90:
        return "just now"
    if seconds < 3600:
        return f"{seconds // 60}m ago"
    if seconds < 86400:
        return f"{seconds // 3600}h ago"
    return f"{seconds // 86400}d ago"


def parse_date(value: str | date | None, field: str = "date") -> date:
    if value is None:
        return today()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        from app.core.errors import AppError
        raise AppError("validation_error", f"{field}: expected ISO date (YYYY-MM-DD), got {value!r}") from e
