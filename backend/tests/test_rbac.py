"""
Integration and unit tests for Role-Based Access Control (RBAC) in trips API.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import init_db
from app.main import app


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


@pytest.mark.asyncio
async def test_creator_permissions_and_management():
    """Verify creator has management rights, creator permissions, and can update/delete trip."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register creator user
        email = f"creator_{uuid.uuid4().hex[:8]}@example.com"
        signup_resp = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": email,
                "password": "CreatorPassword123!",
                "name": "Alice Creator",
            },
        )
        assert signup_resp.status_code == 201
        creator_data = signup_resp.json()
        creator_token = creator_data["token"]
        creator_id = creator_data["user"]["id"]

        # 2. Creator creates a trip
        create_resp = await client.post(
            "/api/v1/trips",
            json={
                "title": "Azores Adventure",
                "destination": "Ponta Delgada, Portugal",
                "start_date": "2026-11-01",
                "end_date": "2026-11-05",
                "creator_id": creator_id,
            },
        )
        assert create_resp.status_code == 201
        trip = create_resp.json()
        trip_id = trip["id"]
        assert trip["creator_id"] == creator_id

        # 3. Creator checks permissions with Bearer token
        perm_resp = await client.get(
            f"/api/v1/trips/{trip_id}/permissions",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert perm_resp.status_code == 200
        perm_data = perm_resp.json()
        assert perm_data["can_manage"] is True
        assert perm_data["is_creator"] is True
        assert perm_data["role"] == "creator"

        # 4. Creator checks permissions with query param user_id
        perm_query_resp = await client.get(
            f"/api/v1/trips/{trip_id}/permissions?user_id={creator_id}",
        )
        assert perm_query_resp.status_code == 200
        perm_query_data = perm_query_resp.json()
        assert perm_query_data["can_manage"] is True
        assert perm_query_data["is_creator"] is True
        assert perm_query_data["role"] == "creator"

        # A role header alone does not authenticate the caller.
        perm_header_resp = await client.get(
            f"/api/v1/trips/{trip_id}/permissions",
            headers={"X-User-Role": "creator"},
        )
        assert perm_header_resp.status_code == 200
        assert perm_header_resp.json()["can_manage"] is False
        assert perm_header_resp.json()["role"] == "joiner"

        # 6. Creator can update trip with token
        update_resp = await client.put(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {creator_token}"},
            json={"title": "Updated Azores Adventure"},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["title"] == "Updated Azores Adventure"

        # 7. Creator can delete trip with token
        delete_resp = await client.delete(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert delete_resp.status_code == 204

        # 8. Verify trip is deleted
        get_resp = await client.get(f"/api/v1/trips/{trip_id}")
        assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_joiner_flow_and_forbidden_actions():
    """Verify joiners can join without login, list members, but are forbidden from updates/deletions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register creator and joiner accounts
        c_email = f"c_{uuid.uuid4().hex[:8]}@example.com"
        j_email = f"j_{uuid.uuid4().hex[:8]}@example.com"

        c_resp = await client.post(
            "/api/v1/auth/signup",
            json={"email": c_email, "password": "Password123!", "name": "Trip Creator"},
        )
        assert c_resp.status_code == 201
        creator_id = c_resp.json()["user"]["id"]

        j_resp = await client.post(
            "/api/v1/auth/signup",
            json={"email": j_email, "password": "Password123!", "name": "Bob Joiner"},
        )
        assert j_resp.status_code == 201
        joiner_token = j_resp.json()["token"]
        joiner_id = j_resp.json()["user"]["id"]

        # 2. Create trip
        create_resp = await client.post(
            "/api/v1/trips",
            json={
                "title": "Porto Wine Trail",
                "destination": "Porto, Portugal",
                "start_date": "2026-12-01",
                "end_date": "2026-12-04",
                "creator_id": creator_id,
            },
        )
        assert create_resp.status_code == 201
        trip_id = create_resp.json()["id"]

        # 3. Guest joins without auth (auto-generated user_id from name)
        join_resp1 = await client.post(
            f"/api/v1/trips/{trip_id}/join",
            json={"name": "Alice Guest"},
        )
        assert join_resp1.status_code == 200
        member1 = join_resp1.json()
        assert member1["id"] == "alice_guest"
        assert member1["name"] == "Alice Guest"
        assert member1["initials"] == "AG"
        assert member1["submitted"] is False
        assert member1["role"] == "joiner"

        # 4. Registered user joins with their user_id
        join_resp2 = await client.post(
            f"/api/v1/trips/{trip_id}/join",
            json={"name": "Bob Joiner", "user_id": joiner_id},
        )
        assert join_resp2.status_code == 200
        member2 = join_resp2.json()
        assert member2["id"] == joiner_id
        assert member2["name"] == "Bob Joiner"
        assert member2["initials"] == "BJ"
        assert member2["submitted"] is False
        assert member2["role"] == "joiner"

        # 5. Get trip members without auth
        members_resp = await client.get(f"/api/v1/trips/{trip_id}/members")
        assert members_resp.status_code == 200
        members = members_resp.json()
        assert len(members) == 3

        creator_m = next((m for m in members if m["id"] == creator_id), None)
        assert creator_m is not None
        assert creator_m["role"] == "creator"
        assert creator_m["name"] == "Trip Creator"
        assert creator_m["initials"] == "TC"

        bob_m = next((m for m in members if m["id"] == joiner_id), None)
        assert bob_m is not None
        assert bob_m["role"] == "joiner"
        assert bob_m["submitted"] is False

        # 6. Bob submits constraints -> submitted status updates
        c_submit = await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": joiner_id, "budget_per_day": 85.0},
        )
        assert c_submit.status_code == 200

        members_resp2 = await client.get(f"/api/v1/trips/{trip_id}/members")
        bob_m2 = next((m for m in members_resp2.json() if m["id"] == joiner_id), None)
        assert bob_m2 is not None
        assert bob_m2["submitted"] is True

        # 7. Joiner permissions check
        # Via query param
        p1 = await client.get(
            f"/api/v1/trips/{trip_id}/permissions?user_id={joiner_id}"
        )
        assert p1.status_code == 200
        assert p1.json() == {"can_manage": False, "is_creator": False, "role": "joiner"}

        # Via token
        p2 = await client.get(
            f"/api/v1/trips/{trip_id}/permissions",
            headers={"Authorization": f"Bearer {joiner_token}"},
        )
        assert p2.status_code == 200
        assert p2.json() == {"can_manage": False, "is_creator": False, "role": "joiner"}

        # Via X-User-Role: joiner
        p3 = await client.get(
            f"/api/v1/trips/{trip_id}/permissions",
            headers={"X-User-Role": "joiner"},
        )
        assert p3.status_code == 200
        assert p3.json() == {"can_manage": False, "is_creator": False, "role": "joiner"}

        # Without any info
        p4 = await client.get(f"/api/v1/trips/{trip_id}/permissions")
        assert p4.status_code == 200
        assert p4.json() == {"can_manage": False, "is_creator": False, "role": "joiner"}

        # 8. Joiner tries to update trip -> 403 Forbidden
        put_token_resp = await client.put(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {joiner_token}"},
            json={"title": "Hacked Title by Joiner"},
        )
        assert put_token_resp.status_code == 403
        err_detail = put_token_resp.json()["detail"]
        assert err_detail["code"] == "FORBIDDEN"
        assert "Only the trip creator can update this trip." in err_detail["message"]

        # Joiner tries to update with X-User-Role header -> 403 Forbidden
        put_role_resp = await client.put(
            f"/api/v1/trips/{trip_id}",
            headers={"X-User-Role": "joiner"},
            json={"title": "Hacked Title by Role Header"},
        )
        assert put_role_resp.status_code == 403
        assert put_role_resp.json()["detail"]["code"] == "FORBIDDEN"

        # 9. Joiner tries to delete trip -> 403 Forbidden
        del_token_resp = await client.delete(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {joiner_token}"},
        )
        assert del_token_resp.status_code == 403
        assert del_token_resp.json()["detail"]["code"] == "FORBIDDEN"

        del_role_resp = await client.delete(
            f"/api/v1/trips/{trip_id}",
            headers={"X-User-Role": "joiner"},
        )
        assert del_role_resp.status_code == 403
        assert del_role_resp.json()["detail"]["code"] == "FORBIDDEN"

        # 10. Verify trip is NOT deleted and title unchanged
        trip_check = await client.get(f"/api/v1/trips/{trip_id}")
        assert trip_check.status_code == 200
        assert trip_check.json()["title"] == "Porto Wine Trail"


@pytest.mark.asyncio
async def test_rbac_admin_override_and_edge_cases():
    """Verify admin privileges override creator checks, and verify 400/404 edge cases."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Admin login
        admin_login = await client.post(
            "/api/v1/admin/login",
            json={"email": "admin@antigravity.travel", "password": "admin12345"},
        )
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["token"]

        # 2. Create trip by non-admin creator
        create_resp = await client.post(
            "/api/v1/trips",
            json={
                "title": "Coimbra University Tour",
                "destination": "Coimbra, Portugal",
                "start_date": "2026-11-10",
                "end_date": "2026-11-12",
                "creator_id": "creator_regular",
            },
        )
        assert create_resp.status_code == 201
        trip_id = create_resp.json()["id"]

        # 3. Admin has manage permissions on the trip
        admin_perm = await client.get(
            f"/api/v1/trips/{trip_id}/permissions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert admin_perm.status_code == 200
        assert admin_perm.json()["can_manage"] is True

        # 4. Admin can update trip
        admin_update = await client.put(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Admin Updated Coimbra Tour"},
        )
        assert admin_update.status_code == 200
        assert admin_update.json()["title"] == "Admin Updated Coimbra Tour"

        # 5. Edge cases: non-existent trip
        fake_id = "non-existent-trip-999"
        join_fake = await client.post(
            f"/api/v1/trips/{fake_id}/join",
            json={"name": "Ghost User"},
        )
        assert join_fake.status_code == 404

        members_fake = await client.get(f"/api/v1/trips/{fake_id}/members")
        assert members_fake.status_code == 404

        perm_fake = await client.get(f"/api/v1/trips/{fake_id}/permissions")
        assert perm_fake.status_code == 404

        # 6. Edge case: empty name on join
        join_empty = await client.post(
            f"/api/v1/trips/{trip_id}/join",
            json={"name": "   "},
        )
        assert join_empty.status_code == 400
        assert join_empty.json()["detail"]["code"] == "INVALID_NAME"
