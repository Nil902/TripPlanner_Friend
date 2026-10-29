"""Regression coverage for anonymous access, impersonation and trip boundaries."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session

from app.core.db import engine
from app.main import app
from app.models.schema import Place, TripGuest
from tests.factories import account_headers, join_member, new_trip


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,suffix,body",
    [
        ("GET", "", None),
        ("GET", "/members", None),
        ("GET", "/permissions", None),
        ("PUT", "", {"title": "Stolen"}),
        ("DELETE", "", None),
        ("GET", "/constraints", None),
        ("POST", "/constraints", {}),
        ("GET", "/plan", None),
        ("GET", "/plan/versions", None),
        ("GET", "/plan/export.ics", None),
        ("POST", "/plan", {}),
        ("POST", "/plan/ask", {"question": "Best place?"}),
        ("POST", "/plan/refine", {"instruction": "Change everything"}),
        ("POST", "/rebalance", {}),
        ("POST", "/plan/items", {}),
        ("PUT", "/plan/items/missing", {}),
        ("DELETE", "/plan/items/missing", None),
        ("GET", "/expenses", None),
        ("POST", "/expenses", {}),
        ("GET", "/expenses/settle-up", None),
        ("PUT", "/expenses/missing", {}),
        ("DELETE", "/expenses/missing", None),
    ],
)
async def test_trip_routes_require_verified_credentials(
    method: str, suffix: str, body: dict | None
) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        trip = await new_trip(client)
        response = await client.request(
            method, f"/api/v1/trips/{trip['id']}{suffix}", json=body
        )
        assert response.status_code == 401, response.text
        assert response.json()["detail"]["code"] in {"UNAUTHORIZED", "INVALID_TOKEN"}


@pytest.mark.asyncio
async def test_trip_creation_and_listing_use_the_authenticated_account() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        alice = await new_trip(client, "alice")
        bob = await new_trip(client, "bob")
        assert (await client.get("/api/v1/trips")).status_code == 401
        assert (await client.post("/api/v1/trips", json={})).status_code == 401
        listed = await client.get("/api/v1/trips", headers=account_headers("alice"))
        assert [t["id"] for t in listed.json()] == [alice["id"]]
        assert (
            await client.get(
                f"/api/v1/trips/{alice['id']}", headers=account_headers("bob")
            )
        ).status_code == 403
        forged = await client.post(
            "/api/v1/trips",
            headers=account_headers("bob"),
            json={
                "title": "Forged",
                "destination": "Lisbon",
                "start_date": "2026-11-01",
                "end_date": "2026-11-03",
                "creator_id": "alice",
            },
        )
        assert forged.status_code == 403
        await join_member(client, alice["id"], "bob")
        listed = await client.get("/api/v1/trips", headers=account_headers("bob"))
        assert {t["id"] for t in listed.json()} == {alice["id"], bob["id"]}


@pytest.mark.asyncio
async def test_invited_guests_receive_a_scoped_identity_and_cannot_impersonate_creators() -> (
    None
):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        trip = await new_trip(client)
        second_trip = await new_trip(client, "bob")
        joined = await client.post(
            f"/api/v1/trips/{trip['id']}/join",
            json={"name": "Guest Alice", "user_id": "alice"},
        )
        assert joined.status_code == 200
        guest = joined.json()
        assert guest["id"] != "alice"
        assert guest["role"] == "joiner"
        headers = {"Authorization": f"Bearer {guest['session_token']}"}
        assert (
            await client.get(f"/api/v1/trips/{trip['id']}", headers=headers)
        ).status_code == 200
        assert (
            await client.get(f"/api/v1/trips/{second_trip['id']}", headers=headers)
        ).status_code == 403
        permissions = await client.get(
            f"/api/v1/trips/{trip['id']}/permissions?user_id=alice",
            headers={**headers, "X-User-Role": "admin"},
        )
        assert permissions.json() == {
            "can_manage": False,
            "is_creator": False,
            "role": "joiner",
        }
        assert (
            await client.get(
                f"/api/v1/trips/{trip['id']}/permissions?user_id=alice",
                headers={"X-User-Role": "creator"},
            )
        ).status_code == 401
        for suffix, body in [
            ("", {"title": "Stolen"}),
            ("/plan", {}),
            ("/plan/refine", {}),
            ("/rebalance", {}),
        ]:
            method = "PUT" if suffix == "" else "POST"
            assert (
                await client.request(
                    method,
                    f"/api/v1/trips/{trip['id']}{suffix}",
                    headers=headers,
                    json=body,
                )
            ).status_code == 403
        assert (
            await client.delete(f"/api/v1/trips/{trip['id']}", headers=headers)
        ).status_code == 403
        assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
        members = await client.get(
            f"/api/v1/trips/{trip['id']}/members", headers=headers
        )
        assert (
            next(m["name"] for m in members.json() if m["id"] == guest["id"])
            == "Guest Alice"
        )
        assert all(m.get("session_token") is None for m in members.json())
        forged_preferences = await client.post(
            f"/api/v1/trips/{trip['id']}/constraints",
            headers=headers,
            json={"user_id": "alice", "budget_per_day": 75},
        )
        assert forged_preferences.status_code == 403
        saved = await client.post(
            f"/api/v1/trips/{trip['id']}/constraints",
            headers=headers,
            json={"user_id": guest["id"], "budget_per_day": 75},
        )
        assert saved.status_code == 200
        assert (
            await client.delete(
                f"/api/v1/trips/{trip['id']}", headers=account_headers()
            )
        ).status_code == 204
        with Session(engine) as session:
            assert session.get(TripGuest, guest["id"]) is None


@pytest.mark.asyncio
async def test_verified_admin_can_manage_another_creators_trip() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        trip = await new_trip(client)
        admin = account_headers("admin", admin=True)
        response = await client.get(
            f"/api/v1/trips/{trip['id']}/permissions", headers=admin
        )
        assert response.json() == {
            "can_manage": True,
            "is_creator": False,
            "role": "admin",
        }
        assert (
            await client.put(
                f"/api/v1/trips/{trip['id']}", headers=admin, json={"title": "Reviewed"}
            )
        ).status_code == 200
        assert (
            await client.delete(f"/api/v1/trips/{trip['id']}", headers=admin)
        ).status_code == 204


@pytest.mark.asyncio
async def test_cross_trip_stop_edits_and_shared_catalog_mutations_are_blocked() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        first = await new_trip(client)
        second = await new_trip(client)
        headers = account_headers()
        plan = (
            await client.post(f"/api/v1/trips/{first['id']}/plan", headers=headers)
        ).json()
        item = plan["days"][0]["items"][0]
        foreign_url = f"/api/v1/trips/{second['id']}/plan/items/{item['id']}"
        assert (
            await client.put(foreign_url, headers=headers, json={"cost": 999})
        ).status_code == 404
        assert (await client.delete(foreign_url, headers=headers)).status_code == 404
        own_url = f"/api/v1/trips/{first['id']}/plan/items/{item['id']}"
        response = await client.put(
            own_url,
            headers=headers,
            json={"place_name": "Private custom stop", "cost": 3},
        )
        assert response.status_code == 200
        assert response.json()["place_id"] != item["place_id"]
        with Session(engine) as session:
            original = session.get(Place, item["place_id"])
            assert original is not None
            assert original.name == item["place"]["name"]
        assert (
            await client.post(f"/api/v1/trips/{first['id']}/plan", headers=headers)
        ).status_code == 200
        assert (
            await client.put(own_url, headers=headers, json={"cost": 99})
        ).status_code == 409


@pytest.mark.asyncio
async def test_members_cannot_overwrite_another_members_preferences_or_expenses() -> (
    None
):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        trip = await new_trip(client)
        bob = await join_member(client, trip["id"], "bob")
        endpoint = f"/api/v1/trips/{trip['id']}"
        assert (
            await client.post(
                endpoint + "/constraints",
                headers=bob,
                json={"user_id": "alice", "budget_per_day": 1},
            )
        ).status_code == 403
        expense = (
            await client.post(
                endpoint + "/expenses",
                headers=account_headers(),
                json={
                    "paid_by": "alice",
                    "amount": 25,
                    "description": "Lunch",
                    "split_between": ["alice", "bob"],
                },
            )
        ).json()
        assert (
            await client.put(
                endpoint + f"/expenses/{expense['id']}", headers=bob, json={"amount": 1}
            )
        ).status_code == 403
        assert (
            await client.delete(endpoint + f"/expenses/{expense['id']}", headers=bob)
        ).status_code == 403
        for split in [[], ["alice", "alice"], ["outside-member"]]:
            response = await client.put(
                endpoint + f"/expenses/{expense['id']}",
                headers=account_headers(),
                json={"split_between": split},
            )
            assert response.status_code == 400
        bad_number = await client.post(
            endpoint + "/expenses",
            headers=account_headers(),
            content='{"paid_by":"alice","amount":NaN,"description":"Invalid"}',
        )
        assert bad_number.status_code == 422


@pytest.mark.asyncio
async def test_invalid_and_tampered_tokens_do_not_grant_access() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        trip = await new_trip(client)
        for token in [
            "not-a-token",
            "x" * 5000,
            account_headers()["Authorization"].removeprefix("Bearer ")[:-8]
            + "forged==",
        ]:
            assert (
                await client.get(
                    f"/api/v1/trips/{trip['id']}",
                    headers={"Authorization": f"Bearer {token}"},
                )
            ).status_code == 401
