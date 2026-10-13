"""
Pytest configuration and test database initialization fixture.
"""

import os
from collections.abc import Generator
from tempfile import TemporaryDirectory

import pytest
from sqlmodel import SQLModel

# Set test-only configuration BEFORE importing any application modules. Tests
# also import the engine directly, so overriding get_session alone is insufficient.
_test_directory = TemporaryDirectory(prefix="travel-planner-tests-")
os.environ.update(
    PROJECT_NAME="Autonomous Travel & Group Itinerary Coordinator",
    DATABASE_URL=f"sqlite:///{_test_directory.name}/test.db",
    SECRET_KEY="test-only-key-never-use-in-a-deployment",
    GEMINI_API_KEY="",
    GOOGLE_MAPS_API_KEY="",
    OPENAI_API_KEY="",
    ADMIN_EMAIL="admin@antigravity.travel",
    ADMIN_PASSWORD="admin12345",
    REDIS_URL="",
)

from app.core.db import engine, init_db  # noqa: E402


@pytest.fixture(autouse=True, scope="session")
def initialize_database() -> Generator[None, None, None]:
    """Create a disposable database and release it after the entire suite."""
    init_db()
    yield
    engine.dispose()
    _test_directory.cleanup()


@pytest.fixture(autouse=True)
def isolate_database() -> None:
    """Ensure individual tests do not depend on earlier test runs or modules."""
    assert str(engine.url) == f"sqlite:///{_test_directory.name}/test.db"
    SQLModel.metadata.drop_all(engine)
    init_db()
