"""Travel-date boundaries, response serialization, and completed-state preservation."""

from collections.abc import Generator
from datetime import UTC, date, datetime
from unittest.mock import Mock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api import plan as plan_api
from app.core.db import get_session
from app.core.trip_lifecycle import get_trip_lifecycle_status
from app.main import app
from app.models import schema
from app.models.schema import PlanResponse, Trip, TripStatus, ValidationStatus


@pytest.mark.parametrize(
    ("today", "status", "expected"),
    [
        (date(2026, 10, 9), "collecting_constraints", "upcoming"),
        (date(2026, 10, 9), "planned", "upcoming"),
        (date(2026, 10, 10), "planned", "in_progress"),
        (date(2026, 10, 11), "collecting_constraints", "in_progress"),
        (date(2026, 10, 12), "planned", "in_progress"),
        (date(2026, 10, 13), "planned", "completed"),
        (date(2026, 10, 13), "collecting_constraints", "completed"),
        (date(2026, 10, 9), "completed", "completed"),
        (date(2026, 10, 11), "completed", "completed"),
        (date(2026, 10, 9), "flagged", "upcoming"),
        (date(2026, 10, 13), "flagged", "completed"),
    ],
)
def test_lifecycle_date_boundaries(today: date, status: str, expected: str) -> None:
    assert (
        get_trip_lifecycle_status(date(2026, 10, 10), date(2026, 10, 12), status, today)
        == expected
    )


def test_one_day_trip_is_in_progress_on_its_end_date() -> None:
    day = date(2026, 10, 10)
    assert get_trip_lifecycle_status(day, day, "planned", day) == "in_progress"


@pytest.fixture
def trip_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    previous_override = app.dependency_overrides.get(get_session)
    with Session(engine) as session:

        def override_session() -> Generator[Session, None, None]:
            yield session

        app.dependency_overrides[get_session] = override_session
        try:
            yield session
        finally:
            if previous_override is None:
                app.dependency_overrides.pop(get_session, None)
            else:
                app.dependency_overrides[get_session] = previous_override
    engine.dispose()


def test_derived_status_is_not_a_database_column() -> None:
    columns = SQLModel.metadata.tables["trips"].columns
    assert "lifecycle_status" not in columns


@pytest.mark.asyncio
async def test_status_updates_on_read_without_mutating_planning_state(
    trip_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = datetime(2026, 10, 9, 23, 59, tzinfo=UTC)
    monkeypatch.setattr(schema, "utc_now", lambda: now)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        created = await client.post(
            "/api/v1/trips",
            json={
                "title": "Date boundary trip",
                "destination": "Lisbon",
                "start_date": "2026-10-10",
                "end_date": "2026-10-12",
                "creator_id": "test-creator",
            },
        )
        assert created.status_code == 201
        assert created.json()["lifecycle_status"] == "upcoming"
        trip_id = created.json()["id"]

        for day, expected in [
            (10, "in_progress"),
            (12, "in_progress"),
            (13, "completed"),
        ]:
            now = datetime(2026, 10, day, tzinfo=UTC)
            response = await client.get(f"/api/v1/trips/{trip_id}")
            assert response.status_code == 200
            assert response.json()["lifecycle_status"] == expected
            assert response.json()["status"] == "collecting_constraints"
            listing = await client.get("/api/v1/trips")
            assert listing.json()[0]["lifecycle_status"] == expected

        trip_session.expire_all()
        persisted = trip_session.get(Trip, trip_id)
        assert persisted is not None
        assert persisted.status == TripStatus.COLLECTING_CONSTRAINTS


@pytest.mark.asyncio
async def test_manual_completion_and_date_changes(
    trip_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(schema, "utc_now", lambda: datetime(2026, 10, 10, tzinfo=UTC))
    trip = Trip(
        title="Travel progress",
        destination="Lisbon",
        start_date=date(2026, 10, 9),
        end_date=date(2026, 10, 9),
        creator_id="test-creator",
    )
    trip_session.add(trip)
    trip_session.commit()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        moved = await client.put(
            f"/api/v1/trips/{trip.id}",
            json={"start_date": "2026-11-01", "end_date": "2026-11-03"},
        )
        assert moved.status_code == 200
        assert moved.json()["lifecycle_status"] == "upcoming"

        denied = await client.put(
            f"/api/v1/trips/{trip.id}",
            headers={"X-User-Role": "joiner"},
            json={"status": "completed"},
        )
        assert denied.status_code == 403

        finished = await client.put(
            f"/api/v1/trips/{trip.id}", json={"status": "completed"}
        )
        assert finished.status_code == 200
        assert finished.json()["status"] == "completed"
        assert finished.json()["lifecycle_status"] == "completed"

        moved_again = await client.put(
            f"/api/v1/trips/{trip.id}",
            json={"start_date": "2027-01-01", "end_date": "2027-01-02"},
        )
        assert moved_again.status_code == 200
        assert moved_again.json()["lifecycle_status"] == "completed"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [TripStatus.COMPLETED, TripStatus.FLAGGED, TripStatus.IN_PROGRESS]
)
async def test_generation_preserves_existing_travel_status(
    trip_session: Session, monkeypatch: pytest.MonkeyPatch, status: TripStatus
) -> None:
    trip = Trip(
        title="Preserve trip state",
        destination="Lisbon",
        start_date=date(2026, 10, 10),
        end_date=date(2026, 10, 12),
        creator_id="test-creator",
        status=status,
    )
    trip_session.add(trip)
    trip_session.commit()
    response = PlanResponse(
        id="test-plan",
        trip_id=trip.id,
        version=2,
        validation_status=ValidationStatus.VALID,
        days=[],
        notes=[],
        created_at=datetime(2026, 10, 10, tzinfo=UTC),
    )
    monkeypatch.setattr(
        plan_api.AgentPlanner, "generate_plan", Mock(return_value=response)
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        generated = await client.post(f"/api/v1/trips/{trip.id}/plan")
        assert generated.status_code == 200
        fetched = await client.get(f"/api/v1/trips/{trip.id}")
        assert fetched.json()["status"] == status.value


@pytest.mark.asyncio
async def test_manual_plan_creation_does_not_reopen_finished_trip(
    trip_session: Session,
) -> None:
    trip = Trip(
        title="Finished manual trip",
        destination="Lisbon",
        start_date=date(2026, 10, 10),
        end_date=date(2026, 10, 12),
        creator_id="test-creator",
        status=TripStatus.COMPLETED,
    )
    trip_session.add(trip)
    trip_session.commit()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        added = await client.post(
            f"/api/v1/trips/{trip.id}/plan/items",
            json={
                "day_index": 0,
                "place_name": "Final trip memory",
                "start_time": "2026-10-10T10:00:00",
                "end_time": "2026-10-10T11:00:00",
                "cost": 0,
                "lat": 38.71,
                "lng": -9.13,
            },
        )
        assert added.status_code == 200
        fetched = await client.get(f"/api/v1/trips/{trip.id}")
        assert fetched.json()["status"] == "completed"
