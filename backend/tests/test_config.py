"""Production startup checks for signing keys and CORS."""

import pytest

from app.core.config import Settings, validate_production_settings


def test_production_requires_unique_signing_key() -> None:
    config = Settings(
        _env_file=None,
        APP_ENV="production",
        SECRET_KEY="dev-secret-key-change-in-production-token-secret",
    )
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_production_settings(config)


def test_production_rejects_wildcard_cors() -> None:
    config = Settings(
        _env_file=None,
        APP_ENV="production",
        SECRET_KEY="a" * 64,
        CORS_ORIGINS="*",
    )
    with pytest.raises(RuntimeError, match="Wildcard CORS"):
        validate_production_settings(config)


def test_production_accepts_explicit_key_and_origin() -> None:
    config = Settings(
        _env_file=None,
        APP_ENV="production",
        SECRET_KEY="a" * 64,
        CORS_ORIGINS="https://travel.example.com",
    )
    validate_production_settings(config)
