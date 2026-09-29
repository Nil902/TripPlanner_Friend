"""
Deterministic travel time and route backtrack validator. Pure function.
"""

import math

from app.models.schema import PlanDayResponse, ValidationIssue


def haversine_distance_km(
    coord1: tuple[float, float], coord2: tuple[float, float]
) -> float:
    """Calculate the great-circle distance between two points on the Earth in kilometers."""
    lat1, lon1 = coord1
    lat2, lon2 = coord2

    # If coordinates are not set (0, 0), return 0 distance
    if (lat1 == 0 and lon1 == 0) or (lat2 == 0 and lon2 == 0):
        return 0.0

    r = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def estimate_transit_minutes(distance_km: float) -> int:
    """
    Estimate transit duration in minutes assuming urban transit speed (25 km/h)
    plus a 5-minute buffer for boarding / walking.
    """
    if distance_km <= 0.2:
        return 5
    transit_hours = distance_km / 25.0
    return int(round(transit_hours * 60.0 + 5.0))


def check_travel_time(
    days: list[PlanDayResponse],
    max_transit_minutes_threshold: int = 45,
) -> list[ValidationIssue]:
    """
    Flags backtracking or unrealistic transitions where transit duration between
    consecutive stops exceeds acceptable group thresholds.
    """
    issues: list[ValidationIssue] = []

    for day in days:
        items = sorted(day.items, key=lambda x: x.start_time)
        for i in range(len(items) - 1):
            prev_item = items[i]
            curr_item = items[i + 1]

            prev_place = prev_item.place
            curr_place = curr_item.place

            if not prev_place or not curr_place:
                continue

            dist_km = haversine_distance_km(
                (prev_place.lat, prev_place.lng),
                (curr_place.lat, curr_place.lng),
            )

            est_minutes = estimate_transit_minutes(dist_km)

            # Check gap between previous item end and current item start
            time_gap_minutes = int(
                (curr_item.start_time - prev_item.end_time).total_seconds() / 60
            )

            if est_minutes > max_transit_minutes_threshold:
                issues.append(
                    ValidationIssue(
                        type="travel_time",
                        severity="warning",
                        day_index=day.day_index,
                        place_id=curr_item.place_id,
                        message=(
                            f"Day {day.day_index + 1}: Long commute ({est_minutes} mins, {dist_km:.1f} km) "
                            f"between '{prev_place.name}' and '{curr_place.name}' flags excessive backtracking."
                        ),
                        suggested_action="Reorder stops geographically or group by neighborhood.",
                    )
                )

            if time_gap_minutes < 0:
                # Items overlap in time — this is a scheduling conflict, not just a
                # transit issue. Emit a separate, clearer error.
                issues.append(
                    ValidationIssue(
                        type="travel_time",
                        severity="error",
                        day_index=day.day_index,
                        place_id=curr_item.place_id,
                        message=(
                            f"Day {day.day_index + 1}: Scheduling conflict — '{prev_place.name}' "
                            f"ends at {prev_item.end_time.strftime('%H:%M')} but "
                            f"'{curr_place.name}' starts at {curr_item.start_time.strftime('%H:%M')} "
                            f"({abs(time_gap_minutes)} min overlap)."
                        ),
                        suggested_action="Adjust start/end times so items do not overlap.",
                    )
                )
            elif time_gap_minutes < est_minutes:
                issues.append(
                    ValidationIssue(
                        type="travel_time",
                        severity="error",
                        day_index=day.day_index,
                        place_id=curr_item.place_id,
                        message=(
                            f"Day {day.day_index + 1}: Insufficient transit buffer ({time_gap_minutes} mins) "
                            f"for estimated {est_minutes} min journey between '{prev_place.name}' and '{curr_place.name}'."
                        ),
                        suggested_action="Shift current item start time later or pick a closer venue.",
                    )
                )

    return issues
