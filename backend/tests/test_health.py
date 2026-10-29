import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.core.db import engine, get_session
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    """Verify that /healthz returns 200 OK with expected JSON structure."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data


@pytest.mark.asyncio
async def test_readiness_requires_a_working_database() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/readyz")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "version": "1.0.0"}


@pytest.mark.asyncio
async def test_readiness_returns_a_redacted_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable() -> None:
        raise OperationalError("SELECT 1", {}, Exception("private-connection-details"))

    monkeypatch.setattr(engine, "connect", unavailable)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "DATABASE_UNAVAILABLE"
    assert "private-connection-details" not in response.text


@pytest.mark.asyncio
async def test_unexpected_errors_return_structured_redacted_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken_session() -> None:
        raise RuntimeError("synthetic-private-connection-data")

    monkeypatch.setitem(app.dependency_overrides, get_session, broken_session)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/trips")
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "INTERNAL_ERROR"
    assert response.headers["x-request-id"] == response.json()["detail"]["request_id"]
    assert "synthetic-private-connection-data" not in response.text
