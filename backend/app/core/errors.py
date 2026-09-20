"""Consistent application errors mapped to the response envelope.

Every error the API returns has the shape:
    {"success": false, "data": null, "error": {"code": "...", "message": "..."}}
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

STATUS_BY_CODE_CLASS = 400


class AppError(Exception):
    """Base class for all expected API errors."""

    status_code = 400
    code = "bad_request"

    def __init__(self, code: str | None = None, message: str = "Bad request.", status_code: int | None = None):
        self.code = code or self.code
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)


class AuthError(AppError):
    status_code, code = 401, "unauthorized"


class ForbiddenError(AppError):
    status_code, code = 403, "forbidden"


class NotFoundError(AppError):
    status_code, code = 404, "not_found"


class ConflictError(AppError):
    status_code, code = 409, "conflict"


class UploadError(AppError):
    status_code, code = 400, "invalid_upload"


class RateLimitError(AppError):
    status_code, code = 429, "rate_limited"


def _envelope(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "data": None, "error": {"code": code, "message": message}},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError):
        return _envelope(exc.code, exc.message, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError):
        parts = []
        for err in exc.errors()[:3]:
            loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body",))
            parts.append(f"{loc or 'input'}: {err.get('msg', 'invalid')}")
        return _envelope("validation_error", "; ".join(parts) or "Invalid input.", 422)

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(_: Request, exc: StarletteHTTPException):
        codes = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed", 429: "rate_limited"}
        return _envelope(codes.get(exc.status_code, "http_error"), str(exc.detail), exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        # Never leak internals / stack traces to clients.
        logger = getattr(request.app.state, "logger", None)
        if logger:
            logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _envelope("internal_error", "An unexpected error occurred.", 500)
