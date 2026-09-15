"""
LLM and heuristic proposer modules for itinerary generation.
"""

import json
import logging
import time
import uuid
from datetime import date, datetime, timedelta

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

FOOD_CATEGORIES = {"restaurant", "cafe", "market"}


def build_day_dates(start_date: date, end_date: date) -> list[date]:
    """Generate list of dates from start_date to end_date inclusive."""

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

        # Build a numbered catalogue so the model can reference venues clearly
        catalogue_lines = []
        for i, p in enumerate(places):
            catalogue_lines.append(
                f"  [{i + 1}] place_id={p.place_id} | {p.name} | "
                f"category={p.category} | est_cost=${p.est_cost:.2f} | "
                f"lat={p.lat} lng={p.lng}"
            )
        catalogue_text = "\n".join(catalogue_lines)
        total_days = len(day_dates)
        total_places = len(places)

        # Collect already-used place_ids from feedback so the model can avoid them
        used_ids_note = ""
        if feedback:
            used_ids_note = (
                "\n\nDeterministic Validation Failures from previous candidate — fix these:\n"
                + "\n".join(f"  - {f}" for f in feedback)
            )

        instruction_note = ""
        if instruction:
            instruction_note = f"\n\nUser Natural Language Instruction: '{instruction}'"

        prompt_parts = [
            "You are an autonomous AI travel planning agent. Your job is to output a "
            "realistic, diverse, duplicate-free day-by-day itinerary in strict JSON format.",
            f"Destination: {trip.destination}",
            f"Trip duration: {total_days} day(s) — dates: {[d.isoformat() for d in day_dates]}",
            f"Group Member Constraints:\n{json.dumps(constraints_summary, indent=2)}",
            f"Candidate Places Catalogue ({total_places} venues total):\n{catalogue_text}"
            + used_ids_note
            + instruction_note,
        ]

        num_slots_per_day = min(5, max(3, total_places // max(total_days, 1)))
        prompt_parts.append(
            "════════════════════════════════════════\n"
            "HARD CONSTRAINTS — violating any of these makes the output invalid:\n"
            "════════════════════════════════════════\n"
            f"HC-1  NO CROSS-DAY REPEATS: Each place_id MUST appear at most ONCE across "
            f"ALL {total_days} days combined. "
            "If you run out of unique venues before filling all slots, REDUCE the number "
            "of stops for that day. NEVER reuse a place_id.\n"
            "HC-2  NO WITHIN-DAY REPEATS: Each day's items list must contain distinct place_ids.\n"
            "HC-3  NO TIME COLLISIONS: No two items on the same day may share the same start_time.\n"
            "HC-4  FOOD CAP: At most 2 food/dining stops per day (one lunch, one dinner). "
            "Categories that count as food: restaurant, cafe, market.\n"
            "HC-5  ACTIVITY MINIMUM: Each day must contain at least 2 non-food activity stops "
            "(landmark, historic, sightseeing, museum, park, viewpoint, culture, entertainment, nightlife).\n"
            "HC-6  CATEGORY DIVERSITY: Across the full trip, avoid scheduling the same category "
            "for the same time-slot on consecutive days. Rotate categories each day.\n\n"
            "════════════════════════════════════════\n"
            "SCHEDULING TEMPLATE (adjust times slightly day-to-day to avoid monotony):\n"
            "════════════════════════════════════════\n"
            "  Slot A — Morning   09:00–11:30 → landmark / historic / museum / viewpoint\n"
            "  Slot B — Lunch     12:00–13:30 → restaurant / cafe / market  (food)\n"
            "  Slot C — Afternoon 14:30–17:00 → museum / park / entertainment / culture\n"
            "  Slot D — Dinner    18:30–20:30 → restaurant / cafe  (food)\n"
            "  Slot E — Evening   21:00–22:30 → entertainment / nightlife / viewpoint / landmark\n\n"
            f"Aim for {num_slots_per_day} stops per day, but REDUCE to fewer if unique venues run low.\n\n"
            "════════════════════════════════════════\n"
            "OUTPUT FORMAT (respond with ONLY this JSON — no extra text, no markdown):\n"
            "════════════════════════════════════════\n"
            '{"days": [\n'
            '  {"day_index": 0, "items": [\n'
            '    {"place_id": "<exact id from catalogue>", '
            '"start_time": "YYYY-MM-DDTHH:MM:SS", '
            '"end_time": "YYYY-MM-DDTHH:MM:SS", '
            '"cost": 15.0}\n'
            "  ]},\n"
            '  {"day_index": 1, "items": [...]},\n'
            "  ...\n"
            "]}\n\n"
            "Use ONLY place_ids from the catalogue above. "
            "Double-check: no place_id should appear more than once across all days."
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
                            # Trip-wide dedup set: a place_id seen on any day is
                            # excluded from all subsequent days.
                            seen_place_ids: set[str] = set()
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


def enforce_schedule_uniqueness(
    days: list[PlanDayResponse],
    places: list[Place],
) -> list[PlanDayResponse]:
    """
    Deterministically de-duplicate venue bookings across the entire trip.

    - When the candidate pool can fill every slot with a unique venue (strict
      mode), each ``place_id`` appears at most once across all days. If a day
      would otherwise lose its only dining option, one repeated dining venue is
      restored at a gap-safe clock time so the trip still covers meals.
    - When the pool is too small (lenient mode), every venue is de-duplicated
      across the trip regardless of category; identical (place_id, start clock
      time) pairs are ALWAYS collapsed so no venue appears at the same time on
      multiple days.

    Returns a new schedule list; original ``days`` is not mutated.
    """
    if not days:
        return days

    total_slots = sum(len(d.items) for d in days)
    strict_mode = len(places) >= total_slots

    used_places: set[str] = set()
    place_clocks: dict[str, set[str]] = {}
    result: list[PlanDayResponse] = []
    dropped_food_by_day: dict[int, list[PlanItemResponse]] = {}

    def gap_safe_clock(
        item: PlanItemResponse,
        day_items: list[PlanItemResponse],
    ) -> datetime | None:
        """Pick a free start clock that maximises the gap to day neighbours."""
        pid = item.place_id
        used_clocks = place_clocks.get(pid, set())
        duration = item.end_time - item.start_time
        base = datetime.combine(item.start_time.date(), datetime.min.time())
        best: datetime | None = None
        best_score = -1.0
        for hour in range(8, 22):
            for minute in (0, 30):
                cand = base.replace(hour=hour, minute=minute)
                cand_clock = cand.strftime("%H:%M")
                if cand_clock in used_clocks:
                    continue
                cand_end = cand + duration
                prev_end = max(
                    (it.end_time for it in day_items if it.end_time <= cand),
                    default=None,
                )
                next_start = min(
                    (it.start_time for it in day_items if it.start_time >= cand_end),
                    default=None,
                )
                scores = []
                if prev_end is not None:
                    scores.append((cand - prev_end).total_seconds() / 60)
                if next_start is not None:
                    scores.append((next_start - cand_end).total_seconds() / 60)
                if not scores:
                    min_gap = 120.0
                else:
                    min_gap = min(scores)
                    if min_gap < 45:
                        continue
                score = min_gap - hour * 0.01
                if score > best_score:
                    best_score = score
                    best = cand
        return best

    for day in days:
        kept: list[PlanItemResponse] = []
        for item in day.items:
            pid = item.place_id
            clock = item.start_time.strftime("%H:%M")
            is_food = bool(item.place and item.place.category in FOOD_CATEGORIES)

            if pid in used_places:
                if is_food and strict_mode:
                    dropped_food_by_day.setdefault(day.day_index, []).append(item)
                # Trip-level duplicate (non-dining always, dining when lenient
                # or when handled by the strict-mode meal restoration below).
                continue

            place_clocks.setdefault(pid, set()).add(clock)
            used_places.add(pid)
            kept.append(item)

        result.append(
            PlanDayResponse(
                date=day.date,
                day_index=day.day_index,
                items=kept,
            )
        )

    if strict_mode:
        for day in result:
            has_food = any(
                it.place and it.place.category in FOOD_CATEGORIES for it in day.items
            )
            if has_food:
                continue
            candidates = dropped_food_by_day.get(day.day_index, [])
            if not candidates:
                continue
            rescued = candidates[0]
            new_start = gap_safe_clock(rescued, day.items)
            if new_start is None:
                continue
            pid = rescued.place_id
            duration = rescued.end_time - rescued.start_time
            rescued = PlanItemResponse(
                id=rescued.id,
                place_id=rescued.place_id,
                place=rescued.place,
                day_index=rescued.day_index,
                start_time=new_start,
                end_time=new_start + duration,
                cost=rescued.cost,
            )
            place_clocks.setdefault(pid, set()).add(new_start.strftime("%H:%M"))
            day.items.append(rescued)
            day.items.sort(key=lambda it: it.start_time)

    return result


def call_gemini_ask(
    trip: Trip,
    places: list[Place],
    plan_days: list[PlanDayResponse] | None,
    question: str,
    constraints: list[Constraint] | None = None,
) -> str | None:
    """Ask the AI agent an open-ended question about the destination/plan.

    Uses a grounded RAG prompt: full venue catalogue + scheduled itinerary +
    group constraints are injected so the model answers as a knowledgeable
    local expert rather than a generic assistant.

    Returns a concise human-readable answer, or ``None`` if the LLM is
    unavailable so callers can fall back to a deterministic response.
    """
    if not settings.GEMINI_API_KEY:
        return None

    try:
        # ── RAG context: full venue catalogue ──────────────────────────────────
        venue_lines = []
        for p in places:
            venue_lines.append(
                f"  - {p.name} (category={p.category}, est_cost=${p.est_cost:.2f}, "
                f"lat={p.lat}, lng={p.lng})"
            )
        venue_catalogue = (
            "\n".join(venue_lines) if venue_lines else "  (none loaded yet)"
        )

        # ── RAG context: current itinerary with rich time/day info ─────────────
        schedule_lines: list[str] = []
        if plan_days:
            for d in plan_days:
                day_label = f"Day {d.day_index + 1} ({d.date.isoformat() if hasattr(d.date, 'isoformat') else d.date})"
                for it in d.items:
                    place_name = it.place.name if it.place else it.place_id
                    category = it.place.category if it.place else "unknown"
                    schedule_lines.append(
                        f"  [{day_label}] {it.start_time.strftime('%H:%M')}–"
                        f"{it.end_time.strftime('%H:%M')} · {place_name} "
                        f"({category}) · ${it.cost:.2f}"
                    )
        schedule_text = (
            "\n".join(schedule_lines)
            if schedule_lines
            else "  No itinerary generated yet."
        )

        prompt_parts = [
            "You are a knowledgeable, friendly local travel expert for the destination below. "
            "You have deep knowledge of every venue in the confirmed catalogue and the group's "
            "current scheduled itinerary. Answer questions in a concise, practical, and personal "
            "tone — as if you live there. Reference specific venue names, days, and times from "
            "the itinerary when relevant. Use bullet points for lists. Never make up venues "
            "that are not in the catalogue.",
            f"Destination: {trip.destination}",
            f"Trip dates: {trip.start_date} → {trip.end_date}",
        ]

        # ── RAG context: group constraints ─────────────────────────────────────
        if constraints:
            constraint_lines = []
            for c in constraints:
                parts = [f"budget ${c.budget_per_day:.0f}/day"]
                if c.dietary:
                    parts.append(f"dietary: {', '.join(c.dietary)}")
                if c.style_tags:
                    parts.append(f"style: {', '.join(c.style_tags)}")
                if c.must_see:
                    parts.append(f"must-see: {', '.join(c.must_see)}")
                if c.must_avoid:
                    parts.append(f"must-avoid: {', '.join(c.must_avoid)}")
                constraint_lines.append(f"  - {', '.join(parts)}")
            prompt_parts.append(
                "Group traveler preferences:\n" + "\n".join(constraint_lines)
            )

        prompt_parts += [
            f"Confirmed venue catalogue:\n{venue_catalogue}",
            f"Current scheduled itinerary:\n{schedule_text}",
            f"Traveler's question: {question}",
            'Respond strictly with JSON: {"answer": "..."}',
        ]

        full_prompt = "\n\n".join(prompt_parts)
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.LLM_MODEL_NAME}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        payload = {
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.3,
            },
        }

        for attempt in range(3):
            try:
                with httpx.Client(timeout=12.0) as client:
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
                        if isinstance(parsed, dict) and parsed.get("answer"):
                            return str(parsed["answer"]).strip()
                if res.status_code == 429 or 500 <= res.status_code < 600:
                    if attempt < 2:
                        backoff = (2**attempt) * 1.5
                        logger.warning(
                            f"Gemini ask API returned {res.status_code}; "
                            f"retrying in {backoff:.1f}s..."
                        )
                        time.sleep(backoff)
                        continue
                    break
                logger.warning(
                    f"Gemini ask API returned non-retryable status {res.status_code}"
                )
                return None
            except httpx.TimeoutException:
                if attempt < 2:
                    backoff = (2**attempt) * 1.5
                    logger.warning(
                        f"Gemini ask request timed out; retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                else:
                    return None
            except Exception as exc:
                if attempt < 2:
                    backoff = (2**attempt) * 1.5
                    logger.warning(
                        f"Gemini ask attempt {attempt + 1} failed ({exc}); "
                        f"retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                else:
                    return None

    except Exception as exc:
        logger.warning(f"Gemini ask failed ({exc}).")
    return None
