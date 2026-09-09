"""
Pytest configuration and test database initialization fixture.
"""

import pytest

from app.core.db import init_db


@pytest.fixture(autouse=True, scope="session")
def initialize_database():
    """Ensure all SQLModel tables are created before running tests."""
    init_db()
