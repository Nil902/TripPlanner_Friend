"""
Deterministic budget validator. Pure function without database mutation.
"""

from app.models.schema import Constraint, PlanDayResponse, ValidationIssue


def check_budget(
    days: list[PlanDayResponse],
    constraints: list[Constraint],
    budget_tolerance_ratio: float = 0.0,
    num_members: int = 1,
) -> list[ValidationIssue]:
    """
    Validate whether each member's per-person daily cost share violates their budget cap.

    ``num_members`` should be the number of participants splitting costs for the trip.
    When not provided it defaults to 1 (solo), which is conservative (worst case).
    """
    issues: list[ValidationIssue] = []

    if not constraints or not days:
        return issues

    # Clamp to at least 1 to avoid ZeroDivisionError
    effective_members = max(1, num_members)

    for day in days:
        day_total_cost = sum(item.cost for item in day.items)
        # Each person's share of that day's activities
        per_person_cost = day_total_cost / effective_members

        for c in constraints:
            allowed_budget = c.budget_per_day * (1.0 + budget_tolerance_ratio)
            if per_person_cost > allowed_budget:
                diff = per_person_cost - c.budget_per_day
                pct_over = (
                    (diff / c.budget_per_day) * 100 if c.budget_per_day > 0 else 100
                )
                issues.append(
                    ValidationIssue(
                        type="budget",
                        severity="error"
                        if budget_tolerance_ratio == 0.0
                        else "warning",
                        day_index=day.day_index,
                        user_id=c.user_id,
                        message=(
                            f"Day {day.day_index + 1} per-person share (${per_person_cost:.2f}) "
                            f"exceeds user '{c.user_id}' cap (${c.budget_per_day:.2f}) "
                            f"by ${diff:.2f} ({pct_over:.1f}%). "
                            f"Total day cost: ${day_total_cost:.2f} split {effective_members} ways."
                        ),
                        suggested_action="Swap high-cost activity or restaurant for free or lower-cost alternative.",
                    )
                )

    return issues
