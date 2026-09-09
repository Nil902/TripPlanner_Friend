"""
Itinerary planning API endpoints: Generation, Retrieval, Validation, and Item Editing.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.models.schema import (
    Constraint,
    CreatePlanItemRequest,
    Place,
    PlaceResponse,
    Plan,
    PlanDayResponse,
    PlanItem,
    PlanItemResponse,
    PlanResponse,
    RefinePlanRequest,
    Trip,
    TripStatus,
    UpdatePlanItemRequest,
    ValidationResult,
    ValidationStatus,
)
from app.services.agent_planner import (
    AgentPlanner,
    build_day_dates,
    create_plan_response,
)
from app.validators.budget_validator import check_budget
from app.validators.open_hours_validator import check_open_hours
from app.validators.travel_validator import check_travel_time

router = APIRouter(prefix="/api/v1/trips/{trip_id}/plan", tags=["Plan"])


def assemble_plan_response(session: Session, trip: Trip, plan: Plan) -> PlanResponse:
    """Helper to assemble full day-by-day response for a plan record."""
    day_dates = build_day_dates(trip.start_date, trip.end_date)
    plan_items = session.exec(
        select(PlanItem)
        .where(PlanItem.plan_id == plan.id)
        .order_by(col(PlanItem.start_time).asc())
    ).all()

    days_data: list[PlanDayResponse] = []
    for d_idx, d_date in enumerate(day_dates):
        items_for_day = [it for it in plan_items if it.day_index == d_idx]
        item_responses: list[PlanItemResponse] = []
        for it in items_for_day:
            place = session.get(Place, it.place_id)
            item_responses.append(
                PlanItemResponse(
                    id=it.id,
                    place_id=it.place_id,
                    place=PlaceResponse.model_validate(place) if place else None,
                    day_index=it.day_index,
                    start_time=it.start_time,
                    end_time=it.end_time,
                    cost=it.cost,
                )
            )
        days_data.append(
            PlanDayResponse(
                date=d_date,
                day_index=d_idx,
                items=item_responses,
            )
        )

    return create_plan_response(plan, days_data)


@router.post("", response_model=PlanResponse)
def generate_plan(
    trip_id: str,
    session: Session = Depends(get_session),
):
    """Trigger the autonomous agent propose-validate-rebalance planning loop."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    constraints = session.exec(
        select(Constraint).where(Constraint.trip_id == trip_id)
    ).all()

    plan_response = AgentPlanner.generate_plan(session, trip, list(constraints))

    # Update trip status
    trip.status = TripStatus.PLANNED
    session.add(trip)
    session.commit()

    return plan_response


