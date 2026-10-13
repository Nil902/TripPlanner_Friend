"""Pure validation of weekly venue hours, including overnight opening periods."""

from typing import Any

from app.models.schema import PlanDayResponse, ValidationIssue

_WEEK_MINUTES = 7 * 24 * 60


def _clock_minutes(value: str) -> int:
    if len(value) != 4 or not value.isdigit():
        raise ValueError("Opening times must use HHMM.")
    hours, minutes = int(value[:2]), int(value[2:])
    if hours > 23 or minutes > 59:
        raise ValueError("Invalid opening time.")
    return hours * 60 + minutes


def _opening_window(period: dict[str, Any]) -> tuple[int, int] | None:
    opening = period["open"]
    opening_day = int(opening["day"])
    if not 0 <= opening_day <= 6:
        raise ValueError("Invalid opening weekday.")
    opening_clock = _clock_minutes(opening.get("time", "0000"))
    closing = period.get("close")
    # Google represents a venue open continuously as Sunday 00:00, no close.
    if not closing:
        if opening_day == 0 and opening_clock == 0:
            return None
        raise ValueError("Missing closing time.")
    closing_day = int(closing.get("day", opening_day))
    if not 0 <= closing_day <= 6:
        raise ValueError("Invalid closing weekday.")
    closing_clock = _clock_minutes(closing.get("time", "2359"))
    span_days = (closing_day - opening_day) % 7
    if span_days == 0 and closing_clock <= opening_clock:
        span_days = 1
    start = opening_day * 1440 + opening_clock
    end = (opening_day + span_days) * 1440 + closing_clock
    return start, end


def check_open_hours(days: list[PlanDayResponse]) -> list[ValidationIssue]:
    """Check complete visits against every weekly opening interval.

    Missing data is skipped. Malformed provider data produces a warning rather
    than crashing validation or being reported as confirmed opening hours.
    """
    issues: list[ValidationIssue] = []
    for day in days:
        for item in day.items:
            place = item.place
            if not place or not place.opening_hours:
                continue
            periods = place.opening_hours.get("periods")
            if not periods:
                continue
            try:
                windows = [_opening_window(p) for p in periods]
            except (KeyError, TypeError, ValueError, AttributeError):
                issues.append(
                    ValidationIssue(
                        type="open_hours",
                        severity="warning",
                        day_index=day.day_index,
                        place_id=item.place_id,
                        message=f"Opening hours for '{place.name}' could not be verified.",
                        suggested_action="Confirm current hours with the venue.",
                    )
                )
                continue
            if None in windows:
                continue
            google_day = (item.start_time.weekday() + 1) % 7
            start = (
                google_day * 1440 + item.start_time.hour * 60 + item.start_time.minute
            )
            span_days = (item.end_time.date() - item.start_time.date()).days
            end = (
                (google_day + span_days) * 1440
                + item.end_time.hour * 60
                + item.end_time.minute
            )
            if any(
                window is not None
                and window[0] + offset <= start < end <= window[1] + offset
                for window in windows
                for offset in (-_WEEK_MINUTES, 0, _WEEK_MINUTES)
            ):
                continue

            opens_today = any(p["open"]["day"] == google_day for p in periods)
            if not opens_today:
                message = f"'{place.name}' appears to be closed on {item.start_time.strftime('%A')}s."
            else:
                labels = [
                    f"{p['open'].get('time', '0000')[:2]}:{p['open'].get('time', '0000')[2:]} - "
                    f"{p.get('close', {}).get('time', '2359')[:2]}:{p.get('close', {}).get('time', '2359')[2:]}"
                    for p in periods
                    if p["open"]["day"] == google_day
                ]
                message = (
                    f"'{place.name}' is scheduled during "
                    f"{item.start_time:%H:%M}-{item.end_time:%H:%M}, "
                    f"but operating hours are {' or '.join(labels)}."
                )
            issues.append(
                ValidationIssue(
                    type="open_hours",
                    severity="error",
                    day_index=day.day_index,
                    place_id=item.place_id,
                    message=message,
                    suggested_action="Reschedule within operating hours or select an alternative venue.",
                )
            )
    return issues
