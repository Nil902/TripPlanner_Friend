"""Regression checks for venue grounding and planner status claims."""

import json
import uuid
from datetime import date, datetime

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import DateTime, event
from sqlmodel import Session, select

from app.core.db import engine
from app.main import app
from app.models.schema import (
    Constraint,
    DisruptionEvent,
    DisruptionType,
    Place,
    PlaceResponse,
    Plan,
    PlanDayResponse,
    PlanItem,
    PlanItemResponse,
    Trip,
    ValidationStatus,
)
from app.services import agent_planner, places_service, proposer
from app.services.agent_planner import (
    AgentPlanner,
    UnsatisfiableExclusionsError,
    clean_issue_message,
)
from app.validators.place_constraint_validator import check_place_constraints
from tests.support import join_guest, register_creator


def test_plan_items_keep_destination_local_wall_times() -> None:
    """SQLModel's newer UTC default must not reject naive itinerary times."""
    for column in (PlanItem.__table__.c.start_time, PlanItem.__table__.c.end_time):
        assert isinstance(column.type, DateTime)
        assert column.type.timezone is False


@pytest.mark.asyncio
async def test_plan_is_partial_when_group_preferences_are_missing() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        creator_id = await register_creator(client)
        trip_response = await client.post(
            "/api/v1/trips",
            json={
                "title": "Incomplete group preferences",
                "destination": "Lisbon",
                "start_date": "2026-10-01",
                "end_date": "2026-10-01",
                "creator_id": creator_id,
            },
        )
        trip_id = trip_response.json()["id"]
        await join_guest(client, trip_id, "No preferences yet")
        await client.post(
            f"/api/v1/trips/{trip_id}/constraints",
            json={"user_id": creator_id, "budget_per_day": 100},
        )

        plan = await client.post(f"/api/v1/trips/{trip_id}/plan")
        assert plan.status_code == 200
        assert plan.json()["validation_status"] == "partial"
        assert any("missing for 1" in note for note in plan.json()["notes"])
        validation = await client.post(f"/api/v1/trips/{trip_id}/plan/validate")
        assert validation.json()["status"] in {"partial", "invalid"}
        assert validation.json()["is_valid"] is False
        assert any(
            issue["type"] == "missing_constraints"
            for issue in validation.json()["issues"]
        )


def test_plan_and_items_roll_back_together_on_item_insert_failure() -> None:
    trip = Trip(
        title="Atomic plan",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="atomic-planner",
    )
    with Session(engine) as session:
        session.add(trip)
        session.commit()
        trip_id = trip.id

        def fail_item_insert(
            _session: Session,
            _flush_context: object,
            _instances: object,
        ) -> None:
            if any(isinstance(obj, PlanItem) for obj in _session.new):
                raise RuntimeError("Simulated item insert failure")

        event.listen(session, "before_flush", fail_item_insert)
        try:
            with pytest.raises(RuntimeError, match="Simulated item insert failure"):
                AgentPlanner.generate_plan(session, trip, [])
        finally:
            event.remove(session, "before_flush", fail_item_insert)
            session.rollback()

    with Session(engine) as verification_session:
        saved_plans = verification_session.exec(
            select(Plan).where(Plan.trip_id == trip_id)
        ).all()
        assert saved_plans == []


def test_venue_cache_can_join_manual_edit_transaction(monkeypatch) -> None:
    destination = f"atomic-cache-{uuid.uuid4().hex}"
    monkeypatch.setitem(
        places_service.DESTINATION_CATALOG,
        destination,
        [
            {
                "name": "Verified Example",
                "category": "museum",
                "lat": 38.7,
                "lng": -9.1,
                "est_cost": 10.0,
                "hours": None,
            }
        ],
    )
    trip = Trip(
        title="Cache transaction",
        destination=destination,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="atomic-cache-owner",
    )
    with Session(engine) as session:
        session.add(trip)
        session.commit()
        trip_id = trip.id
        pending_plan = Plan(trip_id=trip_id, version=1)
        session.add(pending_plan)
        cached = places_service.get_or_create_places_for_destination(
            session, destination, commit_cache=False
        )
        cached_place_id = cached[0].place_id
        session.rollback()

    with Session(engine) as verification_session:
        assert (
            verification_session.exec(select(Plan).where(Plan.trip_id == trip_id)).all()
            == []
        )
        assert verification_session.get(Place, cached_place_id) is None


