"""Verify upgrades on disposable databases, without touching application data."""

from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command
from app.core.config import settings


def test_migrations_create_the_current_schema(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_url = f"sqlite:///{tmp_path / 'migrations%test.db'}"
    monkeypatch.setattr(settings, "DATABASE_URL", database_url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    command.upgrade(config, "head")  # Repeated startups must be harmless.
    command.check(config)
    engine = create_engine(database_url)
    try:
        columns = {column["name"] for column in inspect(engine).get_columns("users")}
        assert "is_admin" in columns
        assert "plans" in inspect(engine).get_table_names()
    finally:
        engine.dispose()
