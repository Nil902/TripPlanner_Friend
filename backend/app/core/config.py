"""
Application configuration using Pydantic Settings.
"""

import logging
import secrets
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    PROJECT_NAME: str = "Autonomous Travel & Group Itinerary Coordinator"
    DATABASE_URL: str = Field(default="sqlite:///./travel_planner.db", repr=False)
    SECRET_KEY: str = Field(default="", repr=False)
    TOKEN_EXPIRE_HOURS: int = Field(default=72, ge=1, le=720)
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    )

    # External APIs (optional in dev, fallback to cached mock data)
    GOOGLE_MAPS_API_KEY: str = Field(default="", repr=False)
    GEMINI_API_KEY: str = Field(default="", repr=False)
    OPENAI_API_KEY: str = Field(default="", repr=False)
    REDIS_URL: str = "redis://localhost:6379/0"
    LLM_MODEL_NAME: str = "gemini-3.1-flash-lite"
    MAX_PLANNER_ITERATIONS: int = Field(default=5, ge=1, le=5)
    RATE_LIMIT_ENABLED: bool = True

    # Default platform admin account (seeded on first startup)
    # Leave both empty to skip seeding — recommended for production unless
    # you explicitly want an admin account bootstrapped.
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = Field(default="", repr=False)

    @model_validator(mode="after")
    def validate_production(self) -> Self:
        if self.ENVIRONMENT == "production":
            if len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "Production requires a persistent SECRET_KEY of at least 32 characters."
                )
            if not self.DATABASE_URL.startswith(
                ("postgresql://", "postgresql+psycopg2://")
            ):
                raise ValueError("Production requires persistent PostgreSQL storage.")
            if any(
                "*" in origin or not origin.startswith("https://")
                for origin in self.cors_origins_list
            ):
                raise ValueError(
                    "Production CORS origins must be explicit HTTPS origins; leave empty for same-origin hosting."
                )
            if not self.RATE_LIMIT_ENABLED:
                raise ValueError("Rate limiting must remain enabled in production.")
            if bool(self.ADMIN_EMAIL.strip()) != bool(self.ADMIN_PASSWORD):
                raise ValueError(
                    "Set both admin bootstrap credentials or leave both empty."
                )
            if self.ADMIN_PASSWORD and len(self.ADMIN_PASSWORD) < 16:
                raise ValueError(
                    "Use an admin bootstrap password of at least 16 characters."
                )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()
        ]

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        extra="ignore",
        hide_input_in_errors=True,
    )


settings = Settings()

if not settings.SECRET_KEY:
    if (
        settings.DATABASE_URL.startswith("sqlite")
        and "travel_planner.db" in settings.DATABASE_URL
    ):
        # Dev mode: auto-generate a temporary key for local SQLite usage
        settings.SECRET_KEY = secrets.token_hex(32)
        logger.warning(
            "SECRET_KEY not set. Using auto-generated ephemeral key. "
            "Sessions will NOT persist across restarts. Set SECRET_KEY in .env for production."
        )
    else:
        # Production-like database without SECRET_KEY is a hard error
        logger.critical(
            "SECRET_KEY is required when using a non-local database. "
            "Set SECRET_KEY in your .env file."
        )
        raise RuntimeError(
            "SECRET_KEY is required when using a non-local database. "
            "Set SECRET_KEY in your .env file."
        )
