"""Production startup must reject unsafe configuration without printing secrets."""

import logging

import pytest
from pydantic import ValidationError

from app.core import security
from app.core.config import Settings
from app.core.logging import SecretRedactionFilter


def production_settings(**changes: object) -> Settings:
    values = {
        "ENVIRONMENT": "production",
        "DATABASE_URL": "postgresql://test.invalid/test",
        "SECRET_KEY": "test-only-persistent-signing-key-123456",
        "CORS_ORIGINS": "",
        "RATE_LIMIT_ENABLED": True,
        "ADMIN_EMAIL": "",
        "ADMIN_PASSWORD": "",
    }
    values.update(changes)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    "values",
    [
        {"SECRET_KEY": "short"},
        {"DATABASE_URL": "sqlite:///ephemeral.db"},
        {"CORS_ORIGINS": "*"},
        {"CORS_ORIGINS": "http://example.com"},
        {"RATE_LIMIT_ENABLED": False},
        {"MAX_PLANNER_ITERATIONS": 6},
        {"ADMIN_EMAIL": "admin@example.com"},
        {"ADMIN_EMAIL": "admin@example.com", "ADMIN_PASSWORD": "weak"},
    ],
)
def test_unsafe_production_configuration_fails(values: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        production_settings(**values)


def test_same_origin_production_and_exact_https_origins_are_valid() -> None:
    assert production_settings().cors_origins_list == []
    assert production_settings(
        CORS_ORIGINS="https://trips.example.com"
    ).cors_origins_list == ["https://trips.example.com"]


def test_configuration_errors_and_repr_hide_credentials() -> None:
    password = "synthetic-test-credential"
    with pytest.raises(ValidationError) as exc:
        production_settings(SECRET_KEY=password)
    assert password not in str(exc.value)
    assert "test-only-persistent-signing-key" not in repr(production_settings())


def test_tokens_expire_at_the_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security.time, "time", lambda: 1000)
    token = security.create_access_token("user-1")
    assert security.decode_access_token(token) == "user-1"
    monkeypatch.setattr(
        security.time,
        "time",
        lambda: 1000 + security.settings.TOKEN_EXPIRE_HOURS * 3600,
    )
    assert security.decode_access_token(token) is None


def test_http_log_redaction_removes_query_and_header_credentials() -> None:
    record = logging.LogRecord(
        "httpx",
        logging.INFO,
        "test",
        1,
        "GET %s header=%s",
        ("https://example.com/?key=unit-test-key&mode=transit", "synthetic-header-key"),
        None,
    )
    redaction = SecretRedactionFilter(["synthetic-header-key"])
    assert redaction.filter(record)
    message = record.getMessage()
    assert "unit-test-key" not in message
    assert "synthetic-header-key" not in message
    assert "mode=transit" in message
