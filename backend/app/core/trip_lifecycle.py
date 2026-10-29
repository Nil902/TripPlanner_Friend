"""Date-based travel progress, independent of itinerary planning and permissions."""

from datetime import date
from typing import Literal

TripLifecycleStatus = Literal["upcoming", "in_progress", "completed"]


def get_trip_lifecycle_status(
    start_date: date, end_date: date, status: str, today: date
) -> TripLifecycleStatus:
    """Use inclusive travel dates; an explicitly completed trip stays completed."""
    if status == "completed" or today > end_date:
        return "completed"
    if today < start_date:
        return "upcoming"
    return "in_progress"
