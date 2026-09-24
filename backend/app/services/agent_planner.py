"""
Agent Planning Engine: Propose-Validate-Rebalance Loop.
Implements iterative self-correction using deterministic domain validators.
"""

import logging
import re
import uuid
from datetime import datetime

from sqlmodel import Session, col, select

from app.core.config import settings
from app.models.schema import (
    Constraint,
    DisruptionEvent,
    Place,
    PlaceResponse,
    Plan,
    PlanDayResponse,
    PlanItem,
    PlanItemResponse,
    PlanResponse,
    Trip,
    ValidationStatus,
    utc_now,
)
from app.services.places_service import (
    find_alternative_place,
    get_or_create_places_for_destination,
)
from app.validators.budget_validator import check_budget
from app.validators.open_hours_validator import check_open_hours
from app.validators.travel_validator import check_travel_time

from .proposer import (
    build_day_dates,
    call_gemini_proposer,
    create_plan_response,
    enforce_schedule_uniqueness,
    propose_schedule,
)
from .rebalancer import rebalance

logger = logging.getLogger(__name__)

# UUID pattern used to de-identify machine-generated validator messages
_UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def clean_issue_message(reason: str) -> str:
    """Strip machine identifiers from a validator issue for human-readable notes."""
    return _UUID_PATTERN.sub("group member", reason)


