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


@pytest.mark.asyncio
async def test_ask_agent_siem_reap_recommends_temples(monkeypatch):
    """When user asks for other temples in Siem Reap, agent recommends Bayon, Ta Prohm, etc."""
    monkeypatch.setattr(proposer.settings, "GEMINI_API_KEY", "")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        trip_res = await client.post(
            "/api/v1/trips",
            json={
                "title": "Cambodia Adventure",
                "destination": "Siem Reap",
                "start_date": "2026-11-01",
                "end_date": "2026-11-04",
                "creator_id": "creator_sr",
            },
        )
        assert trip_res.status_code == 201
        trip_id = trip_res.json()["id"]

        # User sets Angkor Wat as must-see
        await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={
                "user_id": "creator_sr",
                "budget_per_day": 80.0,
                "must_see": ["Angkor Wat"],
                "must_avoid": [],
            },
        )

        # Ask to recommend other temples
        ask_res = await client.post(
            f"/api/v1/trips/{trip_id}/plan/ask",
            json={
                "question": "Can you recommend other temples to visit besides Angkor Wat?"
            },
        )
        assert ask_res.status_code == 200
        answer = ask_res.json()["answer"]
        # Must recommend additional temples and NOT refuse
        assert any(
            t in answer for t in ("Bayon", "Ta Prohm", "Preah Khan", "Banteay Srei")
        )
        assert "refuse" not in answer.lower()
        assert "cannot" not in answer.lower()


@pytest.mark.asyncio
async def test_siem_reap_catalog_realistic_pricing():
    """Verify that Siem Reap venues have realistic pricing instead of a flat $25."""
    from app.services.places_service import DESTINATION_CATALOG

    assert "siem reap" in DESTINATION_CATALOG
    sr_places = DESTINATION_CATALOG["siem reap"]
    names_to_cost = {p["name"]: p["est_cost"] for p in sr_places}

    # Angkor pass covers temples at $37 (not $25 flat)
    assert names_to_cost["Angkor Wat"] == 37.0
    assert names_to_cost["Bayon Temple"] == 37.0
    assert names_to_cost["Ta Prohm Temple"] == 37.0
    # Outdoor South Gate is free
    assert names_to_cost["Angkor Thom & South Gate"] == 0.0
    # Local restaurant Khmer Kitchen is $12 (not $25)
    assert names_to_cost["Khmer Kitchen Restaurant"] == 12.0
    # Pub Street is $8 (not $25)
    assert names_to_cost["Pub Street Night Market"] == 8.0
    # Phare circus is $18 (not $25)
    assert names_to_cost["Phare Circus"] == 18.0
