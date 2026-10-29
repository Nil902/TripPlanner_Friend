"""Verify abuse limits, bounded payloads, and concurrent planning admission."""

import asyncio
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.request_guards import RequestGuards
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_public_rate_limit_expires_without_blocking_health() -> None:
    now = [0.0]
    api = FastAPI()

    @api.post("/api/v1/auth/login")
    async def login() -> dict[str, bool]:
        return {"ok": True}

    @api.get("/healthz")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    api.add_middleware(RequestGuards, public_limit=2, clock=lambda: now[0])
    async with AsyncClient(
        transport=ASGITransport(app=api), base_url="http://test"
    ) as client:
        assert (await client.post("/api/v1/auth/login")).status_code == 200
        assert (await client.post("/api/v1/auth/login")).status_code == 200
        limited = await client.post("/api/v1/auth/login")
        assert limited.status_code == 429
        assert limited.headers["retry-after"] == "60"
        assert (await client.get("/healthz")).status_code == 200
        now[0] = 61
        assert (await client.post("/api/v1/auth/login")).status_code == 200


@pytest.mark.asyncio
async def test_large_streamed_request_is_rejected_before_the_handler() -> None:
    api = FastAPI()
    received = []

    @api.post("/write")
    async def write(request: Request) -> dict[str, bool]:
        received.append(await request.body())
        return {"ok": True}

    api.add_middleware(RequestGuards)

    async def chunks() -> AsyncIterator[bytes]:
        yield b"x" * 40000
        yield b"y" * 40000

    async with AsyncClient(
        transport=ASGITransport(app=api), base_url="http://test"
    ) as client:
        assert (await client.post("/write", content=chunks())).status_code == 413
    assert received == []


@pytest.mark.asyncio
async def test_concurrent_plan_requests_are_rejected_and_capacity_is_released() -> None:
    api = FastAPI()
    started, finish = asyncio.Event(), asyncio.Event()

    @api.post("/api/v1/trips/trip-1/plan")
    async def plan() -> dict[str, bool]:
        started.set()
        await finish.wait()
        return {"ok": True}

    api.add_middleware(RequestGuards, ai_limit=20)
    headers = {"Authorization": f"Bearer {create_access_token('alice')}"}
    async with AsyncClient(
        transport=ASGITransport(app=api), base_url="http://test"
    ) as client:
        first = asyncio.create_task(
            client.post("/api/v1/trips/trip-1/plan", headers=headers)
        )
        try:
            await asyncio.wait_for(started.wait(), timeout=2)
            assert (
                await client.post("/api/v1/trips/trip-1/plan", headers=headers)
            ).status_code == 409
        finally:
            finish.set()
            await first
        assert (
            await client.post("/api/v1/trips/trip-1/plan", headers=headers)
        ).status_code == 200
