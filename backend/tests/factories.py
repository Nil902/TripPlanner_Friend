"""Persisted test actors and real signed credentials; no auth dependency bypass."""

import uuid
from typing import Any

from httpx import AsyncClient
from sqlmodel import Session

from app.core.db import engine
from app.core.security import create_access_token, hash_password
from app.models.schema import User


def account_headers(user_id: str = "alice", *, admin: bool = False) -> dict[str, str]:
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user is None:
            user = User(
                id=user_id,
                email=f"{uuid.uuid4().hex}@example.com",
                name=user_id.title(),
                hashed_password=hash_password("test-fixture-password"),
                is_admin=admin,
            )
            session.add(user)
            session.commit()
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


async def new_trip(client: AsyncClient, owner: str = "alice") -> dict[str, Any]:
    response = await client.post(
        "/api/v1/trips",
        headers=account_headers(owner),
        json={
            "title": "Test Trip",
            "destination": "Lisbon",
            "start_date": "2026-11-01",
            "end_date": "2026-11-03",
        },
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


async def join_member(
    client: AsyncClient, trip_id: str, user_id: str
) -> dict[str, str]:
    headers = account_headers(user_id)
    response = await client.post(
        f"/api/v1/trips/{trip_id}/join", headers=headers, json={"name": user_id}
    )
    assert response.status_code == 200, response.text
    return headers
