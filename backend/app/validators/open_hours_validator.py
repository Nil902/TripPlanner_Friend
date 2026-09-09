"""
Deterministic operating hours validator. Pure function.
"""

from app.models.schema import PlanDayResponse, ValidationIssue


def check_open_hours(days: list[PlanDayResponse]) -> list[ValidationIssue]:
    """
    Validates whether scheduled activities fall within the venue's operating hours.
    Missing opening hours data is safely skipped (as mandated by Section 9.3).
    """
    issues: list[ValidationIssue] = []

    for day in days:
        for item in day.items:
            place = item.place
            if not place or not place.opening_hours:
                # Section 9.3: Skip open-hours check if data is null/missing
                continue

            opening_data = place.opening_hours
            periods = opening_data.get("periods")
            if not periods:
                continue

            # In Python weekday: Monday is 0, Sunday is 6.
            # In Google Places API weekday: Sunday is 0, Monday is 1, ..., Saturday is 6.
            python_weekday = item.start_time.weekday()
            google_day = (python_weekday + 1) % 7

            # Find period for this day
            period_for_day = next(
                (p for p in periods if p.get("open", {}).get("day") == google_day), None
            )
            if not period_for_day:
                # Venue is closed entirely on this day
                issues.append(
                    ValidationIssue(
                        type="open_hours",
                        severity="error",
                        day_index=day.day_index,
                        place_id=item.place_id,
                        message=f"'{place.name}' appears to be closed on {item.start_time.strftime('%A')}s.",
                        suggested_action="Reschedule visit to another day or select an alternative venue.",
                    )
                )
                continue

            start_hhmm = f"{item.start_time.hour:02d}{item.start_time.minute:02d}"
            end_hhmm = f"{item.end_time.hour:02d}{item.end_time.minute:02d}"

            open_hhmm = period_for_day.get("open", {}).get("time", "0000")
            close_hhmm = period_for_day.get("close", {}).get("time", "2359")

            if start_hhmm < open_hhmm or end_hhmm > close_hhmm:
                formatted_open = f"{open_hhmm[:2]}:{open_hhmm[2:]}"
                formatted_close = f"{close_hhmm[:2]}:{close_hhmm[2:]}"
                scheduled_window = (
                    f"{start_hhmm[:2]}:{start_hhmm[2:]}-{end_hhmm[:2]}:{end_hhmm[2:]}"
                )

                issues.append(
                    ValidationIssue(
                        type="open_hours",
                        severity="error",
                        day_index=day.day_index,
                        place_id=item.place_id,
                        message=(
                            f"'{place.name}' is scheduled during {scheduled_window}, "
                            f"but operating hours are {formatted_open} - {formatted_close}."
                        ),
                        suggested_action="Adjust activity start/end times within operating hours.",
                    )
                )

    return issues
