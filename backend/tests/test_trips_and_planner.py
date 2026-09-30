"""
Integration tests for trips, constraint solver, strict agent planning loop, and rebalancing.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.support import join_guest, register_creator


@pytest.mark.asyncio
async def test_full_trip_and_planning_lifecycle():
    """Verify trip creation, constraints submission, strict planning loop, editing, and rebalancing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        creator_id = await register_creator(client)
        # 1. Create a trip
        trip_payload = {
            "title": "Lisbon Culinary & Culture Escape",
            "destination": "Lisbon, Portugal",
            "start_date": "2026-10-01",
            "end_date": "2026-10-03",
            "creator_id": creator_id,
        }
        trip_res = await client.post("/api/v1/trips", json=trip_payload)
        assert trip_res.status_code == 201
        trip = trip_res.json()
        trip_id = trip["id"]
        assert trip["destination"] == "Lisbon, Portugal"
        assert trip["status"] == "collecting_constraints"

        # 2. Update trip (always allow all the edit)
        update_res = await client.put(
            f"/api/v1/trips/{trip_id}",
            json={"title": "Updated Lisbon Expedition"},
        )
        assert update_res.status_code == 200
        assert update_res.json()["title"] == "Updated Lisbon Expedition"

        # 3. Submit constraints for 2 members (Alice and Bob)
        bob_id, bob_headers = await join_guest(client, trip_id, "Bob")
        alice_c = {
            "user_id": creator_id,
            "budget_per_day": 60.0,
            "dietary": ["vegetarian"],
            "style_tags": ["foodie", "relaxed"],
            "must_see": ["Jerónimos Monastery"],
            "must_avoid": [],
        }
        bob_c = {
            "user_id": bob_id,
            "budget_per_day": 90.0,
            "dietary": [],
            "style_tags": ["historic"],
            "must_see": ["Belém Tower"],
            "must_avoid": ["nightclub"],
        }
        res_a = await client.post(f"/api/v1/trips/{trip_id}/constraints", json=alice_c)
        res_b = await client.post(
            f"/api/v1/trips/{trip_id}/constraints", json=bob_c, headers=bob_headers
        )
        assert res_a.status_code == 200
        assert res_b.status_code == 200

        # Verify constraints listed
        list_c = await client.get(f"/api/v1/trips/{trip_id}/constraints")
        assert list_c.status_code == 200
        assert len(list_c.json()) == 2

        # 4. Trigger Agent Planning Loop (Strict Loop)
        plan_res = await client.post(f"/api/v1/trips/{trip_id}/plan")
        assert plan_res.status_code == 200
        plan = plan_res.json()
        assert plan["trip_id"] == trip_id
        assert plan["version"] == 1
        assert len(plan["days"]) == 3
        assert len(plan["notes"]) > 0

        missing_venue = await client.post(
            f"/api/v1/trips/{trip_id}/rebalance",
            json={"type": "venue_closed", "day_index": 0},
        )
        assert missing_venue.status_code == 400
        assert missing_venue.json()["detail"]["code"] == "VENUE_NOT_IN_PLAN"
        unsupported_weather = await client.post(
            f"/api/v1/trips/{trip_id}/rebalance",
            json={"type": "weather_alert", "day_index": 0},
        )
        assert unsupported_weather.status_code == 422

        # 5. Validate the plan
        val_res = await client.post(f"/api/v1/trips/{trip_id}/plan/validate")
        assert val_res.status_code == 200
        val_data = val_res.json()
        assert "is_valid" in val_data

        # 6. Add custom plan item (Always allow all the edit)
        first_item = plan["days"][0]["items"][0]
        custom_item = {
            "day_index": 0,
            "place_name": "Sunset Viewpoint Drink",
            "category": "bar",
            "start_time": "2026-10-01T21:30:00",
            "end_time": "2026-10-01T22:30:00",
            "cost": 15.0,
            "lat": 38.71,
            "lng": -9.13,
        }
        add_res = await client.post(
            f"/api/v1/trips/{trip_id}/plan/items", json=custom_item
        )
        assert add_res.status_code == 200
        after_add = (await client.get(f"/api/v1/trips/{trip_id}/plan")).json()
        assert after_add["version"] == 2
        assert (
            await client.get(f"/api/v1/trips/{trip_id}/plan?version=1")
        ).json() == plan
        current_first = next(
            item
            for day in after_add["days"]
            for item in day["items"]
            if item["place_id"] == first_item["place_id"]
        )

        # Edit existing item (Always allow all the edit)
        edit_res = await client.put(
            f"/api/v1/trips/{trip_id}/plan/items/{current_first['id']}",
            json={"cost": 0.0, "place_name": "Free Morning Walk"},
        )
        assert edit_res.status_code == 200
        assert edit_res.json()["cost"] == 0.0
        after_edit = (await client.get(f"/api/v1/trips/{trip_id}/plan")).json()
        assert after_edit["version"] == 3
        assert (
            await client.get(f"/api/v1/trips/{trip_id}/plan?version=1")
        ).json() == plan

        # Delete the added item
        current_added = next(
            item
            for day in after_edit["days"]
            for item in day["items"]
            if item["place_id"] == add_res.json()["place_id"]
        )
        del_res = await client.delete(
            f"/api/v1/trips/{trip_id}/plan/items/{current_added['id']}"
        )
        assert del_res.status_code == 204
        assert (await client.get(f"/api/v1/trips/{trip_id}/plan")).json()[
            "version"
        ] == 4

        # 7. Simulate Disruption and Trigger Dynamic Rebalancer
        disruption_payload = {
            "type": "venue_closed",
            "day_index": 0,
            "place_id": edit_res.json()["place_id"],
            "description": "Unscheduled restoration closure",
        }
        reb_res = await client.post(
            f"/api/v1/trips/{trip_id}/rebalance", json=disruption_payload
        )
        assert reb_res.status_code == 200
        new_plan = reb_res.json()
        assert new_plan["version"] == 5
        assert len(new_plan["days"]) == 3
