"""
Integration tests for the ask-the-agent Q&A endpoint.

Uses the deterministic fallback response by stubbing out the Gemini API key.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import proposer


@pytest.mark.asyncio
async def test_ask_agent_returns_fallback_recommendation(monkeypatch):
    """Asking about popular places returns a useful deterministic answer."""
    monkeypatch.setattr(proposer.settings, "GEMINI_API_KEY", "")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        trip_res = await client.post(
            "/api/v1/trips",
            json={
                "title": "Lisbon Escape",
                "destination": "Lisbon, Portugal",
                "start_date": "2026-10-01",
                "end_date": "2026-10-03",
                "creator_id": "creator_1",
            },
        )
        assert trip_res.status_code == 201
        trip_id = trip_res.json()["id"]

        res = await client.post(
            f"/api/v1/trips/{trip_id}/plan/ask",
            json={"question": "Which places are the most popular to visit?"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["question"] == "Which places are the most popular to visit?"
        assert data["answer"].startswith("Here is a quick guide for Lisbon")
        assert "- " in data["answer"]  # bullet-pointed recommendations


@pytest.mark.asyncio
async def test_ask_agent_empty_question_rejected(monkeypatch):
    """Empty or whitespace-only questions are rejected with 400."""
    monkeypatch.setattr(proposer.settings, "GEMINI_API_KEY", "")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        trip_res = await client.post(
            "/api/v1/trips",
            json={
                "title": "Lisbon Escape",
                "destination": "Lisbon, Portugal",
                "start_date": "2026-10-01",
                "end_date": "2026-10-03",
                "creator_id": "creator_1",
            },
        )
        trip_id = trip_res.json()["id"]

        res = await client.post(
            f"/api/v1/trips/{trip_id}/plan/ask",
            json={"question": "   "},
        )
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_ask_agent_unknown_trip_returns_404(monkeypatch):
    monkeypatch.setattr(proposer.settings, "GEMINI_API_KEY", "")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/trips/does-not-exist/plan/ask",
            json={"question": "Best place?"},
        )
        assert res.status_code == 404
