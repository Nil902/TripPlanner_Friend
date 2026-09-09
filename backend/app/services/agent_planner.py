"""
Agent Planning Engine: Propose-Validate-Rebalance Loop.
Implements iterative self-correction using deterministic domain validators.
"""

import json
import logging
import re
import time
import uuid
from datetime import date, datetime, timedelta

import httpx
from sqlmodel import Session, col, select

from app.core.config import settings
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

logger = logging.getLogger(__name__)


def build_day_dates(start_date: date, end_date: date) -> list[date]:
    """Generate list of dates from start_date to end_date inclusive."""
    delta = (end_date - start_date).days
    num_days = max(1, delta + 1)
    return [start_date + timedelta(days=i) for i in range(num_days)]


def create_plan_response(
    plan: Plan,
    days_data: list[PlanDayResponse],
) -> PlanResponse:
    """Helper to convert Plan model and days data to typed PlanResponse."""
    return PlanResponse(
        id=plan.id,
        trip_id=plan.trip_id,
        version=plan.version,
        validation_status=plan.validation_status,
        days=days_data,
        notes=plan.notes or [],
        created_at=plan.created_at,
    )


class AgentPlanner:
    """
    Autonomous Propose-Validate-Rebalance agent loop with deterministic constraint solving.
    """

    MAX_ITERATIONS = 5

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
            proposed_days = cls._call_gemini_proposer(
                trip=trip,
                constraints=constraints,
                places=usable_places,
                day_dates=day_dates,
                feedback=feedback_history,
                instruction=None,
            )

            # Deterministic heuristic fallback when offline, testing, or API key unset
            if not proposed_days:
                proposed_days = cls._propose_schedule(
                    day_dates=day_dates,
                    places=usable_places,
                    must_sees=must_sees,
                    replacement_attempts=replacement_attempts,
                )

            # Validate proposed candidate
            budget_issues = check_budget(proposed_days, constraints, budget_tolerance)
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
            feedback_history.extend(reasons)
            notes.append(
                f"Iteration {iteration} rejected by validators: {'; '.join(reasons)}. "
                "Self-correcting candidate itinerary..."
            )
            replacement_attempts += 1

        # 3. Fallback / Constraint Relaxation if max iterations reached (spec Section 9.2)
        if best_issues_count > 0:
            budget_tolerance = 0.15  # Relax budget by 15%
            # Run ONE extra propose+validate pass with relaxed budget
            relaxed_days = cls._call_gemini_proposer(
                trip=trip,
                constraints=constraints,
                places=usable_places,
                day_dates=day_dates,
                feedback=feedback_history,
                instruction=None,
            ) or cls._propose_schedule(
                day_dates=day_dates,
                places=usable_places,
                must_sees=must_sees,
                replacement_attempts=replacement_attempts,
            )
            relaxed_errors = [
                i
                for i in check_budget(relaxed_days, constraints, budget_tolerance)
                + check_travel_time(relaxed_days)
                + check_open_hours(relaxed_days)
                if i.severity == "error"
            ]
            if len(relaxed_errors) < best_issues_count:
                best_days = relaxed_days
            status = ValidationStatus.PARTIAL
            notes.append(
                "Reached maximum iterations (5). Applied Section 9.2 Constraint Relaxation: "
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
        # Fetch existing plan items
        existing_items = session.exec(
            select(PlanItem).where(PlanItem.plan_id == current_plan.id)
        ).all()

        day_dates = build_day_dates(trip.start_date, trip.end_date)

        notes = list(current_plan.notes or [])
        notes.append(
            f"Dynamic Rebalance Triggered: {disruption.type.value} on Day {disruption.day_index + 1}. "
            f"Details: {disruption.description or 'Schedule disruption'}."
        )

        new_plan = Plan(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            version=current_plan.version + 1,
            validation_status=ValidationStatus.VALID,
            notes=notes,
            created_at=utc_now(),
        )
        session.add(new_plan)
        session.commit()
        session.refresh(new_plan)

        persisted_days: list[PlanDayResponse] = []

        for d_idx, d_date in enumerate(day_dates):
            items_for_day = [it for it in existing_items if it.day_index == d_idx]
            items_for_day.sort(key=lambda x: x.start_time)
            day_responses: list[PlanItemResponse] = []

            if d_idx != disruption.day_index:
                # UNAFFECTED DAY: Copy verbatim
                for it in items_for_day:
                    place = session.get(Place, it.place_id)
                    place_resp = PlaceResponse.model_validate(place) if place else None
                    new_item = PlanItem(
                        id=str(uuid.uuid4()),
                        plan_id=new_plan.id,
                        place_id=it.place_id,
                        day_index=d_idx,
                        start_time=it.start_time,
                        end_time=it.end_time,
                        cost=it.cost,
                    )
                    session.add(new_item)
                    day_responses.append(
                        PlanItemResponse(
                            id=new_item.id,
                            place_id=it.place_id,
                            place=place_resp,
                            day_index=d_idx,
                            start_time=it.start_time,
                            end_time=it.end_time,
                            cost=it.cost,
                        )
                    )
            else:
                # AFFECTED DAY: Rebalance only the impacted items
                notes.append(
                    f"Isolating Day {d_idx + 1} schedule for local rebalance..."
                )
                delay_offset = timedelta(minutes=disruption.delay_minutes or 60)

                for it in items_for_day:
                    place = session.get(Place, it.place_id)
                    should_replace = disruption.place_id == it.place_id or (
                        disruption.type == DisruptionType.VENUE_CLOSED
                        and disruption.place_id is None
                    )

                    target_place: Place | None = place
                    if should_replace and place:
                        # Find alternative venue
                        alt = find_alternative_place(
                            session=session,
                            current_place=place,
                            destination=trip.destination,
                            max_cost=it.cost + 10.0,
                            excluded_place_ids=[it.place_id],
                        )
                        target_place = alt if alt else place
                        notes.append(
                            f"Substituted closed venue '{place.name}' with alternative '{target_place.name}'."
                        )
                        start_t = it.start_time
                        end_t = it.end_time
                    elif disruption.type.value == "flight_delayed":
                        target_place = place
                        # Shift time forward
                        start_t = it.start_time + delay_offset
                        end_t = it.end_time + delay_offset
                    else:
                        target_place = place
                        start_t = it.start_time
                        end_t = it.end_time

                    place_resp = (
                        PlaceResponse.model_validate(target_place)
                        if target_place
                        else None
                    )
                    new_item = PlanItem(
                        id=str(uuid.uuid4()),
                        plan_id=new_plan.id,
                        place_id=target_place.place_id if target_place else it.place_id,
                        day_index=d_idx,
                        start_time=start_t,
                        end_time=end_t,
                        cost=target_place.est_cost if target_place else it.cost,
                    )
                    session.add(new_item)
                    day_responses.append(
                        PlanItemResponse(
                            id=new_item.id,
                            place_id=new_item.place_id,
                            place=place_resp,
                            day_index=d_idx,
                            start_time=start_t,
                            end_time=end_t,
                            cost=new_item.cost,
                        )
                    )

            persisted_days.append(
                PlanDayResponse(
                    date=d_date,
                    day_index=d_idx,
                    items=day_responses,
                )
            )

        session.commit()
        return create_plan_response(new_plan, persisted_days)

    @classmethod
    def _propose_schedule(
        cls,
        day_dates: list[date],
        places: list[Place],
        must_sees: list[str],
        replacement_attempts: int,
    ) -> list[PlanDayResponse]:
        """Propose candidate schedule distributing candidate venues across days."""
        days: list[PlanDayResponse] = []

        # Separate must-see places to guarantee they are prioritized in activity slots
        must_see_pool = [
            p for p in places if any(ms in p.name.lower() for ms in must_sees)
        ]
        non_must_see_places = [
            p for p in places if not any(ms in p.name.lower() for ms in must_sees)
        ]

        # Shift non-must-sees on retry to diversify
        if replacement_attempts > 0 and len(non_must_see_places) > 2:
            shift = replacement_attempts % len(non_must_see_places)
            non_must_see_places = (
                non_must_see_places[shift:] + non_must_see_places[:shift]
            )

        slots = [
            ("09:30", "11:30", 0.0),  # Morning activity
            ("12:30", "14:00", 20.0),  # Lunch
            ("15:00", "17:30", 15.0),  # Afternoon attraction
            ("19:00", "21:00", 30.0),  # Dinner / Evening
        ]

        remaining_must_sees = list(must_see_pool)
        other_idx = 0

        for d_idx, d_date in enumerate(day_dates):
            items: list[PlanItemResponse] = []
            for slot_start, slot_end, default_cost in slots:
                is_food_slot = slot_start in ("12:30", "19:00")
                selected_place: Place | None = None

                if is_food_slot:
                    # Find food venue
                    food_candidates = [
                        p
                        for p in places
                        if p.category in ("restaurant", "cafe", "market")
                    ]
                    if food_candidates:
                        selected_place = food_candidates[
                            other_idx % len(food_candidates)
                        ]
                        other_idx += 1
                    else:
                        selected_place = (
                            places[other_idx % len(places)] if places else None
                        )
                        other_idx += 1
                else:
                    # Priority 1: Unallocated must-see venues
                    if remaining_must_sees:
                        selected_place = remaining_must_sees.pop(0)
                    elif non_must_see_places:
                        selected_place = non_must_see_places[
                            other_idx % len(non_must_see_places)
                        ]
                        other_idx += 1
                    elif places:
                        selected_place = places[other_idx % len(places)]
                        other_idx += 1
                    else:
                        selected_place = None

                if not selected_place:
                    break

                s_h, s_m = map(int, slot_start.split(":"))
                e_h, e_m = map(int, slot_end.split(":"))

                item_start = datetime.combine(d_date, datetime.min.time()).replace(
                    hour=s_h, minute=s_m
                )
                item_end = datetime.combine(d_date, datetime.min.time()).replace(
                    hour=e_h, minute=e_m
                )

                cost = (
                    selected_place.est_cost
                    if selected_place.est_cost > 0
                    else default_cost
                )

                items.append(
                    PlanItemResponse(
                        id=str(uuid.uuid4()),
                        place_id=selected_place.place_id,
                        place=PlaceResponse.model_validate(selected_place),
                        day_index=d_idx,
                        start_time=item_start,
                        end_time=item_end,
                        cost=cost,
                    )
                )

            days.append(
                PlanDayResponse(
                    date=d_date,
                    day_index=d_idx,
                    items=items,
                )
            )

        return days

    @classmethod
    def _call_gemini_proposer(
        cls,
        trip: Trip,
        constraints: list[Constraint],
        places: list[Place],
        day_dates: list[date],
        feedback: list[str],
        instruction: str | None = None,
    ) -> list[PlanDayResponse] | None:
        """Call Google Gemini to propose a structured itinerary schedule."""
        if not settings.GEMINI_API_KEY:
            return None

        try:
            place_dict = {p.place_id: p for p in places}
            places_summary = [
                {
                    "place_id": p.place_id,
                    "name": p.name,
                    "category": p.category,
                    "est_cost": p.est_cost,
                    "lat": p.lat,
                    "lng": p.lng,
                }
                for p in places
            ]

            constraints_summary = [
                {
                    "user_id": c.user_id,
                    "budget_per_day": c.budget_per_day,
                    "dietary": c.dietary,
                    "style_tags": c.style_tags,
                    "must_see": c.must_see,
                    "must_avoid": c.must_avoid,
                }
                for c in constraints
            ]

            prompt_parts = [
                "You are an autonomous AI travel planning agent.",
                f"Destination: {trip.destination}",
                f"Trip Dates: {[d.isoformat() for d in day_dates]}",
                f"Candidate Places Pool: {json.dumps(places_summary)}",
                f"Group Member Constraints: {json.dumps(constraints_summary)}",
            ]

            if feedback:
                prompt_parts.append(
                    "Deterministic Validation Failures from previous candidate to fix:\n"
                    + "\n".join(f"- {f}" for f in feedback)
                )

            if instruction:
                prompt_parts.append(
                    f"User Natural Language Instruction: '{instruction}'"
                )

            prompt_parts.append(
                "Generate a realistic schedule. Respond strictly with a JSON object:\n"
                "{\n"
                '  "days": [\n'
                "    {\n"
                '      "day_index": 0,\n'
                '      "items": [\n'
                '        {"place_id": "...", "start_time": "YYYY-MM-DDTHH:MM:SS", "end_time": "YYYY-MM-DDTHH:MM:SS", "cost": 15.0}\n'
                "      ]\n"
                "    }\n"
                "  ]\n"
                "}\n"
                "Use only valid place_ids from the Candidate Places Pool."
            )

            full_prompt = "\n\n".join(prompt_parts)
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{settings.LLM_MODEL_NAME}:generateContent?key={settings.GEMINI_API_KEY}"
            )
            payload = {
                "contents": [{"parts": [{"text": full_prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.2,
                },
            }

            for attempt in range(2):  # spec 9.3: retry once with backoff
                try:
                    with httpx.Client(timeout=5.0) as client:
                        res = client.post(url, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            raw_text = (
                                candidates[0]
                                .get("content", {})
                                .get("parts", [{}])[0]
                                .get("text", "")
                            )
                            parsed = json.loads(raw_text)
                            parsed_days = parsed.get("days", [])
                            if parsed_days and isinstance(parsed_days, list):
                                result_days: list[PlanDayResponse] = []
                                for d_idx, d_date in enumerate(day_dates):
                                    match_d = next(
                                        (
                                            d
                                            for d in parsed_days
                                            if isinstance(d, dict)
                                            and d.get("day_index") == d_idx
                                        ),
                                        None,
                                    )
                                    items: list[PlanItemResponse] = []
                                    if match_d:
                                        raw_items = match_d.get("items", [])
                                        for it in raw_items:
                                            if not isinstance(it, dict):
                                                continue
                                            pid = str(it.get("place_id", ""))
                                            if pid in place_dict:
                                                p_obj = place_dict[pid]
                                                try:
                                                    st = datetime.fromisoformat(
                                                        str(it.get("start_time"))
                                                    )
                                                    et = datetime.fromisoformat(
                                                        str(it.get("end_time"))
                                                    )
                                                except Exception:
                                                    st = datetime.combine(
                                                        d_date, datetime.min.time()
                                                    ).replace(hour=10)
                                                    et = datetime.combine(
                                                        d_date, datetime.min.time()
                                                    ).replace(hour=12)
                                                cost = float(
                                                    it.get("cost", p_obj.est_cost)
                                                )
                                                items.append(
                                                    PlanItemResponse(
                                                        id=str(uuid.uuid4()),
                                                        place_id=pid,
                                                        place=PlaceResponse.model_validate(
                                                            p_obj
                                                        ),
                                                        day_index=d_idx,
                                                        start_time=st,
                                                        end_time=et,
                                                        cost=cost,
                                                    )
                                                )
                                    result_days.append(
                                        PlanDayResponse(
                                            date=d_date,
                                            day_index=d_idx,
                                            items=items,
                                        )
                                    )
                                total_items = sum(len(d.items) for d in result_days)
                                if total_items > 0:
                                    return result_days
                    # Non-200 or empty result — retry if first attempt
                    if attempt == 0:
                        logger.warning(
                            f"Gemini API returned status {res.status_code} on attempt 1; retrying..."
                        )
                        time.sleep(1.0)
                except Exception as exc:
                    if attempt == 0:
                        logger.warning(
                            f"Gemini LLM attempt 1 failed ({exc}); retrying..."
                        )
                        time.sleep(1.0)
                    else:
                        logger.warning(
                            f"Gemini LLM proposal failed after 2 attempts ({exc}). "
                            "Falling back to heuristic proposer."
                        )
        except Exception as exc:
            logger.warning(
                f"Gemini LLM proposal failed ({exc}). Falling back to heuristic proposer."
            )

        return None

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
        refined_days = cls._call_gemini_proposer(
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
                                excluded_place_ids=[it.place_id],
                            )
                            chosen = alt if alt else p_obj
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

        # Validate refined plan
        budget_issues = check_budget(refined_days, list(constraints))
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
