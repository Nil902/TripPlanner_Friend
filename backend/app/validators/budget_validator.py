"""
Deterministic budget validator. Pure function without database mutation.
"""

from app.models.schema import Constraint, PlanDayResponse, ValidationIssue


def check_budget(
    days: list[PlanDayResponse],
    constraints: list[Constraint],
    budget_tolerance_ratio: float = 0.0,
) -> list[ValidationIssue]:
    """
    Validate whether the itinerary plan items per day violate any member's daily budget cap.
    """
    issues: list[ValidationIssue] = []

    if not constraints or not days:
        return issues

    for day in days:
        day_total_cost = sum(item.cost for item in day.items)

        for c in constraints:
            allowed_budget = c.budget_per_day * (1.0 + budget_tolerance_ratio)
            if day_total_cost > allowed_budget:
                diff = day_total_cost - c.budget_per_day
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
                            f"Day {day.day_index + 1} cost (${day_total_cost:.2f}) exceeds "
                            f"user '{c.user_id}' cap (${c.budget_per_day:.2f}) by ${diff:.2f} ({pct_over:.1f}%)."
                        ),
                        suggested_action="Swap high-cost activity or restaurant for free or lower-cost alternative.",
                    )
                )

    return issues
