"""
Integration tests for expense logging and greedy settle-up algorithm.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.support import join_guest, register_creator


@pytest.mark.asyncio
async def test_expense_settle_up_flow():
    """Verify adding expenses, computing balances, and greedy settle-up transfers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        creator_id = await register_creator(client)
        # Create trip with 3 members
        trip_res = await client.post(
            "/api/v1/trips",
            json={
                "title": "Expense Test Trip",
                "destination": "Lisbon",
                "start_date": "2026-10-01",
                "end_date": "2026-10-02",
                "creator_id": creator_id,
            },
        )
        trip_id = trip_res.json()["id"]

        # Add bob and charlie through signed guest sessions
        bob_id, bob_headers = await join_guest(client, trip_id, "Bob")
        charlie_id, charlie_headers = await join_guest(client, trip_id, "Charlie")
        await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": bob_id, "budget_per_day": 80.0},
            headers=bob_headers,
        )
        await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": charlie_id, "budget_per_day": 80.0},
            headers=charlie_headers,
        )

        # Expense 1: Alice pays $90 for dinner split between alice, bob, charlie ($30 each)
        await client.post(
            f"/api/v1/trips/{trip_id}/expenses",
            json={
                "paid_by": creator_id,
                "amount": 90.0,
                "description": "Welcome Dinner",
                "category": "food",
                "split_between": [creator_id, bob_id, charlie_id],
            },
        )

        # Expense 2: Bob pays $30 for transit split between bob and charlie ($15 each)
        exp2_res = await client.post(
            f"/api/v1/trips/{trip_id}/expenses",
            json={
                "paid_by": bob_id,
                "amount": 30.0,
                "description": "Transit pass",
                "category": "transit",
                "split_between": [bob_id, charlie_id],
            },
        )
        exp2_id = exp2_res.json()["id"]

        remove_payer = await client.put(
            f"/api/v1/trips/{trip_id}",
            json={"member_ids": [creator_id, charlie_id]},
        )
        assert remove_payer.status_code == 409
        assert remove_payer.json()["detail"]["code"] == "MEMBER_HAS_EXPENSES"

        duplicate_split = await client.post(
            f"/api/v1/trips/{trip_id}/expenses",
            json={
                "paid_by": creator_id,
                "amount": 20.0,
                "description": "Invalid duplicate split",
                "split_between": [bob_id, bob_id],
            },
        )
        assert duplicate_split.status_code == 400
        assert duplicate_split.json()["detail"]["code"] == "INVALID_SPLIT"
        empty_split_update = await client.put(
            f"/api/v1/trips/{trip_id}/expenses/{exp2_id}",
            json={"split_between": []},
        )
        assert empty_split_update.status_code == 400

        # Edit expense 2 to test "allow all the edit"
        await client.put(
            f"/api/v1/trips/{trip_id}/expenses/{exp2_id}",
            json={"amount": 40.0},
        )

        # Get settle-up report
        settle_res = await client.get(f"/api/v1/trips/{trip_id}/expenses/settle-up")
        assert settle_res.status_code == 200
        report = settle_res.json()

        assert "user_balances" in report
        assert "transfers" in report
        assert len(report["user_balances"]) >= 3

        # Net balance sum should equal approximately 0
        net_sum = sum(b["net_balance"] for b in report["user_balances"])
        assert abs(net_sum) < 0.05
