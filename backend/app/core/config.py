"""
Application configuration using Pydantic Settings.
"""

import logging
import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    PROJECT_NAME: str = "Autonomous Travel & Group Itinerary Coordinator"
    DATABASE_URL: str = "sqlite:///./travel_planner.db"
    SECRET_KEY: str = ""
    TOKEN_EXPIRE_HOURS: int = 72
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    )

    # External APIs (optional in dev, fallback to cached mock data)
    GOOGLE_MAPS_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    LLM_MODEL_NAME: str = "gemini-3.6-flash"
    MAX_PLANNER_ITERATIONS: int = 5

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()
        ]

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        extra="ignore",
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
