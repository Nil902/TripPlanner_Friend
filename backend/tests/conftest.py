"""Run tests against disposable data without loading live service credentials."""

import os
from collections.abc import Generator
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

_test_directory = TemporaryDirectory(prefix="tripplanner-tests-")
os.environ.update(
    DATABASE_URL=f"sqlite:///{Path(_test_directory.name) / 'tests.db'}",
    SECRET_KEY="test-only-signing-key-never-use-in-production",
    ENVIRONMENT="test",
    GEMINI_API_KEY="",
    GOOGLE_MAPS_API_KEY="",
    OPENAI_API_KEY="",
    ADMIN_EMAIL="",
    ADMIN_PASSWORD="",
    REDIS_URL="",
)

from sqlmodel import SQLModel  # noqa: E402

from app.core.db import engine  # noqa: E402


@pytest.fixture(autouse=True, scope="session")
def disposable_database() -> Generator[None, None, None]:
    yield
    engine.dispose()
    _test_directory.cleanup()


@pytest.fixture(autouse=True)
def initialize_database(disposable_database: None) -> Generator[None, None, None]:
    """Each test starts with an empty database owned by this test run."""
    SQLModel.metadata.create_all(engine)
    yield
    SQLModel.metadata.drop_all(engine)
