"""
Unit and integration tests for platform administration endpoints.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, select

from app.core.db import engine, init_db
from app.core.security import hash_password
from app.main import app
from app.models.schema import Trip, TripStatus, User


@pytest.fixture(autouse=True)
def setup_database():
    init_db()
    with Session(engine) as session:
        admin_user = session.exec(
            select(User).where(User.email == "admin@antigravity.travel")
        ).first()
        if not admin_user:
            admin_user = User(
                email="admin@antigravity.travel",
                name="Platform Administrator",
                hashed_password=hash_password("admin12345"),
                is_admin=True,
            )
            session.add(admin_user)
            session.commit()


@pytest.mark.asyncio
async def test_admin_login_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/admin/login",
            json={"email": "admin@antigravity.travel", "password": "admin12345"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["is_admin"] is True


@pytest.mark.asyncio
async def test_admin_login_rejected_for_regular_user():
    # Create regular user
    regular_email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    with Session(engine) as session:
        user = User(
            email=regular_email,
            name="Regular User",
            hashed_password=hash_password("pass12345"),
            is_admin=False,
        )
        session.add(user)
        session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/admin/login",
            json={"email": regular_email, "password": "pass12345"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_admin_overview_and_trips():
    from datetime import date

    # Ensure a sample trip exists
    with Session(engine) as session:
        trip = session.exec(select(Trip)).first()
        if not trip:
            trip = Trip(
                title="Admin Overview Trip",
                destination="Lisbon",
                start_date=date(2026, 9, 10),
                end_date=date(2026, 9, 15),
                creator_id="creator-1",
                status=TripStatus.IN_PROGRESS,
                member_ids=["m1", "m2"],
            )
            session.add(trip)
            session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Admin login
        login_resp = await client.post(
            "/api/v1/admin/login",
            json={"email": "admin@antigravity.travel", "password": "admin12345"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Overview
        overview_resp = await client.get("/api/v1/admin/overview", headers=headers)
        assert overview_resp.status_code == 200
        overview = overview_resp.json()
        assert "metrics" in overview
        assert "summary" in overview
        assert all("API spend" not in metric["label"] for metric in overview["metrics"])

        # Trips list
        trips_resp = await client.get("/api/v1/admin/trips", headers=headers)
        assert trips_resp.status_code == 200
        trips = trips_resp.json()
        assert len(trips) >= 1

        # Patch trip status
        trip_id = trips[0]["id"]
        patch_resp = await client.patch(
            f"/api/v1/admin/trips/{trip_id}/status",
            headers=headers,
            json={"status": "closed"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_admin_system_health_and_usage():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/admin/login",
            json={"email": "admin@antigravity.travel", "password": "admin12345"},
        )
        token = login_resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # API Usage
        usage_resp = await client.get("/api/v1/admin/api-usage", headers=headers)
        assert usage_resp.status_code == 200
        assert usage_resp.json() == []

        # System Health
        health_resp = await client.get("/api/v1/admin/system-health", headers=headers)
        assert health_resp.status_code == 200
        assert any("Database" in node["name"] for node in health_resp.json())
        assert not any("Gateway" in node["name"] for node in health_resp.json())

        # Users list
        users_resp = await client.get("/api/v1/admin/users", headers=headers)
        assert users_resp.status_code == 200
        assert len(users_resp.json()) >= 1
