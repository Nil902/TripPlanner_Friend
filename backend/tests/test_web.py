"""Exercise the same-origin production static server independently of the API."""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.web import mount_frontend


@pytest.fixture
def web_client(tmp_path: Path) -> TestClient:
    (tmp_path / "index.html").write_text("<html>Trip Planner</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-123.js").write_text("console.log('app')")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    mount_frontend(app, tmp_path)
    return TestClient(app)


def test_frontend_deep_links(web_client: TestClient) -> None:
    response = web_client.get("/room?trip=example")
    assert response.status_code == 200
    assert "Trip Planner" in response.text
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "path", ["/api/v1/missing", "/assets/missing.js", "/assets/missing", "/docs"]
)
def test_missing_api_and_assets_remain_404(web_client: TestClient, path: str) -> None:
    assert web_client.get(path).status_code == 404


def test_fingerprinted_assets_are_cached(web_client: TestClient) -> None:
    response = web_client.get("/assets/app-123.js")
    assert response.status_code == 200
    assert "immutable" in response.headers["cache-control"]


def test_missing_bundle_fails_before_serving(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="bundle is missing"):
        mount_frontend(FastAPI(), tmp_path)