def test_llm_uses_catalogue_price_and_rejects_wrong_dates(monkeypatch):
    place = Place(
        place_id="known_venue",
        name="Known Venue",
        category="museum",
        lat=38.7,
        lng=-9.1,
        est_cost=35.0,
    )
    trip = Trip(
        title="Grounding test",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="traveler",
    )
    day = date(2026, 10, 1)
    proposed_item = {
        "place_id": place.place_id,
        "start_time": "2026-10-01T10:00:00",
        "end_time": "2026-10-01T12:00:00",
        "cost": 0.0,
    }
    response_body = {"days": [{"day_index": 0, "items": [proposed_item]}]}
    real_client = httpx.Client

    def fake_client(*, timeout: float) -> httpx.Client:
        transport = httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": json.dumps(response_body)}]}}
                    ]
                },
            )
        )
        return real_client(transport=transport, timeout=timeout)

    monkeypatch.setattr(proposer.settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(proposer.httpx, "Client", fake_client)

    result = proposer.call_gemini_proposer(trip, [], [place], [day], [])
    assert result is not None
    assert result[0].items[0].cost == 35.0

    proposed_item["start_time"] = "2026-10-02T10:00:00"
    assert proposer.call_gemini_proposer(trip, [], [place], [day], []) is None

    proposed_item["start_time"] = "2026-10-01T12:00:00"
    assert proposer.call_gemini_proposer(trip, [], [place], [day], []) is None


def test_validator_feedback_redacts_user_identifier():
    message = "Day 1 exceeds user 'alice@example.com' cap by $10"
    assert "alice@example.com" not in clean_issue_message(
        message, ["alice@example.com"]
    )


def test_place_constraints_detect_missing_and_excluded_venues():
    place = PlaceResponse(
        place_id="bar",
        name="Forbidden Bar",
        category="bar",
        lat=38.7,
        lng=-9.1,
        est_cost=10,
    )
    day = PlanDayResponse(
        date=date(2026, 10, 1),
        day_index=0,
        items=[
            PlanItemResponse(
                id="bar_visit",
                place_id=place.place_id,
                place=place,
                day_index=0,
                start_time=datetime(2026, 10, 1, 10),
                end_time=datetime(2026, 10, 1, 12),
                cost=10,
            )
        ],
    )
    constraint = Constraint(
        trip_id="trip",
        user_id="traveler",
        budget_per_day=100,
        must_see=["Museum"],
        must_avoid=["bar"],
    )
    issues = check_place_constraints([day], [constraint])
    assert {issue.type for issue in issues} == {"must_see", "must_avoid"}


def test_llm_error_logs_do_not_expose_api_key(monkeypatch, caplog):
    secret = "private-test-key"

    def failing_client(*, timeout: float) -> httpx.Client:
        raise httpx.ConnectError(f"request failed for URL?key={secret}")

    monkeypatch.setattr(proposer.settings, "GEMINI_API_KEY", secret)
    monkeypatch.setattr(proposer.httpx, "Client", failing_client)
    monkeypatch.setattr(proposer.time, "sleep", lambda seconds: None)
    trip = Trip(
        title="Logging test",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="traveler",
    )
    place = Place(
        place_id="known_venue",
        name="Known Venue",
        category="museum",
        lat=38.7,
        lng=-9.1,
        est_cost=10,
    )
    assert (
        proposer.call_gemini_proposer(trip, [], [place], [trip.start_date], []) is None
    )
    assert secret not in caplog.text


def test_planner_marks_empty_day_partial(monkeypatch):
    trip = Trip(
        title="Empty day test",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="traveler",
    )
    monkeypatch.setattr(
        agent_planner,
        "get_or_create_places_for_destination",
        lambda session, destination: [
            Place(
                place_id="unused",
                name="Unused",
                category="museum",
                lat=38.7,
                lng=-9.1,
                est_cost=10,
            )
        ],
    )
    monkeypatch.setattr(
        agent_planner,
        "call_gemini_proposer",
        lambda **kwargs: [PlanDayResponse(date=trip.start_date, day_index=0, items=[])],
    )
    with Session(engine) as session:
        session.add(trip)
        session.commit()
        result = AgentPlanner.generate_plan(session, trip, [])

    assert result.validation_status == ValidationStatus.PARTIAL
    assert any("unresolved issue" in note for note in result.notes)


def test_relaxed_budget_plan_is_not_claimed_valid(monkeypatch):
    trip = Trip(
        title="Relaxed budget test",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="traveler",
    )
    place = Place(
        place_id=f"expensive_venue_{uuid.uuid4()}",
        name="Expensive Venue",
        category="museum",
        lat=38.7,
        lng=-9.1,
        est_cost=110.0,
    )
    day = PlanDayResponse(
        date=trip.start_date,
        day_index=0,
        items=[
            PlanItemResponse(
                id="candidate_item",
                place_id=place.place_id,
                place=PlaceResponse.model_validate(place),
                day_index=0,
                start_time=datetime(2026, 10, 1, 10),
                end_time=datetime(2026, 10, 1, 12),
                cost=110.0,
            )
        ],
    )
    monkeypatch.setattr(
        agent_planner,
        "get_or_create_places_for_destination",
        lambda session, destination: [place],
    )
    monkeypatch.setattr(agent_planner, "call_gemini_proposer", lambda **kwargs: [day])
    constraint = Constraint(trip_id=trip.id, user_id="traveler", budget_per_day=100.0)
    with Session(engine) as session:
        session.add(trip)
        session.add(place)
        session.add(constraint)
        session.commit()
        result = AgentPlanner.generate_plan(session, trip, [constraint])

    assert result.validation_status == ValidationStatus.PARTIAL
    assert result.days[0].items[0].cost == 110.0


def test_planner_does_not_restore_excluded_venues(monkeypatch):
    trip = Trip(
        title="Exclusions test",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="traveler",
    )
    place = Place(
        place_id="excluded",
        name="Excluded Venue",
        category="museum",
        lat=38.7,
        lng=-9.1,
        est_cost=10,
    )
    monkeypatch.setattr(
        agent_planner,
        "get_or_create_places_for_destination",
        lambda session, destination: [place],
    )
    constraint = Constraint(
        trip_id=trip.id,
        user_id="traveler",
        budget_per_day=100,
        must_avoid=["excluded"],
    )
    with Session(engine) as session:
        with pytest.raises(UnsatisfiableExclusionsError):
            AgentPlanner.generate_plan(session, trip, [constraint])


def test_rebalance_removes_closed_venue_without_allowed_replacement(monkeypatch):
    trip = Trip(
        title="Closure test",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="traveler",
    )
    closed = Place(
        place_id=f"closed_museum_{uuid.uuid4()}",
        name="Closed Museum",
        category="museum",
        lat=38.7,
        lng=-9.1,
        est_cost=20,
    )
    forbidden = Place(
        place_id=f"forbidden_bar_{uuid.uuid4()}",
        name="Forbidden Bar",
        category="bar",
        lat=38.7,
        lng=-9.1,
        est_cost=20,
    )
    monkeypatch.setattr(
        places_service,
        "get_or_create_places_for_destination",
        lambda session, destination: [closed, forbidden],
    )
    with Session(engine) as session:
        session.add(trip)
        session.add(closed)
        session.add(forbidden)
        session.commit()
        plan = Plan(trip_id=trip.id, version=1)
        session.add(plan)
        session.add(
            Constraint(
                trip_id=trip.id,
                user_id="traveler",
                budget_per_day=100,
                must_avoid=["bar"],
            )
        )
        session.commit()
        session.add(
            PlanItem(
                plan_id=plan.id,
                place_id=closed.place_id,
                day_index=0,
                start_time=datetime(2026, 10, 1, 10),
                end_time=datetime(2026, 10, 1, 12),
                cost=20,
            )
        )
        session.commit()
        result = AgentPlanner.rebalance(
            session,
            trip,
            plan,
            DisruptionEvent(
                type=DisruptionType.VENUE_CLOSED,
                day_index=0,
                place_id=closed.place_id,
            ),
        )

    assert result.version == 2
    assert result.validation_status == ValidationStatus.PARTIAL
    assert result.days[0].items == []
    assert any("Removed closed venue" in note for note in result.notes)


def test_live_places_do_not_invent_opening_hours(monkeypatch):
    real_client = httpx.Client

    def fake_client(*, timeout: float) -> httpx.Client:
        transport = httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "places": [
                        {
                            "id": "missing_location",
                            "displayName": {"text": "Unlocated Museum"},
                            "primaryType": "museum",
                        },
                        {
                            "id": "google_place",
                            "displayName": {"text": "Verified Museum"},
                            "primaryType": "museum",
                            "location": {"latitude": 10.0, "longitude": 20.0},
                        },
                    ]
                },
            )
        )
        return real_client(transport=transport, timeout=timeout)

    monkeypatch.setattr(places_service.settings, "GOOGLE_MAPS_API_KEY", "test-key")
    monkeypatch.setattr(places_service.httpx, "Client", fake_client)
    with Session(engine) as session:
        places = places_service.get_or_create_places_for_destination(
            session, "Verified Example City"
        )
        assert len(places) == 1
        assert places[0].name == "Verified Museum"
        assert places[0].opening_hours is None


@pytest.mark.asyncio
async def test_unknown_destination_has_no_fabricated_plan(monkeypatch):
    monkeypatch.setattr(places_service, "fetch_from_google_places_api", lambda _: [])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        creator_id = await register_creator(client)
        trip_response = await client.post(
            "/api/v1/trips",
            json={
                "title": "Unavailable destination",
                "destination": "Neverland Example City",
                "start_date": "2026-10-01",
                "end_date": "2026-10-01",
                "creator_id": creator_id,
            },
        )
        assert trip_response.status_code == 201
        trip_id = trip_response.json()["id"]
        response = await client.post(f"/api/v1/trips/{trip_id}/plan")
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "PLACES_UNAVAILABLE"
        plan_response = await client.get(f"/api/v1/trips/{trip_id}/plan")
        assert plan_response.status_code == 404
