"""Regression tests for planning correctness and transactional persistence."""

from datetime import date, datetime

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.db import engine
from app.models.schema import (
    Constraint,
    Place,
    PlaceResponse,
    Plan,
    PlanDayResponse,
    PlanItem,
    PlanItemResponse,
    Trip,
    ValidationIssue,
    ValidationStatus,
)
from app.services.agent_planner import AgentPlanner
from app.validators.open_hours_validator import check_open_hours


def _trip() -> Trip:
    trip = Trip(
        title="Safety test",
        destination="Lisbon",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        creator_id="test-creator",
    )
    with Session(engine) as session:
        session.add(trip)
        session.commit()
        session.refresh(trip)
    return trip


def test_exclusions_are_never_relaxed(monkeypatch: pytest.MonkeyPatch) -> None:
    trip = _trip()
    place = Place(place_id="excluded", name="Forbidden Museum", category="museum")
    monkeypatch.setattr(
        "app.services.agent_planner.get_or_create_places_for_destination",
        lambda *_: [place],
    )
    constraint = Constraint(
        trip_id=trip.id, user_id="test-creator", must_avoid=["museum"]
    )
    with Session(engine) as session:
        with pytest.raises(HTTPException) as error:
            AgentPlanner.generate_plan(session, trip, [constraint])
        assert error.value.status_code == 422
        assert session.exec(select(Plan).where(Plan.trip_id == trip.id)).first() is None


def test_unknown_destinations_do_not_produce_fictional_venues() -> None:
    from app.services.places_service import get_or_create_places_for_destination

    trip = _trip()
    trip.destination = "Unknown test destination"
    with Session(engine) as session:
        assert get_or_create_places_for_destination(session, trip.destination) == []
        with pytest.raises(HTTPException) as error:
            AgentPlanner.generate_plan(session, trip, [])
    assert error.value.status_code == 503
    assert error.value.detail["code"] == "VENUE_DATA_UNAVAILABLE"


def test_hard_scheduling_errors_are_not_reported_as_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    trip = _trip()
    monkeypatch.setattr(
        "app.services.agent_planner.check_travel_time",
        lambda *_: [
            ValidationIssue(
                type="travel_time", severity="error", message="Impossible transition"
            )
        ],
    )
    with Session(engine) as session:
        response = AgentPlanner.generate_plan(session, trip, [])
    assert response.validation_status == ValidationStatus.INVALID


@pytest.mark.parametrize("operation", ["generate", "refine"])
def test_failed_item_write_does_not_commit_empty_plan(
    monkeypatch: pytest.MonkeyPatch, operation: str
) -> None:
    trip = _trip()
    with Session(engine) as session:
        current = AgentPlanner.generate_plan(session, trip, [])
        current_plan = session.get(Plan, current.id)
        assert current_plan is not None
        original_add = session.add

        def fail_item_add(instance: object, **kwargs: object) -> None:
            if isinstance(instance, PlanItem):
                raise RuntimeError("Simulated storage failure")
            original_add(instance, **kwargs)

        monkeypatch.setattr(session, "add", fail_item_add)
        with pytest.raises(RuntimeError, match="Simulated storage failure"):
            if operation == "generate":
                AgentPlanner.generate_plan(session, trip, [])
            else:
                AgentPlanner.refine_plan(
                    session, trip, current_plan, "Make day 1 relaxed"
                )
        session.rollback()
    with Session(engine) as session:
        saved = session.exec(select(Plan).where(Plan.trip_id == trip.id)).all()
    assert len(saved) == 1
    assert saved[0].id == current.id


def _visit(hours: dict, start: str, end: str) -> list[PlanDayResponse]:
    place = PlaceResponse(
        place_id="opening-test",
        name="Test Venue",
        category="museum",
        lat=1,
        lng=1,
        est_cost=0,
        opening_hours=hours,
    )
    item = PlanItemResponse(
        id="opening-item",
        place_id=place.place_id,
        place=place,
        day_index=0,
        start_time=datetime.fromisoformat(start),
        end_time=datetime.fromisoformat(end),
        cost=0,
    )
    return [PlanDayResponse(date=item.start_time.date(), day_index=0, items=[item])]


@pytest.mark.parametrize(
    ("start", "end", "valid"),
    [
        ("2026-10-01T23:00:00", "2026-10-02T00:30:00", True),
        ("2026-10-02T00:10:00", "2026-10-02T00:50:00", True),
        ("2026-10-01T23:00:00", "2026-10-02T01:30:00", False),
        ("2026-10-01T00:10:00", "2026-10-01T00:50:00", False),
    ],
)
def test_overnight_visits(start: str, end: str, valid: bool) -> None:
    hours = {
        "periods": [
            {"open": {"day": 4, "time": "2000"}, "close": {"day": 5, "time": "0100"}}
        ]
    }
    issues = check_open_hours(_visit(hours, start, end))
    assert (not issues) is valid


def test_multiple_opening_periods_and_lunch_closure() -> None:
    hours = {
        "periods": [
            {"open": {"day": 4, "time": "0900"}, "close": {"day": 4, "time": "1200"}},
            {"open": {"day": 4, "time": "1400"}, "close": {"day": 4, "time": "1800"}},
        ]
    }
    assert (
        check_open_hours(_visit(hours, "2026-10-01T15:00:00", "2026-10-01T16:00:00"))
        == []
    )
    assert (
        check_open_hours(_visit(hours, "2026-10-01T11:00:00", "2026-10-01T15:00:00"))[
            0
        ].severity
        == "error"
    )


def test_continuous_opening_and_malformed_provider_data() -> None:
    hours = {"periods": [{"open": {"day": 0, "time": "0000"}}]}
    assert (
        check_open_hours(_visit(hours, "2026-10-01T22:00:00", "2026-10-02T02:00:00"))
        == []
    )
    hours = {"periods": [{"open": {"day": 4, "time": "bad"}}]}
    issues = check_open_hours(
        _visit(hours, "2026-10-01T10:00:00", "2026-10-01T11:00:00")
    )
    assert len(issues) == 1
    assert issues[0].severity == "warning"
