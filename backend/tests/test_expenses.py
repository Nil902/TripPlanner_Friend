"""
Integration tests for expense logging and greedy settle-up algorithm.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_expense_settle_up_flow():
    """Verify adding expenses, computing balances, and greedy settle-up transfers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create trip with 3 members
        trip_res = await client.post(
            "/api/v1/trips",
            json={
                "title": "Expense Test Trip",
                "destination": "Lisbon",
                "start_date": "2026-10-01",
                "end_date": "2026-10-02",
                "creator_id": "alice",
            },
        )
        trip_id = trip_res.json()["id"]

        # Add bob and charlie via constraints
        await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": "bob", "budget_per_day": 80.0},
        )
        await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": "charlie", "budget_per_day": 80.0},
        )

        # Expense 1: Alice pays $90 for dinner split between alice, bob, charlie ($30 each)
        await client.post(
            f"/api/v1/trips/{trip_id}/expenses",
            json={
                "paid_by": "alice",
                "amount": 90.0,
                "description": "Welcome Dinner",
                "category": "food",
                "split_between": ["alice", "bob", "charlie"],
            },
        )

        # Expense 2: Bob pays $30 for transit split between bob and charlie ($15 each)
        exp2_res = await client.post(
            f"/api/v1/trips/{trip_id}/expenses",
            json={
                "paid_by": "bob",
                "amount": 30.0,
                "description": "Transit pass",
                "category": "transit",
                "split_between": ["bob", "charlie"],
            },
        )
        exp2_id = exp2_res.json()["id"]

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
