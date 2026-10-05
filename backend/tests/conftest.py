import os

import pytest

from app.core.config import settings
from app.core.db import init_db


@pytest.fixture(autouse=True, scope="session")
def initialize_database():
    """Ensure all SQLModel tables are created before running tests."""
    init_db()


@pytest.fixture(autouse=True)
def disable_external_apis_in_tests(monkeypatch):
    """
    Ensure unit and integration tests run deterministically using the built-in
    heuristic proposer without slow external network timeouts, unless
    RUN_LIVE_LLM_TESTS=1 is explicitly set.
    """
    if os.environ.get("RUN_LIVE_LLM_TESTS") != "1":
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
