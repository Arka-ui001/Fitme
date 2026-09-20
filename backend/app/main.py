"""FastAPI application factory."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.routes import (
    analysis, auth, coach, dashboard, evaluation, files, history, nutrition, progress, workouts,
)
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = configure_logging()
    logger.info("%s v%s starting (env=%s, provider=%s)",
                settings.APP_NAME, __version__, settings.ENV, settings.AI_PROVIDER)
    yield
    logger.info("%s shutting down", settings.APP_NAME)


def create_app() -> FastAPI:
    settings.validate_production_safety()

    app = FastAPI(
        title=settings.APP_NAME,
        version=__version__,
        description=(
            "Backend for ForgeAI — personal AI fitness intelligence.\n\n"
            "**AI-provider independent**: all AI surface (`/analysis/*`, `/coach/*`) runs through the "
            "pluggable provider layer (`app/services/ai/`). The default `stub` provider needs no API key.\n\n"
            "All responses use the envelope: `{success, data, error}`."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    # CORS — frontend may be served on any dev origin; tighten via CORS_ORIGINS.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=settings.CORS_ORIGINS.strip() != "*",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.state.logger = configure_logging()

    # Import models so create_all works for lightweight dev bootstraps
    # (Alembic migrations are the source of truth for real deployments).
    from app.db import base as _models  # noqa: F401

    app.include_router(auth.router, prefix=settings.API_PREFIX)
    app.include_router(dashboard.router, prefix=settings.API_PREFIX)
    app.include_router(progress.router, prefix=settings.API_PREFIX)
    app.include_router(workouts.router, prefix=settings.API_PREFIX)
    app.include_router(nutrition.router, prefix=settings.API_PREFIX)
    app.include_router(analysis.router, prefix=settings.API_PREFIX)
    app.include_router(coach.router, prefix=settings.API_PREFIX)
    app.include_router(evaluation.router, prefix=settings.API_PREFIX)
    app.include_router(files.router, prefix=settings.API_PREFIX)
    app.include_router(history.router, prefix=settings.API_PREFIX)

    @app.get("/health", tags=["system"])
    def health():
        from sqlalchemy import text
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:  # noqa: BLE001
            db_ok = False
        return {"success": True, "data": {
            "status": "ok" if db_ok else "degraded",
            "database": "up" if db_ok else "down",
            "version": __version__,
            "ai_provider": settings.AI_PROVIDER,
        }, "error": None}

    return app


app = create_app()
