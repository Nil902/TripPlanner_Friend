"""
Integration tests for natural-language plan refinement and RFC 5545 iCalendar export.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_refine_plan_and_version_bump():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a trip
        trip_resp = await client.post(
            "/api/v1/trips",
            json={
                "title": "Lisbon Refinement Trip",
                "destination": "Lisbon",
                "start_date": "2026-06-01",
                "end_date": "2026-06-03",
                "creator_id": "creator_refine_test",
            },
        )
        assert trip_resp.status_code == 201
        trip_id = trip_resp.json()["id"]

        # 2. Add member constraint
        await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={
                "user_id": "creator_refine_test",
                "budget_per_day": 80.0,
                "dietary": ["vegetarian"],
                "style_tags": ["relaxed", "foodie"],
                "must_see": ["Pastéis de Belém"],
            },
        )

        # 3. Generate initial plan (v1)
        plan_resp = await client.post(f"/api/v1/trips/{trip_id}/plan")
        assert plan_resp.status_code == 200
        plan_v1 = plan_resp.json()
        assert plan_v1["version"] == 1
        assert len(plan_v1["days"]) == 3

        # 4. Refine plan: "Make day 2 more relaxed"
        refine_resp = await client.post(
            f"/api/v1/trips/{trip_id}/plan/refine",
            json={
                "instruction": "Make Day 2 more relaxed with fewer activities",
                "user_id": "creator_refine_test",
            },
        )
        assert refine_resp.status_code == 200
        plan_v2 = refine_resp.json()
        assert plan_v2["version"] == 2
        # Verify that Day 2 was adjusted and notes contain user request
        assert any("relaxed" in note.lower() for note in plan_v2["notes"])

        # 5. Fetch v1 and v2 via version query param to verify history preservation
        v1_check = await client.get(f"/api/v1/trips/{trip_id}/plan?version=1")
        assert v1_check.status_code == 200
        assert v1_check.json()["version"] == 1

        v2_check = await client.get(f"/api/v1/trips/{trip_id}/plan?version=2")
        assert v2_check.status_code == 200
        assert v2_check.json()["version"] == 2

        # 6. Test iCalendar export (.ics)
        ics_resp = await client.get(f"/api/v1/trips/{trip_id}/plan/export.ics")
        assert ics_resp.status_code == 200
        assert "text/calendar" in ics_resp.headers["content-type"]
        ics_text = ics_resp.text
        assert "BEGIN:VCALENDAR" in ics_text
        assert "VERSION:2.0" in ics_text
        assert "BEGIN:VEVENT" in ics_text
        assert "SUMMARY:" in ics_text
        assert "DTSTART:" in ics_text
        assert "DTEND:" in ics_text
        assert "END:VCALENDAR" in ics_text

        # 7. Test refining with entertainment / nightlife request
        refine_ent_resp = await client.post(
            f"/api/v1/trips/{trip_id}/plan/refine",
            json={
                "instruction": "Add a nightlife stop or entertainment in the evening on Day 1",
                "user_id": "creator_refine_test",
            },
        )
        assert refine_ent_resp.status_code == 200
        plan_v3 = refine_ent_resp.json()
        assert plan_v3["version"] == 3
        assert any(
            "venue" in note.lower()
            or "nightlife" in note.lower()
            or "entertainment" in note.lower()
            for note in plan_v3["notes"]
        )


@pytest.mark.asyncio
async def test_manual_add_item_without_prior_plan():
    """Test 'Plan it yourself': adding a stop directly creates plan v1 and sets trip to PLANNED."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create trip
        trip_resp = await client.post(
            "/api/v1/trips",
            json={
                "title": "Manual Planning Trip",
                "destination": "Lisbon",
                "start_date": "2026-07-10",
                "end_date": "2026-07-12",
                "creator_id": "manual_user_1",
            },
        )
        assert trip_resp.status_code == 201
        trip_id = trip_resp.json()["id"]

        # Directly add a manual stop without calling /plan (AI generator)
        item_resp = await client.post(
            f"/api/v1/trips/{trip_id}/plan/items",
            json={
                "day_index": 0,
                "place_name": "Calouste Gulbenkian Museum",
                "category": "Museum",
                "start_time": "2026-07-10T14:00:00",
                "end_time": "2026-07-10T16:30:00",
                "cost": 10.0,
            },
        )
        assert item_resp.status_code == 200
        item = item_resp.json()
        assert item["place"]["name"] == "Calouste Gulbenkian Museum"
        assert item["cost"] == 10.0

        # Verify plan was created and can be fetched
        get_plan_resp = await client.get(f"/api/v1/trips/{trip_id}/plan")
        assert get_plan_resp.status_code == 200
        plan = get_plan_resp.json()
        assert plan["version"] == 1
        assert len(plan["days"]) == 3
        assert len(plan["days"][0]["items"]) == 1
        assert (
            plan["days"][0]["items"][0]["place"]["name"] == "Calouste Gulbenkian Museum"
        )
