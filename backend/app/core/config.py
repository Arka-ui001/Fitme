"""Application settings — loaded from environment / .env (pydantic-settings)."""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "ForgeAI API"
    APP_VERSION: str = "0.1.0"
    ENV: str = "dev"                     # dev | prod
    DEBUG: bool = True
    API_PREFIX: str = "/api"

    # --- Security ---
    SECRET_KEY: str = "change-me-to-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7       # 7 days (personal app)

    # --- Database ---
    DATABASE_URL: str = "sqlite:///./forgeai.db"

    # --- CORS ---
    CORS_ORIGINS: str = "*"              # tighten for production, e.g. "https://app.example.com"

    # --- Uploads / storage ---
    STORAGE_BACKEND: str = "local"       # local | s3
    UPLOAD_DIR: str = "uploads"
    MAX_PHOTO_MB: int = 15
    MAX_VIDEO_MB: int = 200

    # --- Rate limiting (per IP, per bucket) ---
    RATE_LIMIT_AUTH_PER_MIN: int = 20
    RATE_LIMIT_CHAT_PER_MIN: int = 40
    RATE_LIMIT_UPLOAD_PER_MIN: int = 20

    # --- AI layer ---
    AI_PROVIDER: str = "stub"
    AI_MODEL_NAME: str = "forge-rules"
    AI_MODEL_VERSION: str = "0.1.0"
    GEMINI_API_KEY: str | None = None

    # --- Demo seed ---
    DEMO_USER_EMAIL: str = "demo@forgeai.dev"
    DEMO_USER_PASSWORD: str = "forgeai-demo"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.CORS_ORIGINS.strip()
        return ["*"] if raw == "*" else [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def sqlalchemy_connect_args(self) -> dict:
        # SQLite needs check_same_thread=False because FastAPI serves requests
        # from a threadpool; PostgreSQL needs no special args.
        if self.DATABASE_URL.startswith("sqlite"):
            return {"check_same_thread": False}
        return {}

    def validate_production_safety(self) -> None:
        """Refuse to boot in production with insecure defaults."""
        if self.ENV == "prod":
            if self.SECRET_KEY in ("", "change-me-to-a-long-random-string") or len(self.SECRET_KEY) < 32:
                raise RuntimeError("SECRET_KEY must be set to a strong random value in prod.")
            if self.CORS_ORIGINS.strip() == "*":
                raise RuntimeError("CORS_ORIGINS=* is not allowed in prod.")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
