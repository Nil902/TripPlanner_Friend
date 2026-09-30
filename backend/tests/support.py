"""Small authenticated HTTP helpers for integration tests."""

import uuid

from httpx import AsyncClient


async def register_creator(client: AsyncClient) -> str:
    """Create an account and use its bearer token for subsequent requests."""
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": f"creator_{uuid.uuid4().hex}@example.com",
            "password": "TestPassword123!",
            "name": "Test Creator",
        },
    )
    assert response.status_code == 201
    client.headers["Authorization"] = f"Bearer {response.json()['token']}"
    return str(response.json()["user"]["id"])


async def join_guest(
    client: AsyncClient, trip_id: str, name: str
) -> tuple[str, dict[str, str]]:
    """Join a trip and return the guest ID and scoped Authorization header."""
    response = await client.post(
        f"/api/v1/trips/{trip_id}/join",
        json={"name": name},
        headers={"Authorization": ""},
    )
    assert response.status_code == 200
    data = response.json()
    return str(data["id"]), {"Authorization": f"Bearer {data['access_token']}"}