@router.get("", response_model=PlanResponse)
def get_plan(
    trip_id: str,
    version: int | None = Query(None, description="Optional specific plan version"),
    session: Session = Depends(get_session),
):
    """Get the latest plan or a specific version."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    query = select(Plan).where(Plan.trip_id == trip_id)
    if version is not None:
        query = query.where(Plan.version == version)
    else:
        query = query.order_by(col(Plan.version).desc())

    plan = session.exec(query).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PLAN_NOT_FOUND",
                "message": "No itinerary has been generated yet for this trip.",
            },
        )

    return assemble_plan_response(session, trip, plan)


@router.post("/items", response_model=PlanItemResponse)
def add_plan_item(
    trip_id: str,
    req: CreatePlanItemRequest,
    session: Session = Depends(get_session),
):
    """Add a custom plan item to the latest plan (Always allow all edits)."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        raise HTTPException(
            status_code=400, detail="Plan must be generated before adding items"
        )

    # Create or find place
    place_id = f"custom_{str(uuid.uuid4())[:8]}"
    place = Place(
        place_id=place_id,
        name=req.place_name,
        category=req.category,
        lat=req.lat or 0.0,
        lng=req.lng or 0.0,
        est_cost=req.cost,
    )
    session.add(place)

    item = PlanItem(
        id=str(uuid.uuid4()),
        plan_id=plan.id,
        place_id=place.place_id,
        day_index=req.day_index,
        start_time=req.start_time,
        end_time=req.end_time,
        cost=req.cost,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    session.refresh(place)

    return PlanItemResponse(
        id=item.id,
        place_id=item.place_id,
        place=PlaceResponse.model_validate(place),
        day_index=item.day_index,
        start_time=item.start_time,
        end_time=item.end_time,
        cost=item.cost,
    )


@router.put("/items/{item_id}", response_model=PlanItemResponse)
def update_plan_item(
    trip_id: str,
    item_id: str,
    req: UpdatePlanItemRequest,
    session: Session = Depends(get_session),
):
    """Directly edit an existing itinerary stop (Always allow all edits)."""
    item = session.get(PlanItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"PlanItem '{item_id}' not found")

    place = session.get(Place, item.place_id)

    if req.day_index is not None:
        item.day_index = req.day_index
    if req.start_time is not None:
        item.start_time = req.start_time
    if req.end_time is not None:
        item.end_time = req.end_time
    if req.cost is not None:
        item.cost = req.cost
        if place:
            place.est_cost = req.cost

    if place:
        if req.place_name is not None:
            place.name = req.place_name
        if req.category is not None:
            place.category = req.category
        if req.lat is not None:
            place.lat = req.lat
        if req.lng is not None:
            place.lng = req.lng
        session.add(place)

    session.add(item)
    session.commit()
    session.refresh(item)
    if place:
        session.refresh(place)

    return PlanItemResponse(
        id=item.id,
        place_id=item.place_id,
        place=PlaceResponse.model_validate(place) if place else None,
        day_index=item.day_index,
        start_time=item.start_time,
        end_time=item.end_time,
        cost=item.cost,
    )


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan_item(
    trip_id: str,
    item_id: str,
    session: Session = Depends(get_session),
):
    """Remove a plan item from the itinerary."""
    item = session.get(PlanItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"PlanItem '{item_id}' not found")
    session.delete(item)
    session.commit()
    return None


@router.post("/validate", response_model=ValidationResult)
def validate_current_plan(
    trip_id: str,
    session: Session = Depends(get_session),
):
    """
    Runs deterministic validators (budget, transit, operating hours) on the current plan.
    Powers real-time feedback in manual mode and post-edit validations.
    """
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        return ValidationResult(is_valid=True, status=ValidationStatus.VALID, issues=[])

    plan_resp = assemble_plan_response(session, trip, plan)
    constraints = session.exec(
        select(Constraint).where(Constraint.trip_id == trip_id)
    ).all()

    budget_issues = check_budget(plan_resp.days, list(constraints))
    travel_issues = check_travel_time(plan_resp.days)
    hours_issues = check_open_hours(plan_resp.days)

    all_issues = budget_issues + travel_issues + hours_issues
    has_errors = any(i.severity == "error" for i in all_issues)

    return ValidationResult(
        is_valid=not has_errors,
        status=ValidationStatus.INVALID if has_errors else ValidationStatus.VALID,
        issues=all_issues,
    )


@router.post("/refine", response_model=PlanResponse)
def refine_plan(
    trip_id: str,
    req: RefinePlanRequest,
    session: Session = Depends(get_session),
):
    """
    Apply natural-language refinement to the itinerary (e.g. 'Make Day 2 more relaxed').
    Re-runs proposing/balancing with user instruction and creates a newly versioned Plan.
    """
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        raise HTTPException(
            status_code=400,
            detail="A plan must be generated first before refining.",
        )

    return AgentPlanner.refine_plan(
        session=session,
        trip=trip,
        current_plan=plan,
        instruction=req.instruction,
        user_id=req.user_id,
    )


@router.get("/export.ics")
def export_plan_ics(
    trip_id: str,
    session: Session = Depends(get_session),
):
    """
    Export the current trip plan as an RFC 5545 iCalendar (.ics) file
    compatible with Apple Calendar, Google Calendar, and Outlook.
    """
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        raise HTTPException(
            status_code=404,
            detail="No plan exists yet to export.",
        )

    ics_content = AgentPlanner.generate_ics_calendar(
        session=session,
        trip=trip,
        plan=plan,
    )

    clean_dest = "".join(c for c in trip.destination.lower() if c.isalnum())[:12]
    filename = f"trip_{clean_dest}_v{plan.version}.ics"

    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
