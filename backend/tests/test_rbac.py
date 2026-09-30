"""Authorization checks for creator, guest, and administrator trip access."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session

from app.core.db import engine
from app.core.security import hash_password
from app.main import app
from app.models.schema import TripMember, User
from tests.support import join_guest, register_creator


@pytest.mark.asyncio
async def test_creator_requires_signed_account_token():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        creator_id = await register_creator(client)
        creator_headers = {"Authorization": client.headers["Authorization"]}
        trip_response = await client.post(
            "/api/v1/trips",
            json={
                "title": "Creator Trip",
                "destination": "Lisbon",
                "start_date": "2026-11-01",
                "end_date": "2026-11-03",
                "creator_id": creator_id,
            },
        )
        assert trip_response.status_code == 201
        trip_id = trip_response.json()["id"]

        permission = await client.get(f"/api/v1/trips/{trip_id}/permissions")
        assert permission.json() == {
            "can_manage": True,
            "is_creator": True,
            "role": "creator",
        }

        anonymous_headers = {"Authorization": "", "X-User-Role": "creator"}
        anonymous_permission = await client.get(
            f"/api/v1/trips/{trip_id}/permissions", headers=anonymous_headers
        )
        assert anonymous_permission.status_code == 401
        anonymous_update = await client.put(
            f"/api/v1/trips/{trip_id}",
            json={"title": "Forged"},
            headers=anonymous_headers,
        )
        assert anonymous_update.status_code == 401
        anonymous_delete = await client.delete(
            f"/api/v1/trips/{trip_id}", headers=anonymous_headers
        )
        assert anonymous_delete.status_code == 401
        anonymous_plan = await client.post(
            f"/api/v1/trips/{trip_id}/plan", headers=anonymous_headers
        )
        assert anonymous_plan.status_code == 401

        update = await client.put(
            f"/api/v1/trips/{trip_id}", json={"title": "Updated Creator Trip"}
        )
        assert update.status_code == 200
        assert update.json()["title"] == "Updated Creator Trip"
        deletion = await client.delete(
            f"/api/v1/trips/{trip_id}", headers=creator_headers
        )
        assert deletion.status_code == 204


@pytest.mark.asyncio
async def test_guest_token_is_trip_scoped_and_cannot_impersonate_members():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        creator_id = await register_creator(client)

        async def create_trip(title: str) -> str:
            response = await client.post(
                "/api/v1/trips",
                json={
                    "title": title,
                    "destination": "Lisbon",
                    "start_date": "2026-12-01",
                    "end_date": "2026-12-03",
                    "creator_id": creator_id,
                },
            )
            assert response.status_code == 201
            return str(response.json()["id"])

        trip_id = await create_trip("First Trip")
        other_trip_id = await create_trip("Second Trip")

        fake_join = await client.post(
            f"/api/v1/trips/{trip_id}/join",
            json={"name": "Bob", "user_id": creator_id},
            headers={"Authorization": ""},
        )
        assert fake_join.status_code == 403

        guest_id, guest_headers = await join_guest(client, trip_id, "Bob")
        assert guest_id.startswith("guest_")
        members = await client.get(f"/api/v1/trips/{trip_id}/members")
        assert (
            next(member for member in members.json() if member["id"] == guest_id)[
                "name"
            ]
            == "Bob"
        )
        guest_permission = await client.get(
            f"/api/v1/trips/{trip_id}/permissions",
            headers={**guest_headers, "X-User-Role": "admin"},
        )
        assert guest_permission.json()["can_manage"] is False

        own_constraint = await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": guest_id, "budget_per_day": 80},
            headers=guest_headers,
        )
        assert own_constraint.status_code == 200
        impersonation = await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": creator_id, "budget_per_day": 1},
            headers=guest_headers,
        )
        assert impersonation.status_code == 403
        other_trip = await client.get(
            f"/api/v1/trips/{other_trip_id}", headers=guest_headers
        )
        assert other_trip.status_code == 403
        guest_plan = await client.post(
            f"/api/v1/trips/{trip_id}/plan", headers=guest_headers
        )
        assert guest_plan.status_code == 403
        guest_update = await client.put(
            f"/api/v1/trips/{trip_id}",
            json={"title": "Forged"},
            headers=guest_headers,
        )
        assert guest_update.status_code == 403

        remove_creator = await client.put(
            f"/api/v1/trips/{trip_id}", json={"member_ids": [guest_id]}
        )
        assert remove_creator.status_code == 400
        inject_member = await client.put(
            f"/api/v1/trips/{trip_id}",
            json={"member_ids": [creator_id, guest_id, "unknown-account"]},
        )
        assert inject_member.status_code == 400
        remove_guest = await client.put(
            f"/api/v1/trips/{trip_id}", json={"member_ids": [creator_id]}
        )
        assert remove_guest.status_code == 200
        assert (await client.get(f"/api/v1/trips/{trip_id}/constraints")).json() == []
        assert guest_id not in [
            member["id"]
            for member in (await client.get(f"/api/v1/trips/{trip_id}/members")).json()
        ]
        revoked = await client.get(f"/api/v1/trips/{trip_id}", headers=guest_headers)
        assert revoked.status_code == 403

        second_guest_id, _ = await join_guest(client, trip_id, "Another Guest")
        deletion = await client.delete(f"/api/v1/trips/{trip_id}")
        assert deletion.status_code == 204
        with Session(engine) as session:
            assert session.get(TripMember, (trip_id, second_guest_id)) is None


@pytest.mark.asyncio
async def test_admin_can_manage_other_trip():
    admin_email = f"admin_{uuid.uuid4().hex}@example.com"
    admin = User(
        email=admin_email,
        name="Administrator",
        hashed_password=hash_password("TestPassword123!"),
        is_admin=True,
    )
    with Session(engine) as session:
        session.add(admin)
        session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        creator_id = await register_creator(client)
        trip_response = await client.post(
            "/api/v1/trips",
            json={
                "title": "Admin Review Trip",
                "destination": "Lisbon",
                "start_date": "2026-11-01",
                "end_date": "2026-11-03",
                "creator_id": creator_id,
            },
        )
        trip_id = trip_response.json()["id"]
        admin_login = await client.post(
            "/api/v1/admin/login",
            json={"email": admin_email, "password": "TestPassword123!"},
        )
        assert admin_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['token']}"}
        permission = await client.get(
            f"/api/v1/trips/{trip_id}/permissions", headers=admin_headers
        )
        assert permission.json() == {
            "can_manage": True,
            "is_creator": False,
            "role": "admin",
        }
        update = await client.put(
            f"/api/v1/trips/{trip_id}",
            json={"title": "Moderated"},
            headers=admin_headers,
        )
        assert update.status_code == 200
        guest_id, _ = await join_guest(client, trip_id, "Admin Guest")
        deletion = await client.delete(
            f"/api/v1/admin/trips/{trip_id}", headers=admin_headers
        )
        assert deletion.status_code == 200
        with Session(engine) as session:
            assert session.get(TripMember, (trip_id, guest_id)) is None
