"""
Agent Evaluation Harness: Propose-Validate-Rebalance Loop vs. Naive Baseline Scorer.
Runs deterministic scenario fixtures and computes comparative metrics.
"""

import glob
import json
import os
import sys
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
from app.models.schema import (
    Constraint,
    DisruptionEvent,
    DisruptionType,
    PlaceResponse,
    Plan,
    PlanDayResponse,
    PlanItemResponse,
    PlanResponse,
    Trip,
    ValidationStatus,
    utc_now,
)
from app.services.agent_planner import AgentPlanner, build_day_dates
from app.services.places_service import get_or_create_places_for_destination
from app.validators.travel_validator import (
    estimate_transit_minutes,
    haversine_distance_km,
)

EVAL_DB_URL = "sqlite:///:memory:"
engine = create_engine(EVAL_DB_URL, connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


class NaiveBaselinePlanner:
    """
    Simulates a naive single-shot LLM generator:
    Generates an itinerary in a single unvalidated pass without running deterministic
    domain tools, validator feedback loops, or constraint relaxation.
    """

    @classmethod
    def generate_plan(
        cls, session: Session, trip: Trip, constraints: list[Constraint]
    ) -> PlanResponse:
        day_dates = build_day_dates(trip.start_date, trip.end_date)
        places = get_or_create_places_for_destination(session, trip.destination)

        days: list[PlanDayResponse] = []
        p_idx = 0
        for d_idx, d_date in enumerate(day_dates):
            items: list[PlanItemResponse] = []
            # Naive assignment: picks without budget or distance checking
            for slot_h in (9, 12, 14, 18):
                if not places:
                    break
                # Naive: doesn't check food categories or distance
                place = places[p_idx % len(places)]
                p_idx += 1

                st = datetime.combine(d_date, datetime.min.time()).replace(hour=slot_h)
                et = st + timedelta(hours=2)
                items.append(
                    PlanItemResponse(
                        id=str(uuid.uuid4()),
                        place_id=place.place_id,
                        place=PlaceResponse.model_validate(place) if place else None,
                        day_index=d_idx,
                        start_time=st,
                        end_time=et,
                        cost=place.est_cost or 45.0,
                    )
                )
            days.append(PlanDayResponse(date=d_date, day_index=d_idx, items=items))

        plan = Plan(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            version=1,
            validation_status=ValidationStatus.VALID,
            notes=["Naive single-shot plan without verification"],
            created_at=utc_now(),
        )
        return PlanResponse(
            id=plan.id,
            trip_id=plan.trip_id,
            version=plan.version,
            validation_status=plan.validation_status,
            days=days,
            notes=plan.notes,
            created_at=plan.created_at,
        )

    @classmethod
    def rebalance(
        cls,
        session: Session,
        trip: Trip,
        current_plan: PlanResponse,
        disruption: DisruptionEvent,
    ) -> PlanResponse:
        # Naive rebalance: regenerates the ENTIRE trip from scratch, causing full ripple disruption
        new_plan = cls.generate_plan(session, trip, [])
        new_plan.version = current_plan.version + 1
        new_plan.notes = ["Naive full regeneration on disruption"]
        return new_plan


# ==============================================================================
# DETERMINISTIC PROPERTY CHECKERS
# ==============================================================================


def check_budget_property(plan: PlanResponse, constraints: list[Constraint]) -> bool:
    """Verifies that no day's total cost exceeds the group average daily budget by > 15%."""
    if not constraints:
        return True
    avg_budget = sum(c.budget_per_day for c in constraints) / len(constraints)
    max_allowed = avg_budget * 1.15
    for day in plan.days:
        day_total = sum(it.cost for it in day.items)
        if day_total > max_allowed:
            return False
    return True


def check_food_option_property(plan: PlanResponse) -> bool:
    """Verifies at least one dining/cafe/market venue is scheduled per day."""
    food_cats = {"restaurant", "cafe", "market", "food"}
    for day in plan.days:
        has_food = any(
            it.place
            and (
                it.place.category in food_cats
                or any(c in it.place.name.lower() for c in food_cats)
            )
            for it in day.items
        )
        if not has_food:
            return False
    return True


def check_transit_duration_property(plan: PlanResponse, max_transit: int = 35) -> bool:
    """Verifies no two consecutive stops exceed max_transit minutes."""
    for day in plan.days:
        items = sorted(day.items, key=lambda x: x.start_time)
        for i in range(len(items) - 1):
            p1, p2 = items[i].place, items[i + 1].place
            if p1 and p2:
                dist = haversine_distance_km((p1.lat, p1.lng), (p2.lat, p2.lng))
                dur = estimate_transit_minutes(dist)
                if dur > max_transit:
                    return False
    return True


def check_transit_gap_property(plan: PlanResponse) -> bool:
    """Verifies the schedule buffer between consecutive stops allows transit."""
    for day in plan.days:
        items = sorted(day.items, key=lambda x: x.start_time)
        for i in range(len(items) - 1):
            p1, p2 = items[i].place, items[i + 1].place
            if p1 and p2:
                dist = haversine_distance_km((p1.lat, p1.lng), (p2.lat, p2.lng))
                dur = estimate_transit_minutes(dist)
                gap_mins = int(
                    (items[i + 1].start_time - items[i].end_time).total_seconds() / 60
                )
                if gap_mins < dur and gap_mins >= 0:
                    return False
    return True


def check_must_avoid_property(
    plan: PlanResponse, constraints: list[Constraint]
) -> bool:
    """Verifies no scheduled venue matches any must-avoid terms."""
    avoids = {a.lower().strip() for c in constraints for a in c.must_avoid if a.strip()}
    if not avoids:
        return True
    for day in plan.days:
        for it in day.items:
            if it.place:
                name_cat = f"{it.place.name} {it.place.category}".lower()
                if any(av in name_cat for av in avoids):
                    return False
    return True


def check_must_see_property(plan: PlanResponse, constraints: list[Constraint]) -> bool:
    """Verifies all must-see attractions appear in the plan."""
    must_sees = [
        ms.lower().strip() for c in constraints for ms in c.must_see if ms.strip()
    ]
    if not must_sees:
        return True
    all_place_names = [
        it.place.name.lower() for day in plan.days for it in day.items if it.place
    ]
    for ms in must_sees:
        if not any(ms in pname for pname in all_place_names):
            return False
    return True


def check_disruption_isolation(
    initial_plan: PlanResponse, rebalanced_plan: PlanResponse, affected_day_idx: int
) -> bool:
    """Verifies that only the affected day is modified, and other days remain unchanged."""
    for d_idx in range(len(initial_plan.days)):
        if d_idx != affected_day_idx:
            init_day = initial_plan.days[d_idx]
            reb_day = rebalanced_plan.days[d_idx]
            init_pids = [it.place_id for it in init_day.items]
            reb_pids = [it.place_id for it in reb_day.items]
            if init_pids != reb_pids:
                return False
    return True


def check_replacement_venue(
    rebalanced_plan: PlanResponse, affected_day_idx: int, target_name: str
) -> bool:
    """Verifies that closed venue is replaced by a different venue."""
    day = rebalanced_plan.days[affected_day_idx]
    for it in day.items:
        if it.place and target_name.lower() in it.place.name.lower():
            return False
    return len(day.items) > 0


def check_tradeoff_notes(plan: PlanResponse) -> bool:
    """Verifies that Plan.notes contains explanatory tradeoff/substitution text."""
    return len(plan.notes) > 0 and any(len(n.strip()) > 10 for n in plan.notes)


PROPERTY_EVALUATORS = {
    "budget_cap_within_tolerance": lambda p, c, **kw: check_budget_property(p, c),
    "at_least_one_food_option_per_day": lambda p, c, **kw: check_food_option_property(
        p
    ),
    "no_transit_over_35_mins": lambda p, c, **kw: check_transit_duration_property(
        p, 35
    ),
    "consecutive_transit_sufficient_gap": lambda p, c, **kw: check_transit_gap_property(
        p
    ),
    "must_avoid_respected": lambda p, c, **kw: check_must_avoid_property(p, c),
    "must_see_included": lambda p, c, **kw: check_must_see_property(p, c),
    "only_affected_day_modified": lambda p, c, init=None, aff=0, **kw: (
        check_disruption_isolation(init, p, aff) if init else False
    ),
    "unaffected_days_identical": lambda p, c, init=None, aff=0, **kw: (
        check_disruption_isolation(init, p, aff) if init else False
    ),
    "replacement_venue_found": lambda p, c, aff=0, tname="", **kw: (
        check_replacement_venue(p, aff, tname)
    ),
    "tradeoff_notes_explain_change": lambda p, c, **kw: check_tradeoff_notes(p),
}


# ==============================================================================
# RUNNER
# ==============================================================================


def run_evaluation_suite() -> dict[str, Any]:
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    fixture_files = sorted(glob.glob(os.path.join(fixtures_dir, "*.json")))

    if not fixture_files:
        print(f"Error: No fixture files found in {fixtures_dir}")
        sys.exit(1)

    print("=" * 80)
    print("      AUTONOMOUS TRAVEL AGENT EVALUATION HARNESS")
    print("      Comparing Iterative Propose-Validate Loop vs. Naive Baseline")
    print("=" * 80)

    total_properties = 0
    agent_passed_properties = 0
    baseline_passed_properties = 0

    results: list[dict[str, Any]] = []

    for fpath in fixture_files:
        with open(fpath) as f:
            data = json.load(f)

        scenario_name = data["name"]
        trip_data = data["trip"]
        constraints_data = data["constraints"]
        expected_props = data["expected_properties"]
        disruption_data = data.get("disruption")

        # Database session
        with Session(engine) as session:
            # Create trip
            start_d = date(2026, 7, 1)
            end_d = start_d + timedelta(days=trip_data["days"] - 1)
            trip = Trip(
                id=str(uuid.uuid4()),
                title=trip_data["title"],
                destination=trip_data["destination"],
                start_date=start_d,
                end_date=end_d,
                creator_id="eval_user",
            )
            session.add(trip)

            constraints = []
            for cd in constraints_data:
                c = Constraint(
                    id=str(uuid.uuid4()),
                    trip_id=trip.id,
                    user_id=cd["user_id"],
                    budget_per_day=float(cd["budget_per_day"]),
                    dietary=cd.get("dietary", []),
                    style_tags=cd.get("style_tags", []),
                    must_see=cd.get("must_see", []),
                    must_avoid=cd.get("must_avoid", []),
                )
                session.add(c)
                constraints.append(c)
            session.commit()

            # 1. RUN AGENT
            agent_plan = AgentPlanner.generate_plan(session, trip, constraints)
            initial_agent_plan = agent_plan

            if disruption_data:
                aff_day = disruption_data["day_index"]
                target_place_name = disruption_data.get("place_name", "")
                target_pid = None
                for it in agent_plan.days[aff_day].items:
                    if it.place and target_place_name.lower() in it.place.name.lower():
                        target_pid = it.place_id
                        break
                if not target_pid and agent_plan.days[aff_day].items:
                    target_pid = agent_plan.days[aff_day].items[0].place_id

                db_plan = session.get(Plan, agent_plan.id)
                assert db_plan is not None

                disr_event = DisruptionEvent(
                    type=DisruptionType(disruption_data["type"]),
                    day_index=aff_day,
                    place_id=target_pid,
                    delay_minutes=disruption_data.get("delay_minutes", 60),
                    description=disruption_data.get("description", "Disruption event"),
                )
                agent_plan = AgentPlanner.rebalance(session, trip, db_plan, disr_event)

            # 2. RUN BASELINE
            baseline_plan = NaiveBaselinePlanner.generate_plan(
                session, trip, constraints
            )
            initial_baseline_plan = baseline_plan

            if disruption_data:
                aff_day = disruption_data["day_index"]
                disr_event = DisruptionEvent(
                    type=DisruptionType(disruption_data["type"]),
                    day_index=aff_day,
                    description="Naive disruption",
                )
                baseline_plan = NaiveBaselinePlanner.rebalance(
                    session, trip, baseline_plan, disr_event
                )

            # EVALUATE PROPERTIES
            fixture_res = {
                "name": scenario_name,
                "properties": [],
            }

            for prop in expected_props:
                evaluator = PROPERTY_EVALUATORS.get(prop)
                if not evaluator:
                    continue

                total_properties += 1

                # Agent eval
                agent_pass = evaluator(
                    agent_plan,
                    constraints,
                    init=initial_agent_plan,
                    aff=disruption_data["day_index"] if disruption_data else 0,
                    tname=disruption_data.get("place_name", "")
                    if disruption_data
                    else "",
                )
                if agent_pass:
                    agent_passed_properties += 1

                # Baseline eval
                baseline_pass = evaluator(
                    baseline_plan,
                    constraints,
                    init=initial_baseline_plan,
                    aff=disruption_data["day_index"] if disruption_data else 0,
                    tname=disruption_data.get("place_name", "")
                    if disruption_data
                    else "",
                )
                if baseline_pass:
                    baseline_passed_properties += 1

                fixture_res["properties"].append(
                    {
                        "property": prop,
                        "agent": agent_pass,
                        "baseline": baseline_pass,
                    }
                )

            results.append(fixture_res)

    # OUTPUT RESULTS TABLE
    print("\n" + "-" * 80)
    print(
        f"{'Scenario / Evaluated Property':<48} | {'Agent Loop':<12} | {'Naive Baseline':<14}"
    )
    print("-" * 80)

    for r in results:
        print(f"\n[Scenario] {r['name']}")
        for p in r["properties"]:
            ag_str = "PASS [✓]" if p["agent"] else "FAIL [✗]"
            bl_str = "PASS [✓]" if p["baseline"] else "FAIL [✗]"
            print(f"  • {p['property']:<44} | {ag_str:<12} | {bl_str:<14}")

    agent_rate = (
        (agent_passed_properties / total_properties) * 100 if total_properties else 0
    )
    baseline_rate = (
        (baseline_passed_properties / total_properties) * 100 if total_properties else 0
    )

    print("\n" + "=" * 80)
    print("FINAL EVALUATION METRICS SUMMARY")
    print("=" * 80)
    print(f"Total Property Assertions Evaluated: {total_properties}")
    print(
        f"Iterative Propose-Validate Agent:   {agent_passed_properties}/{total_properties} passed ({agent_rate:.1f}%)"
    )
    print(
        f"Naive Single-Shot Baseline:         {baseline_passed_properties}/{total_properties} passed ({baseline_rate:.1f}%)"
    )
    print(
        f"Absolute Performance Advantage:     +{agent_rate - baseline_rate:.1f}% improvement over baseline"
    )
    print("=" * 80)

    return {
        "total_properties": total_properties,
        "agent_passed": agent_passed_properties,
        "baseline_passed": baseline_passed_properties,
        "agent_rate": agent_rate,
        "baseline_rate": baseline_rate,
        "results": results,
    }


if __name__ == "__main__":
    # CLI evaluation uses only its own in-memory database and deterministic
    # providers. It must not seed the configured application DB or call APIs.
    settings.GEMINI_API_KEY = ""
    settings.GOOGLE_MAPS_API_KEY = ""
    summary = run_evaluation_suite()
    if summary["agent_rate"] < 90.0:
        print("Evaluation benchmark FAILED: Agent pass rate below 90% threshold.")
        sys.exit(1)
    else:
        print("Evaluation benchmark PASSED: Deterministic scenario threshold met.")
        sys.exit(0)
