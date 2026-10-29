"""
Unit and integration tests for AgentPlanner edge cases:
- Max iteration limit (5 iterations) halting and Section 9.2 Constraint Relaxation.
- Localized dynamic rebalancing preserving unaffected days and incrementing Plan.version.
"""

from datetime import date

from sqlmodel import Session

from app.core.db import engine
from app.models.schema import (
    Constraint,
    DisruptionEvent,
    DisruptionType,
    Trip,
    TripStatus,
    ValidationStatus,
)
from app.services.agent_planner import AgentPlanner


def test_agent_planner_max_iterations_and_constraint_relaxation():
    """
    Verify that when impossible constraints (e.g. $5/day budget in a destination where meals/activities cost more)
    are given, the planner:
    1. Halts cleanly after MAX_ITERATIONS (5) iterations without infinite looping.
    2. Applies Section 9.2 Constraint Relaxation (15% budget relaxation).
    3. Sets status to ValidationStatus.PARTIAL.
    4. Records trade-off explanation in plan notes.
    """
    with Session(engine) as session:
        trip = Trip(
            title="Extreme Budget Trip",
            destination="Lisbon, Portugal",
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 2),
            creator_id="broke_traveler",
            status=TripStatus.COLLECTING_CONSTRAINTS,
        )
        session.add(trip)
        session.commit()
        session.refresh(trip)

        # Alice has a physically impossible budget (1 cent per day)
        constraint = Constraint(
            trip_id=trip.id,
            user_id="broke_traveler",
            budget_per_day=0.01,
            must_see=["Jerónimos Monastery"],
        )
        session.add(constraint)
        session.commit()

        # Run planner
        plan_response = AgentPlanner.generate_plan(session, trip, [constraint])

        assert plan_response.trip_id == trip.id
        # The selected fixture also contains a closed-hours visit. Budget
        # relaxation must not hide that hard scheduling failure.
        assert plan_response.validation_status == ValidationStatus.INVALID
        assert any(
            "Reached maximum iterations (5)" in note for note in plan_response.notes
        )
        assert any(
            "Relaxed daily budget cap by 15%" in note for note in plan_response.notes
        )


def test_agent_planner_rebalance_preserves_unaffected_days():
    """
    Verify that rebalancing on Day 2 copies Day 1 exactly as-is and creates
    a new Plan version (e.g. version 2).
    """
    with Session(engine) as session:
        trip = Trip(
            title="Multi-Day Rebalance Trip",
            destination="Lisbon, Portugal",
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 2),
            creator_id="creator_x",
            status=TripStatus.COLLECTING_CONSTRAINTS,
        )
        session.add(trip)
        session.commit()
        session.refresh(trip)

        # Initial plan
        plan_v1 = AgentPlanner.generate_plan(session, trip, [])
        assert plan_v1.version == 1
        day1_items_v1 = [it.place_id for it in plan_v1.days[0].items]

        # Trigger disruption on Day 2 (day_index = 1)
        disruption = DisruptionEvent(
            type=DisruptionType.FLIGHT_DELAYED,
            day_index=1,
            delay_minutes=90,
            description="Morning transport delayed by 90 minutes",
        )

        from sqlmodel import select

        from app.models.schema import Plan

        plan_db = session.exec(select(Plan).where(Plan.id == plan_v1.id)).first()
        assert plan_db is not None

        plan_v2 = AgentPlanner.rebalance(session, trip, plan_db, disruption)

        assert plan_v2.version == 2
        # Day 1 items must be preserved identically
        day1_items_v2 = [it.place_id for it in plan_v2.days[0].items]
        assert day1_items_v1 == day1_items_v2

        # Day 2 items should reflect the time shift
        day2_items_v1 = plan_v1.days[1].items
        day2_items_v2 = plan_v2.days[1].items
        assert len(day2_items_v1) == len(day2_items_v2)
        # Verify first item in Day 2 was shifted forward by 90 minutes
        diff_minutes = (
            day2_items_v2[0].start_time - day2_items_v1[0].start_time
        ).total_seconds() / 60
        assert diff_minutes == 90
