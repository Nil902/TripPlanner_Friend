"""
Unit and integration tests for authentication endpoints (signup, login, me).
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_signup_and_login_flow():
    """Verify signup, login, and authenticated me endpoint."""
    email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Signup a new user
        signup_payload = {
            "email": email,
            "password": "SecurePassword123!",
            "name": "Alex Traveler",
        }
        resp = await client.post("/api/v1/auth/signup", json=signup_payload)
        assert resp.status_code == 201
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == email
        assert data["user"]["name"] == "Alex Traveler"
        token = data["token"]

        # 2. Duplicate email should fail
        dup_resp = await client.post("/api/v1/auth/signup", json=signup_payload)
        assert dup_resp.status_code == 400
        assert dup_resp.json()["detail"]["code"] == "EMAIL_EXISTS"

        # 3. Login with correct credentials
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "SecurePassword123!"},
        )
        assert login_resp.status_code == 200
        login_data = login_resp.json()
        assert "token" in login_data
        assert login_data["user"]["email"] == email

        # 4. Login with incorrect password
        wrong_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword!"},
        )
        assert wrong_resp.status_code == 401
        assert wrong_resp.json()["detail"]["code"] == "INVALID_CREDENTIALS"

        # 5. Access /me with bearer token
        me_resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == email

        # 6. Access /me without token should return 401
        unauth_resp = await client.get("/api/v1/auth/me")
        assert unauth_resp.status_code == 401


@pytest.mark.asyncio
async def test_signup_rejects_weak_password():
    """Verify signup rejects passwords shorter than 8 characters."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": f"weak_{uuid.uuid4().hex[:6]}@example.com",
                "password": "short",
                "name": "Weak Pass User",
            },
        )
        assert resp.status_code == 422
        assert resp.json()["detail"]["code"] == "WEAK_PASSWORD"
