"""
Unit tests for the deterministic heuristic proposer:
- No duplicate venues within a single day.
- Prefers trip-fresh venues across days.
- Balanced food vs non-food slot distribution.
"""

import uuid
from datetime import date

from app.models.schema import Place
from app.services.proposer import build_day_dates, propose_schedule

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
