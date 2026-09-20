"""Logging configuration.

Rules:
- No tokens, passwords, or request headers are ever logged.
- In prod, log level is INFO; in dev, DEBUG.
"""
from __future__ import annotations

import logging
import sys

from app.core.config import settings

_FORMAT = "%(asctime)s %(levelname)-7s %(name)s — %(message)s"


def configure_logging() -> logging.Logger:
    root = logging.getLogger()
    if root.handlers:                       # already configured (e.g. tests re-import)
        return logging.getLogger("forgeai")
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT))
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    # Third-party noise reduction
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING if not settings.DEBUG else logging.INFO)
    return logging.getLogger("forgeai")
