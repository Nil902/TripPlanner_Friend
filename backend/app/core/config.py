"""
Application configuration using Pydantic Settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Autonomous Travel & Group Itinerary Coordinator"
    DATABASE_URL: str = "sqlite:///./travel_planner.db"
    SECRET_KEY: str = "dev-secret-key-change-in-production-token-secret"
    TOKEN_EXPIRE_HOURS: int = 72
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    )

    # External APIs (optional in dev, fallback to cached mock data)
    GOOGLE_MAPS_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    LLM_MODEL_NAME: str = "gemini-2.5-flash"
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
