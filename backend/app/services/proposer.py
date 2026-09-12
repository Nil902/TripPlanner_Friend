"""
LLM and heuristic proposer modules for itinerary generation.
"""

import json
import logging
import time
import uuid
from datetime import date, datetime

import httpx

from app.core.config import settings
from app.models.schema import (
    Constraint,
    Place,
    PlaceResponse,
    Plan,
    PlanDayResponse,
    PlanItemResponse,
    PlanResponse,
    Trip,
)

logger = logging.getLogger(__name__)


def build_day_dates(start_date: date, end_date: date) -> list[date]:
    """Generate list of dates from start_date to end_date inclusive."""
    from datetime import timedelta

    delta = (end_date - start_date).days
    num_days = max(1, delta + 1)
    return [start_date + timedelta(days=i) for i in range(num_days)]


def propose_schedule(
    day_dates: list[date],
    places: list[Place],
    must_sees: list[str],
    replacement_attempts: int,
) -> list[PlanDayResponse]:
    """Propose candidate schedule distributing candidate venues across days."""
    days: list[PlanDayResponse] = []

    # Separate must-see places to guarantee they are prioritized in activity slots
    must_see_pool = [p for p in places if any(ms in p.name.lower() for ms in must_sees)]
    non_must_see_places = [
        p for p in places if not any(ms in p.name.lower() for ms in must_sees)
    ]

    # Shift non-must-sees on retry to diversify
    if replacement_attempts > 0 and len(non_must_see_places) > 2:
        shift = replacement_attempts % len(non_must_see_places)
        non_must_see_places = non_must_see_places[shift:] + non_must_see_places[:shift]

    # Slots: morning sightseeing, lunch, afternoon culture, dinner, evening entertainment
    slots = [
        (
            "09:30",
            "11:30",
            0.0,
            ["landmark", "historic", "sightseeing", "museum", "viewpoint"],
            False,
        ),
        ("12:30", "14:00", 20.0, ["restaurant", "cafe", "market"], True),
        (
            "15:00",
            "17:30",
            15.0,
            ["museum", "entertainment", "park", "culture", "viewpoint"],
            False,
        ),
        ("19:00", "21:00", 30.0, ["restaurant", "cafe", "market"], True),
        (
            "21:30",
            "23:00",
            0.0,
            ["entertainment", "nightlife", "viewpoint", "park", "landmark"],
            False,
        ),
    ]

    remaining_must_sees = list(must_see_pool)
    other_idx = 0

    def pick_place(
        preferred_categories: list[str],
        is_food: bool,
        all_places: list,
        fallback_idx: int,
        day_used_ids: set[str],
        trip_used_ids: set[str],
    ) -> tuple[Place | None, int]:
        """Pick the best place for a slot. Never repeats within a day; prefers trip-fresh venues."""
        # Priority 1: Unallocated must-see venues (for non-food slots)
        if not is_food and remaining_must_sees:
            while (
                remaining_must_sees and remaining_must_sees[0].place_id in day_used_ids
            ):
                remaining_must_sees.pop(0)
            if remaining_must_sees:
                return remaining_must_sees.pop(0), fallback_idx

        # Selection helper: prefer the first trip-fresh venue; only reuse once exhausted
        def select_from(candidates: list[Place]) -> Place | None:
            if not candidates:
                return None
            for p in candidates:
                if p.place_id not in trip_used_ids:
                    return p
            return candidates[0]

        # Priority 2: Preferred category match (never repeats within day)
        preferred = [
            p
            for p in all_places
            if p.category in preferred_categories and p.place_id not in day_used_ids
        ]
        selected = select_from(preferred)
        if selected:
            return selected, fallback_idx + 1

        # Priority 3: Any available place (never repeats within day)
        available = [p for p in all_places if p.place_id not in day_used_ids]
        selected = select_from(available)
        if selected:
            return selected, fallback_idx + 1

        return None, fallback_idx

    trip_used_ids: set[str] = set()
    for d_idx, d_date in enumerate(day_dates):
        day_used_ids: set[str] = set()
        items: list[PlanItemResponse] = []
        for (
            slot_start,
            slot_end,
            default_cost,
            preferred_cats,
            is_food_slot,
        ) in slots:
            selected_place, other_idx = pick_place(
                preferred_cats,
                is_food_slot,
                places,
                other_idx,
                day_used_ids,
                trip_used_ids,
            )

            if not selected_place:
                break

            day_used_ids.add(selected_place.place_id)
            trip_used_ids.add(selected_place.place_id)

            s_h, s_m = map(int, slot_start.split(":"))
            e_h, e_m = map(int, slot_end.split(":"))

            item_start = datetime.combine(d_date, datetime.min.time()).replace(
                hour=s_h, minute=s_m
            )
            item_end = datetime.combine(d_date, datetime.min.time()).replace(
                hour=e_h, minute=e_m
            )

            cost = (
                selected_place.est_cost if selected_place.est_cost > 0 else default_cost
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


def call_gemini_proposer(
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
            prompt_parts.append(f"User Natural Language Instruction: '{instruction}'")

        prompt_parts.append(
            "Generate a realistic and diverse day-by-day schedule.\n\n"
            "CRITICAL RULES:\n"
            "1. Each place_id may appear at most ONCE per day — never repeat the same venue within a day.\n"
            "2. Each day must include at least 3 different non-food activities "
            "(landmarks, museums, parks, viewpoints, cultural sites, entertainment).\n"
            "3. At most 2 food/dining stops per day (lunch and dinner). "
            "The remaining stops must be sightseeing, culture, or entertainment.\n\n"
            "Suggested daily structure:\n"
            "  - Morning (09:30–11:30): sightseeing — landmark, historic site, museum, or viewpoint\n"
            "  - Lunch (12:30–14:00): dining — restaurant, cafe, or food market\n"
            "  - Afternoon (15:00–17:30): culture — museum, park, entertainment, or cultural attraction\n"
            "  - Dinner (19:00–21:00): dining — restaurant or cafe\n"
            "  - Evening (21:30–23:00): entertainment — nightlife, viewpoint, or landmark\n\n"
            "Do NOT fill every slot with restaurants. Spread diverse attractions across the day.\n"
            "Respond strictly with a JSON object:\n"
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

        for attempt in range(3):  # spec 9.3: retry with exponential backoff
            try:
                with httpx.Client(timeout=10.0) as client:
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
                                seen_place_ids: set[str] = set()
                                if match_d:
                                    raw_items = match_d.get("items", [])
                                    for it in raw_items:
                                        if not isinstance(it, dict):
                                            continue
                                        pid = str(it.get("place_id", ""))
                                        if (
                                            pid in place_dict
                                            and pid not in seen_place_ids
                                        ):
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
                                            cost = float(it.get("cost", p_obj.est_cost))
                                            seen_place_ids.add(pid)
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
                # Rate limiting (429) and server errors (5xx) are transient: retry with backoff
                if res.status_code == 429 or 500 <= res.status_code < 600:
                    if attempt < 2:
                        backoff = (2**attempt) * 1.5  # 1.5s, 3s
                        logger.warning(
                            f"Gemini API returned status {res.status_code} on attempt {attempt + 1}; "
                            f"retrying in {backoff:.1f}s..."
                        )
                        time.sleep(backoff)
                        continue
                    break
                # Other status codes (4xx) are permanent errors - do not retry
                logger.warning(
                    f"Gemini API returned non-retryable status {res.status_code} on attempt {attempt + 1}. "
                    "Falling back to heuristic proposer."
                )
                return None
            except httpx.TimeoutException:
                if attempt < 2:
                    backoff = (2**attempt) * 1.5
                    logger.warning(
                        f"Gemini LLM attempt {attempt + 1} timed out; retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                else:
                    logger.warning(
                        "Gemini LLM proposal timed out after 3 attempts. "
                        "Falling back to heuristic proposer."
                    )
            except Exception as exc:
                if attempt < 2:
                    backoff = (2**attempt) * 1.5
                    logger.warning(
                        f"Gemini LLM attempt {attempt + 1} failed ({exc}); retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                else:
                    logger.warning(
                        f"Gemini LLM proposal failed after 3 attempts ({exc}). "
                        "Falling back to heuristic proposer."
                    )
    except Exception as exc:
        logger.warning(
            f"Gemini LLM proposal failed ({exc}). Falling back to heuristic proposer."
        )

    return None


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
