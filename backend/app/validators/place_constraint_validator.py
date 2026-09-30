"""Check requested and excluded venues against a proposed schedule."""

from app.models.schema import Constraint, PlanDayResponse, ValidationIssue


def check_place_constraints(
    days: list[PlanDayResponse], constraints: list[Constraint]
) -> list[ValidationIssue]:
    """Return deterministic must-see and must-avoid violations."""
    issues: list[ValidationIssue] = []
    scheduled = [item for day in days for item in day.items if item.place]
    seen_names = {item.place.name.lower() for item in scheduled if item.place}
    must_sees = {
        term.strip().lower()
        for constraint in constraints
        for term in constraint.must_see
        if term.strip()
    }
    must_avoids = {
        term.strip().lower()
        for constraint in constraints
        for term in constraint.must_avoid
        if term.strip()
    }

    for term in sorted(must_sees):
        if not any(term in name for name in seen_names):
            issues.append(
                ValidationIssue(
                    type="must_see",
                    severity="error",
                    message=f"Requested place '{term}' is missing from the itinerary.",
                    suggested_action="Add the requested place or explain why it is unavailable.",
                )
            )

    for item in scheduled:
        place = item.place
        if place is None:
            continue
        for term in sorted(must_avoids):
            if term in place.name.lower() or term in place.category.lower():
                issues.append(
                    ValidationIssue(
                        type="must_avoid",
                        severity="error",
                        day_index=item.day_index,
                        place_id=item.place_id,
                        message=f"'{place.name}' conflicts with must-avoid rule '{term}'.",
                        suggested_action="Remove this venue and choose an allowed option.",
                    )
                )
                break

    return issues
