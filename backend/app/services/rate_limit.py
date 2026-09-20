"""Rate limiting — in-memory sliding window per (bucket, client IP).

Architecture note: the interface (`check`) is intentionally tiny so this can
be swapped for a Redis-backed limiter without touching any route handler.
For a single-user personal deployment the in-memory limiter is sufficient.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from app.core.config import settings
from app.core.errors import RateLimitError


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, max_events: int, window_seconds: int = 60) -> None:
        """Raise RateLimitError if `key` exceeds max_events within the window."""
        now = time.monotonic()
        with self._lock:
            q = self._events[key]
            while q and now - q[0] > window_seconds:
                q.popleft()
            if len(q) >= max_events:
                raise RateLimitError("rate_limited", "Too many requests — slow down a little.")
            q.append(now)


limiter = SlidingWindowRateLimiter()


def auth_limit(request) -> None:
    limiter.check(f"auth:{request.client.host if request.client else 'unknown'}",
                  settings.RATE_LIMIT_AUTH_PER_MIN)


def chat_limit(request) -> None:
    limiter.check(f"chat:{request.client.host if request.client else 'unknown'}",
                  settings.RATE_LIMIT_CHAT_PER_MIN)


def upload_limit(request) -> None:
    limiter.check(f"upload:{request.client.host if request.client else 'unknown'}",
                  settings.RATE_LIMIT_UPLOAD_PER_MIN)
