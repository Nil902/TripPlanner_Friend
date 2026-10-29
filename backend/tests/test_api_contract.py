"""Keep the shared OpenAPI document consistent with the running application."""

from pathlib import Path

import pytest
import yaml

from app.main import app


def test_shared_contract_matches_routes_and_schemas() -> None:
    path = Path(__file__).resolve().parents[2] / "packages/shared/openapi.yaml"
    shared = yaml.safe_load(path.read_text())
    actual = app.openapi()
    assert shared["paths"].keys() == actual["paths"].keys()
    for path in actual["paths"]:
        if shared["paths"][path] != actual["paths"][path]:
            pytest.fail(f"Shared OpenAPI contract differs at path {path}")
    assert shared["components"].keys() == actual["components"].keys()
    for component in actual["components"]:
        if shared["components"][component] != actual["components"][component]:
            pytest.fail(f"Shared OpenAPI contract differs in {component}")
