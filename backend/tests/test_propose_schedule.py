"""
Unit tests for the deterministic heuristic proposer:
- No duplicate venues within a single day.
- Prefers trip-fresh venues across days.
- Balanced food vs non-food slot distribution.
- Trip-wide de-duplication of identical (place, time) bookings.
"""

import uuid
from datetime import date, datetime

from app.models.schema import (
    Place,
    PlaceResponse,
    PlanDayResponse,
    PlanItemResponse,
)
from app.services.proposer import (
    build_day_dates,
    enforce_schedule_uniqueness,
    propose_schedule,
)

FOOD_CATEGORIES = {"restaurant", "cafe", "market"}


def _place(name: str, category: str, cost: float) -> Place:
    return Place(
        place_id=str(uuid.uuid4()),
        name=name,
        category=category,
        est_cost=cost,
        lat=40.0,
        lng=-73.0,
    )


def _catalog() -> list[Place]:
    return [
        _place("Colosseum", "landmark", 15),
        _place("Vatican Museum", "museum", 25),
        _place("Trevi Fountain", "sightseeing", 0),
        _place("Rome Viewpoint", "viewpoint", 0),
        _place("Trajano Park", "park", 0),
        _place("Borghese Gallery", "museum", 10),
        _place("Pantheon Sights", "landmark", 5),
        _place("Opera House", "entertainment", 40),
        _place("Trattoria Roma", "restaurant", 30),
        _place("Piazza Cafe", "cafe", 15),
        _place("Osteria Toscana", "restaurant", 25),
        _place("Night Club", "nightlife", 20),
        _place("Sunset Point", "viewpoint", 0),
    ]


def test_no_duplicate_venues_within_a_day():
    days = propose_schedule(
        day_dates=build_day_dates(date(2026, 1, 1), date(2026, 1, 3)),
        places=_catalog(),
        must_sees=[],
        replacement_attempts=0,
    )

    for day in days:
        place_ids = [item.place_id for item in day.items]
        assert len(place_ids) == len(set(place_ids)), (
            f"Day {day.day_index + 1} contains duplicate venues."
        )


def test_prefers_trip_fresh_venues_across_days():
    # Large catalog (20 venues) for 3 days x 5 slots = 15 slots: all must be unique.
    catalog = list(_catalog())
    catalog += [
        _place("Spiral Gallery", "museum", 12),
        _place("Castle Tower", "landmark", 8),
        _place("Riverwalk Park", "park", 0),
        _place("Jazz Club", "nightlife", 25),
        _place("Fish Market", "market", 10),
        _place("Balcony Cafe", "cafe", 12),
        _place("Silk Restaurant", "restaurant", 28),
    ]

    days = propose_schedule(
        day_dates=build_day_dates(date(2026, 1, 1), date(2026, 1, 3)),
        places=catalog,
        must_sees=[],
        replacement_attempts=0,
    )

    all_ids = [item.place_id for day in days for item in day.items]
    total_slots = len(all_ids)
    assert total_slots >= 14
    # With a pool larger than the slot count, no venue may repeat.
    assert len(set(all_ids)) == total_slots


def test_food_stops_capped_at_two_per_day_with_culture_recommended():
    days = propose_schedule(
        day_dates=build_day_dates(date(2026, 1, 1), date(2026, 1, 3)),
        places=_catalog(),
        must_sees=[],
        replacement_attempts=0,
    )

    for day in days:
        assert len(day.items) >= 4
        food_count = sum(
            1 for item in day.items if item.place.category in FOOD_CATEGORIES
        )
        assert food_count <= 2, (
            f"Day {day.day_index + 1}: expected at most 2 food stops, got {food_count}."
        )
        non_food_count = len(day.items) - food_count
        assert non_food_count >= 2


def _day(
    day_index: int,
    day_date: date,
    specs: list[tuple[Place, str]],
) -> PlanDayResponse:
    items: list[PlanItemResponse] = []
    for _idx, (place, clock) in enumerate(specs):
        start = datetime.combine(day_date, datetime.min.time()).replace(
            hour=int(clock[:2]), minute=int(clock[3:])
        )
        end = datetime.combine(day_date, datetime.min.time()).replace(
            hour=int(clock[:2]) + 1, minute=int(clock[3:])
        )
        items.append(
            PlanItemResponse(
                id=str(uuid.uuid4()),
                place_id=place.place_id,
                place=PlaceResponse.model_validate(place),
                day_index=day_index,
                start_time=start,
                end_time=end,
                cost=place.est_cost,
            )
        )
    return PlanDayResponse(date=day_date, day_index=day_index, items=items)


