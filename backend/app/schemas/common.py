"""Consistent API response envelope + pagination meta.

Every successful response: {"success": true, "data": ..., "error": null}
Every error response:     {"success": false, "data": null, "error": {code, message}}
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class Envelope(BaseModel):
    success: bool = True
    data: Optional[Any] = None
    error: Optional[ErrorDetail] = None


def ok(data: Any = None) -> dict:
    """Standard success envelope."""
    return {"success": True, "data": data, "error": None}


def created(data: Any = None) -> dict:
    return ok(data)