class AgentPlanner:
    """
    Autonomous Propose-Validate-Rebalance agent loop with deterministic constraint solving.
    """

    MAX_ITERATIONS = settings.MAX_PLANNER_ITERATIONS

    @classmethod
    def generate_plan(
        cls,
        session: Session,
        trip: Trip,
        constraints: list[Constraint],
    ) -> PlanResponse:
        """
        Executes the propose -> validate -> self-correct loop.
        """
        day_dates = build_day_dates(trip.start_date, trip.end_date)

        # 1. Gather candidate places
        candidate_places = get_or_create_places_for_destination(
            session, trip.destination
        )

        # Aggregate constraints
        must_avoids = set()
        must_sees = []
        for c in constraints:
            for avoid in c.must_avoid:
                must_avoids.add(avoid.lower().strip())
            for see in c.must_see:
                must_sees.append(see.lower().strip())

        # Filter out must-avoids
        usable_places = [
            p
            for p in candidate_places
            if not any(
                avoid in p.name.lower() or avoid in p.category.lower()
                for avoid in must_avoids
            )
        ]
        if not usable_places:
            usable_places = candidate_places

        # 2. Iterative Propose-Validate Loop
        notes: list[str] = []
        feedback_history: list[str] = []
        best_days: list[PlanDayResponse] = []
        best_issues_count = 9999
        status = ValidationStatus.VALID

        # Initial allocation strategy parameters
        budget_tolerance = 0.0
        replacement_attempts = 0

        for iteration in range(1, cls.MAX_ITERATIONS + 1):
            notes.append(f"Iteration {iteration}: Proposing candidate schedule...")

            # Attempt structured LLM planning if GEMINI_API_KEY is available
            proposed_days = call_gemini_proposer(
                trip=trip,
                constraints=constraints,
                places=usable_places,
                day_dates=day_dates,
                feedback=feedback_history,
                instruction=None,
            )

            # Deterministic heuristic fallback when offline, testing, or API key unset
            if not proposed_days:
                proposed_days = propose_schedule(
                    day_dates=day_dates,
                    places=usable_places,
                    must_sees=must_sees,
                    replacement_attempts=replacement_attempts,
                )

            # Hard trip-wide guarantee: never schedule the same venue at the same
            # time twice, and prefer unique venues across the whole trip.
            proposed_days = enforce_schedule_uniqueness(proposed_days, usable_places)

            # Validate proposed candidate
            budget_issues = check_budget(
                proposed_days,
                constraints,
                budget_tolerance,
                num_members=len(constraints),
            )
            travel_issues = check_travel_time(proposed_days)
            hours_issues = check_open_hours(proposed_days)

            all_issues = budget_issues + travel_issues + hours_issues
            error_issues = [i for i in all_issues if i.severity == "error"]

            if len(error_issues) < best_issues_count:
                best_issues_count = len(error_issues)
                best_days = proposed_days

            if not error_issues:
                notes.append(
                    f"Iteration {iteration}: All deterministic validations passed strictly "
                    f"({len(budget_issues)} budget warnings, {len(travel_issues)} travel warnings)."
                )
                status = ValidationStatus.VALID
                break

            # Feedback to self-correct in next iteration
            reasons = [f"[{i.type}] {i.message}" for i in error_issues[:3]]
            feedback_history.extend(clean_issue_message(r) for r in reasons)
            notes.append(
                f"Iteration {iteration}: Validators rejected candidate itinerary with "
                f"{len(reasons)} issue(s). Repairing next iteration..."
            )
            for reason in reasons:
                notes.append(f"  - {clean_issue_message(reason)}")
            replacement_attempts += 1

        # 3. Fallback / Constraint Relaxation if max iterations reached (spec Section 9.2)
        if best_issues_count > 0:
            budget_tolerance = 0.15  # Relax budget by 15%
            # Run ONE extra propose+validate pass with relaxed budget
            relaxed_days = call_gemini_proposer(
                trip=trip,
                constraints=constraints,
                places=usable_places,
                day_dates=day_dates,
                feedback=feedback_history,
                instruction=None,
            ) or propose_schedule(
                day_dates=day_dates,
                places=usable_places,
                must_sees=must_sees,
                replacement_attempts=replacement_attempts,
            )
            relaxed_days = enforce_schedule_uniqueness(relaxed_days, usable_places)
            relaxed_errors = [
                i
                for i in check_budget(
                    relaxed_days,
                    constraints,
                    budget_tolerance,
                    num_members=len(constraints),
                )
                + check_travel_time(relaxed_days)
                + check_open_hours(relaxed_days)
                if i.severity == "error"
            ]
            if len(relaxed_errors) < best_issues_count:
                best_days = relaxed_days
            # Only mark PARTIAL if errors remain after relaxation; otherwise the plan is VALID
            status = (
                ValidationStatus.VALID if not relaxed_errors else ValidationStatus.PARTIAL
            )
            notes.append(
                f"Reached maximum iterations ({cls.MAX_ITERATIONS}). Applied Section 9.2 Constraint Relaxation: "
                "Relaxed daily budget cap by 15% to preserve must-see attractions without dropping key venues."
            )

        # 4. Persist Plan & PlanItems in Database
        existing_plans = session.exec(
            select(Plan)
            .where(Plan.trip_id == trip.id)
            .order_by(col(Plan.version).desc())
        ).all()
        next_version = (existing_plans[0].version + 1) if existing_plans else 1

        new_plan = Plan(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            version=next_version,
            validation_status=status,
            notes=notes,
            created_at=utc_now(),
        )
        session.add(new_plan)
        session.commit()
        session.refresh(new_plan)

        # Persist items
        persisted_days: list[PlanDayResponse] = []
        for day in best_days:
            day_items: list[PlanItemResponse] = []
            for item in day.items:
                db_item = PlanItem(
                    id=str(uuid.uuid4()),
                    plan_id=new_plan.id,
                    place_id=item.place_id,
                    day_index=day.day_index,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    cost=item.cost,
                )
                session.add(db_item)
                day_items.append(
                    PlanItemResponse(
                        id=db_item.id,
                        place_id=item.place_id,
                        place=item.place,
                        day_index=day.day_index,
                        start_time=item.start_time,
                        end_time=item.end_time,
                        cost=item.cost,
                    )
                )
            persisted_days.append(
                PlanDayResponse(
                    date=day.date,
                    day_index=day.day_index,
                    items=day_items,
                )
            )

        session.commit()
        return create_plan_response(new_plan, persisted_days)

    @classmethod
    def rebalance(
        cls,
        session: Session,
        trip: Trip,
        current_plan: Plan,
        disruption: DisruptionEvent,
    ) -> PlanResponse:
        """
        Dynamically rebalances only the affected time window / day while holding
        unaffected days fixed, incrementing Plan.version to preserve history.
        """
        return rebalance(session, trip, current_plan, disruption)

    @classmethod
    def refine_plan(
        cls,
        session: Session,
        trip: Trip,
        current_plan: Plan,
        instruction: str,
        user_id: str | None = None,
    ) -> PlanResponse:
        """
        Applies natural-language feedback to re-balance the plan,
        incrementing Plan.version to preserve audit history.
        """
        existing_items = session.exec(
            select(PlanItem).where(PlanItem.plan_id == current_plan.id)
        ).all()
        constraints = session.exec(
            select(Constraint).where(Constraint.trip_id == trip.id)
        ).all()
        day_dates = build_day_dates(trip.start_date, trip.end_date)
        candidate_places = get_or_create_places_for_destination(
            session, trip.destination
        )

        notes = list(current_plan.notes or [])
        notes.append(f"Refinement requested by user: '{instruction}'")

        # Attempt LLM refinement first
        refined_days = call_gemini_proposer(
            trip=trip,
            constraints=list(constraints),
            places=candidate_places,
            day_dates=day_dates,
            feedback=[],
            instruction=instruction,
        )

        # Fallback to heuristic modification
        if not refined_days:
            refined_days = []
            inst_lower = instruction.lower()

            target_day_match = re.search(r"day\s+(\d+)", inst_lower)
            target_day_idx = (
                (int(target_day_match.group(1)) - 1) if target_day_match else None
            )

            for d_idx, d_date in enumerate(day_dates):
                items_for_day = [it for it in existing_items if it.day_index == d_idx]
                items_for_day.sort(key=lambda x: x.start_time)
                new_day_items: list[PlanItemResponse] = []

                is_target = target_day_idx is None or target_day_idx == d_idx

                if is_target and any(
                    w in inst_lower for w in ("relaxed", "slower", "less", "easy")
                ):
                    kept_items = (
                        items_for_day[:2] if len(items_for_day) > 2 else items_for_day
                    )
                    notes.append(
                        f"Day {d_idx + 1}: Paced down schedule from {len(items_for_day)} to {len(kept_items)} stops with wider transit buffers."
                    )
                    for k_idx, it in enumerate(kept_items):
                        p_obj = session.get(Place, it.place_id)
                        p_resp = PlaceResponse.model_validate(p_obj) if p_obj else None
                        st = datetime.combine(d_date, datetime.min.time()).replace(
                            hour=10 + (k_idx * 4), minute=0
                        )
                        et = datetime.combine(d_date, datetime.min.time()).replace(
                            hour=12 + (k_idx * 4), minute=30
                        )
                        new_day_items.append(
                            PlanItemResponse(
                                id=str(uuid.uuid4()),
                                place_id=it.place_id,
                                place=p_resp,
                                day_index=d_idx,
                                start_time=st,
                                end_time=et,
                                cost=it.cost,
                            )
                        )
                elif is_target and any(
                    w in inst_lower
                    for w in (
                        "seafood",
                        "fish",
                        "restaurant",
                        "lunch",
                        "dinner",
                        "food",
                        "budget",
                        "cheap",
                    )
                ):
                    allocated_ids: set[str] = set()
                    for it in items_for_day:
                        p_obj = session.get(Place, it.place_id)
                        if p_obj and (
                            p_obj.category in ("restaurant", "cafe", "market")
                            or "lunch" in inst_lower
                            or "dinner" in inst_lower
                        ):
                            alt = find_alternative_place(
                                session=session,
                                current_place=p_obj,
                                destination=trip.destination,
                                max_cost=30.0 if "30" in inst_lower else 40.0,
                                excluded_place_ids=list(allocated_ids | {it.place_id}),
                            )
                            chosen = alt if alt else p_obj
                            allocated_ids.add(chosen.place_id)
                            notes.append(
                                f"Day {d_idx + 1}: Adjusted dining venue to '{chosen.name}' (${chosen.est_cost:.2f}) to fulfill dietary/cost preference."
                            )
                            new_day_items.append(
                                PlanItemResponse(
                                    id=str(uuid.uuid4()),
                                    place_id=chosen.place_id,
                                    place=PlaceResponse.model_validate(chosen),
                                    day_index=d_idx,
                                    start_time=it.start_time,
                                    end_time=it.end_time,
                                    cost=chosen.est_cost,
                                )
                            )
                        else:
                            new_day_items.append(
                                PlanItemResponse(
                                    id=str(uuid.uuid4()),
                                    place_id=it.place_id,
                                    place=PlaceResponse.model_validate(p_obj)
                                    if p_obj
                                    else None,
                                    day_index=d_idx,
                                    start_time=it.start_time,
                                    end_time=it.end_time,
                                    cost=it.cost,
                                )
                            )
                elif is_target and any(
                    w in inst_lower
                    for w in (
                        "entertainment",
                        "nightlife",
                        "party",
                        "club",
                        "bar",
                        "music",
                        "show",
                        "sightseeing",
                        "sight",
                        "view",
                        "viewpoint",
                        "sunset",
                        "museum",
                        "gallery",
                        "culture",
                        "landmark",
                        "attraction",
                        "art",
                        "historic",
                        "park",
                    )
                ):
                    is_nightlife = any(
                        w in inst_lower
                        for w in (
                            "nightlife",
                            "evening",
                            "bar",
                            "club",
                            "party",
                            "music",
                        )
                    )
                    is_museum_art = any(
                        w in inst_lower for w in ("museum", "gallery", "art", "exhibit")
                    )
                    is_viewpoint = any(
                        w in inst_lower
                        for w in ("view", "viewpoint", "sunset", "scenic")
                    )

                    target_cats = (
                        ("entertainment", "bar", "culture")
                        if is_nightlife
                        else ("museum", "art")
                        if is_museum_art
                        else ("viewpoint", "park")
                        if is_viewpoint
                        else (
                            "entertainment",
                            "landmark",
                            "museum",
                            "viewpoint",
                            "historic",
                            "culture",
                            "park",
                        )
                    )

                    matching_places = [
                        p for p in candidate_places if p.category in target_cats
                    ]
                    if not matching_places:
                        matching_places = [
                            p
                            for p in candidate_places
                            if p.category not in ("restaurant", "cafe")
                        ]
                    if not matching_places:
                        matching_places = candidate_places

                    used_place_ids = {it.place_id for it in items_for_day}
                    unused_matches = [
                        p for p in matching_places if p.place_id not in used_place_ids
                    ]
                    chosen_place = (
                        unused_matches[0]
                        if unused_matches
                        else matching_places[0]
                        if matching_places
                        else None
                    )

                    if chosen_place and items_for_day:
                        replace_idx = (
                            len(items_for_day) - 1
                            if is_nightlife
                            else min(2, len(items_for_day) - 1)
                        )
                        for idx, it in enumerate(items_for_day):
                            if idx == replace_idx:
                                notes.append(
                                    f"Day {d_idx + 1}: Added {chosen_place.category} venue '{chosen_place.name}' (${chosen_place.est_cost:.2f}) to fulfill user request: '{instruction}'."
                                )
                                new_day_items.append(
                                    PlanItemResponse(
                                        id=str(uuid.uuid4()),
                                        place_id=chosen_place.place_id,
                                        place=PlaceResponse.model_validate(
                                            chosen_place
                                        ),
                                        day_index=d_idx,
                                        start_time=it.start_time,
                                        end_time=it.end_time,
                                        cost=chosen_place.est_cost,
                                    )
                                )
                            else:
                                p_obj = session.get(Place, it.place_id)
                                new_day_items.append(
                                    PlanItemResponse(
                                        id=str(uuid.uuid4()),
                                        place_id=it.place_id,
                                        place=PlaceResponse.model_validate(p_obj)
                                        if p_obj
                                        else None,
                                        day_index=d_idx,
                                        start_time=it.start_time,
                                        end_time=it.end_time,
                                        cost=it.cost,
                                    )
                                )
                    elif chosen_place:
                        st = datetime.combine(d_date, datetime.min.time()).replace(
                            hour=15, minute=0
                        )
                        et = datetime.combine(d_date, datetime.min.time()).replace(
                            hour=17, minute=30
                        )
                        notes.append(
                            f"Day {d_idx + 1}: Added {chosen_place.category} venue '{chosen_place.name}' (${chosen_place.est_cost:.2f})."
                        )
                        new_day_items.append(
                            PlanItemResponse(
                                id=str(uuid.uuid4()),
                                place_id=chosen_place.place_id,
                                place=PlaceResponse.model_validate(chosen_place),
                                day_index=d_idx,
                                start_time=st,
                                end_time=et,
                                cost=chosen_place.est_cost,
                            )
                        )
                    else:
                        for it in items_for_day:
                            p_obj = session.get(Place, it.place_id)
                            new_day_items.append(
                                PlanItemResponse(
                                    id=str(uuid.uuid4()),
                                    place_id=it.place_id,
                                    place=PlaceResponse.model_validate(p_obj)
                                    if p_obj
                                    else None,
                                    day_index=d_idx,
                                    start_time=it.start_time,
                                    end_time=it.end_time,
                                    cost=it.cost,
                                )
                            )
                else:
                    for it in items_for_day:
                        p_obj = session.get(Place, it.place_id)
                        new_day_items.append(
                            PlanItemResponse(
                                id=str(uuid.uuid4()),
                                place_id=it.place_id,
                                place=PlaceResponse.model_validate(p_obj)
                                if p_obj
                                else None,
                                day_index=d_idx,
                                start_time=it.start_time,
                                end_time=it.end_time,
                                cost=it.cost,
                            )
                        )

                refined_days.append(
                    PlanDayResponse(
                        date=d_date,
                        day_index=d_idx,
                        items=new_day_items,
                    )
                )

        # Enforce trip-wide uniqueness before validation
        refined_days = enforce_schedule_uniqueness(refined_days, candidate_places)

        # Validate refined plan
        budget_issues = check_budget(
            refined_days, list(constraints), num_members=len(constraints)
        )
        travel_issues = check_travel_time(refined_days)
        hours_issues = check_open_hours(refined_days)
        all_issues = budget_issues + travel_issues + hours_issues
        has_errors = any(i.severity == "error" for i in all_issues)
        v_status = ValidationStatus.INVALID if has_errors else ValidationStatus.VALID

        new_plan = Plan(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            version=current_plan.version + 1,
            validation_status=v_status,
            notes=notes,
            created_at=utc_now(),
        )
        session.add(new_plan)
        session.commit()
        session.refresh(new_plan)

        persisted_days: list[PlanDayResponse] = []
        for d in refined_days:
            persisted_items: list[PlanItemResponse] = []
            for item in d.items:
                db_item = PlanItem(
                    id=str(uuid.uuid4()),
                    plan_id=new_plan.id,
                    place_id=item.place_id,
                    day_index=d.day_index,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    cost=item.cost,
                )
                session.add(db_item)
                persisted_items.append(
                    PlanItemResponse(
                        id=db_item.id,
                        place_id=item.place_id,
                        place=item.place,
                        day_index=d.day_index,
                        start_time=item.start_time,
                        end_time=item.end_time,
                        cost=item.cost,
                    )
                )
            persisted_days.append(
                PlanDayResponse(
                    date=d.date,
                    day_index=d.day_index,
                    items=persisted_items,
                )
            )

        session.commit()
        return create_plan_response(new_plan, persisted_days)

    @classmethod
    def generate_ics_calendar(
        cls,
        session: Session,
        trip: Trip,
        plan: Plan,
    ) -> str:
        """Generates RFC 5545 iCalendar content for the trip schedule."""
        plan_items = session.exec(
            select(PlanItem)
            .where(PlanItem.plan_id == plan.id)
            .order_by(col(PlanItem.start_time).asc())
        ).all()

        now_utc = utc_now().strftime("%Y%m%dT%H%M%SZ")
        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Autonomous Travel Coordinator//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            f"X-WR-CALNAME:{trip.title} Itinerary",
            "X-WR-TIMEZONE:UTC",
        ]

        for item in plan_items:
            place = session.get(Place, item.place_id)
            place_name = place.name if place else "Scheduled Activity"
            category = place.category if place else "general"

            dtstart = item.start_time.strftime("%Y%m%dT%H%M%SZ")
            dtend = item.end_time.strftime("%Y%m%dT%H%M%SZ")
            uid = f"{item.id}@travelcoordinator.app"
            summary = place_name
            location = f"{place_name}, {trip.destination}"
            description = (
                f"Itinerary stop for {trip.title} (Day {item.day_index + 1}). "
                f"Category: {category}. Est. Cost: ${item.cost:.2f}."
            )

            lines.extend(
                [
                    "BEGIN:VEVENT",
                    f"UID:{uid}",
                    f"DTSTAMP:{now_utc}",
                    f"DTSTART:{dtstart}",
                    f"DTEND:{dtend}",
                    f"SUMMARY:{summary}",
                    f"LOCATION:{location}",
                    f"DESCRIPTION:{description}",
                    "STATUS:CONFIRMED",
                    "END:VEVENT",
                ]
            )

        lines.append("END:VCALENDAR")
        return "\r\n".join(lines) + "\r\n"