def test_enforce_drops_identical_place_time_across_days():
    """A venue must never appear at the same clock time on multiple days."""
    bokor = _place("Bokor Hill Station", "landmark", 5)
    other = _place("Kampot Old Town", "landmark", 0)
    pool = [bokor, other] + [_place(n, "restaurant", 10) for n in ("A", "B")]

    days = [
        _day(0, date(2026, 1, 1), [(bokor, "09:30"), (other, "15:00")]),
        _day(1, date(2026, 1, 2), [(bokor, "09:30")]),
        _day(2, date(2026, 1, 3), [(bokor, "09:30")]),
    ]

    result = enforce_schedule_uniqueness(days, pool)
    occurrences = [
        (d.day_index, it.place_id, it.start_time.strftime("%H:%M"))
        for d in result
        for it in d.items
    ]
    bokor_times = [clock for (_, pid, clock) in occurrences if pid == bokor.place_id]
    assert bokor_times == ["09:30"]
    assert len(result[0].items) == 2
    assert len(result[1].items) == 0
    assert len(result[2].items) == 0


def test_enforce_strict_mode_removes_all_cross_day_repeats():
    """When the pool can fill the schedule, venues never repeat across days."""
    pool = [_place(f"Place {i}", "landmark", i) for i in range(10)]
    p0 = pool[0]
    days = [
        _day(0, date(2026, 1, 1), [(p0, "09:30")]),
        _day(1, date(2026, 1, 2), [(p0, "19:00")]),  # different time, still dropped
    ]
    result = enforce_schedule_uniqueness(days, pool)
    all_ids = [it.place_id for d in result for it in d.items]
    assert len(all_ids) == 1  # repeated venue removed entirely


def test_enforce_lenient_removes_all_cross_day_repeats():
    """Small pools de-duplicate every venue, including dining repeats."""
    pool = [
        _place("Harbour Bistro", "restaurant", 20),
        _place("Bokor Viewpoint", "viewpoint", 0),
    ]
    bistro = pool[0]
    days = [
        _day(0, date(2026, 1, 1), [(bistro, "12:30")]),
        _day(1, date(2026, 1, 2), [(bistro, "19:00")]),
        _day(2, date(2026, 1, 3), [(bistro, "12:30")]),
    ]
    result = enforce_schedule_uniqueness(days, pool)
    kept_times = [
        it.start_time.strftime("%H:%M")
        for d in result
        for it in d.items
        if it.place_id == bistro.place_id
    ]
    assert kept_times == ["12:30"]
    assert all(len(d.items) == 0 for d in result[1:])


def test_enforce_strict_rescues_only_dining_option_on_meatless_day():
    """Strict mode restores a repeated dining venue when a day would lose its
    only meal option, at a gap-safe clock time."""
    bistro = _place("Harbour Bistro", "restaurant", 20)
    pool = [
        bistro,
        _place("Arc de Triomphe", "landmark", 10),
        _place("Louvre", "museum", 17),
        _place("Pont Alexandre", "landmark", 0),
        _place("Panthéon", "historic", 11),
        _place("Seine Cruise", "entertainment", 25),
        _place("Opera Garnier", "entertainment", 20),
        _place("Rodin Museum", "museum", 14),
        _place("Sacré-Cœur", "landmark", 8),
    ]
    days = [
        _day(
            0,
            date(2026, 1, 1),
            [(pool[1], "09:30"), (bistro, "12:30"), (pool[2], "15:00")],
        ),
        _day(
            1,
            date(2026, 1, 2),
            [(pool[3], "09:30"), (bistro, "12:30"), (pool[2], "15:00")],
        ),
        _day(
            2,
            date(2026, 1, 3),
            [(pool[4], "09:30"), (bistro, "12:30"), (pool[5], "15:00")],
        ),
    ]
    result = enforce_schedule_uniqueness(days, pool)
    day2 = result[1]
    bistro_items = [it for it in day2.items if it.place_id == bistro.place_id]
    assert len(bistro_items) == 1
    bistro_clock = bistro_items[0].start_time.strftime("%H:%M")
    assert bistro_clock != "12:30"
    clocks = sorted(it.start_time.strftime("%H:%M") for it in day2.items)
    assert len(clocks) == len(set(clocks))
    assert any(it.place and it.place.category in FOOD_CATEGORIES for it in day2.items)
