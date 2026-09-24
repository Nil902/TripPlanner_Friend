"""
Dynamic rebalancing logic for disruption handling.
"""

import uuid
from datetime import timedelta

from sqlmodel import Session, select

from app.models.schema import (
    Constraint,
    DisruptionEvent,
    DisruptionType,
    Place,
    PlaceResponse,
    Plan,
    PlanDayResponse,
    PlanItem,
    PlanItemResponse,
    PlanResponse,
    Trip,
    ValidationStatus,
    utc_now,
)
from app.services.places_service import find_alternative_place
from app.validators.budget_validator import check_budget
from app.validators.open_hours_validator import check_open_hours
from app.validators.travel_validator import check_travel_time

from .proposer import build_day_dates, create_plan_response


def rebalance(
    session: Session,
    trip: Trip,
    current_plan: Plan,
    disruption: DisruptionEvent,
) -> PlanResponse:
    """
    Dynamically rebalances only the affected time window / day while holding
    unaffected days fixed, incrementing Plan.version to preserve history.
    """
    # Fetch existing plan items
    existing_items = session.exec(
        select(PlanItem).where(PlanItem.plan_id == current_plan.id)
    ).all()

    day_dates = build_day_dates(trip.start_date, trip.end_date)

    notes = list(current_plan.notes or [])
    notes.append(
        f"Dynamic Rebalance Triggered: {disruption.type.value} on Day {disruption.day_index + 1}. "
        f"Details: {disruption.description or 'Schedule disruption'}."
    )

    new_plan = Plan(
        id=str(uuid.uuid4()),
        trip_id=trip.id,
        version=current_plan.version + 1,
        validation_status=ValidationStatus.VALID,
        notes=notes,
        created_at=utc_now(),
    )
    session.add(new_plan)
    session.commit()
    session.refresh(new_plan)

    persisted_days: list[PlanDayResponse] = []

    for d_idx, d_date in enumerate(day_dates):
        items_for_day = [it for it in existing_items if it.day_index == d_idx]
        items_for_day.sort(key=lambda x: x.start_time)
        day_responses: list[PlanItemResponse] = []

        if d_idx != disruption.day_index:
            # UNAFFECTED DAY: Copy verbatim
            for it in items_for_day:
                place = session.get(Place, it.place_id)
                place_resp = PlaceResponse.model_validate(place) if place else None
                new_item = PlanItem(
                    id=str(uuid.uuid4()),
                    plan_id=new_plan.id,
                    place_id=it.place_id,
                    day_index=d_idx,
                    start_time=it.start_time,
                    end_time=it.end_time,
                    cost=it.cost,
                )
                session.add(new_item)
                day_responses.append(
                    PlanItemResponse(
                        id=new_item.id,
                        place_id=it.place_id,
                        place=place_resp,
                        day_index=d_idx,
                        start_time=it.start_time,
                        end_time=it.end_time,
                        cost=it.cost,
                    )
                )
        else:
            # AFFECTED DAY: Rebalance only the impacted items
            notes.append(f"Isolating Day {d_idx + 1} schedule for local rebalance...")
            delay_offset = timedelta(minutes=disruption.delay_minutes or 60)
            allocated_ids: set[str] = set()

            for it in items_for_day:
                place = session.get(Place, it.place_id)
                should_replace = disruption.place_id == it.place_id or (
                    disruption.type == DisruptionType.VENUE_CLOSED
                    and disruption.place_id is None
                )

                target_place: Place | None = place
                if should_replace and place:
                    # Find alternative venue — exclude all already-allocated places
                    excluded = allocated_ids | {it.place_id}
                    alt = find_alternative_place(
                        session=session,
                        current_place=place,
                        destination=trip.destination,
                        max_cost=it.cost + 10.0,
                        excluded_place_ids=list(excluded),
                    )
                    target_place = alt if alt else place
                    notes.append(
                        f"Substituted '{place.name}' with alternative '{target_place.name}'."
                    )
                    start_t = it.start_time
                    end_t = it.end_time
                elif disruption.type == DisruptionType.FLIGHT_DELAYED:
                    target_place = place
                    # Shift time forward
                    start_t = it.start_time + delay_offset
                    end_t = it.end_time + delay_offset
                else:
                    target_place = place
                    start_t = it.start_time
                    end_t = it.end_time

                final_id = target_place.place_id if target_place else it.place_id
                allocated_ids.add(final_id)

                place_resp = (
                    PlaceResponse.model_validate(target_place) if target_place else None
                )
                new_item = PlanItem(
                    id=str(uuid.uuid4()),
                    plan_id=new_plan.id,
                    place_id=target_place.place_id if target_place else it.place_id,
                    day_index=d_idx,
                    start_time=start_t,
                    end_time=end_t,
                    cost=target_place.est_cost if target_place else it.cost,
                )
                session.add(new_item)
                day_responses.append(
                    PlanItemResponse(
                        id=new_item.id,
                        place_id=new_item.place_id,
                        place=place_resp,
                        day_index=d_idx,
                        start_time=start_t,
                        end_time=end_t,
                        cost=new_item.cost,
                    )
                )

        persisted_days.append(
            PlanDayResponse(
                date=d_date,
                day_index=d_idx,
                items=day_responses,
            )
        )

    session.commit()

    # Re-validate the rebalanced plan and update its status accordingly
    constraints = list(
        session.exec(select(Constraint).where(Constraint.trip_id == trip.id)).all()
    )
    budget_issues = check_budget(
        persisted_days, constraints, num_members=len(constraints)
    )
    travel_issues = check_travel_time(persisted_days)
    hours_issues = check_open_hours(persisted_days)
    all_issues = budget_issues + travel_issues + hours_issues
    has_errors = any(i.severity == "error" for i in all_issues)
    new_plan.validation_status = (
        ValidationStatus.INVALID if has_errors else ValidationStatus.VALID
    )
    session.add(new_plan)
    session.commit()

    return create_plan_response(new_plan, persisted_days)
