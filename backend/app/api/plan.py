import math
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.models.schema import (
    AskAgentRequest,
    AskAgentResponse,
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
    utc_now,
)
from app.services.agent_planner import AgentPlanner, create_plan_response
from app.services.places_service import get_or_create_places_for_destination
from app.services.proposer import (
    FOOD_CATEGORIES,
    build_day_dates,
    call_gemini_ask,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    if req.day_index < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_DAY_INDEX",
                "message": "day_index must be a non-negative integer.",
            },
        )

    if req.end_time <= req.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_TIME_RANGE",
                "message": "end_time must be after start_time.",
            },
        )

    if req.cost < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_COST",
                "message": "cost cannot be negative.",
            },
        )

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        plan = Plan(
            id=str(uuid.uuid4()),
            trip_id=trip.id,
            version=1,
            validation_status=ValidationStatus.VALID,
            notes=["Manual itinerary created by user."],
            created_at=utc_now(),
        )
        session.add(plan)
        session.commit()
        session.refresh(plan)

        trip.status = TripStatus.PLANNED
        session.add(trip)
        session.commit()

    # Anchor start_time and end_time to the actual trip day date
    day_dates = build_day_dates(trip.start_date, trip.end_date)
    if 0 <= req.day_index < len(day_dates):
        target_date = day_dates[req.day_index]
        item_start_time = datetime.combine(target_date, req.start_time.time())
        item_end_time = datetime.combine(target_date, req.end_time.time())
    else:
        item_start_time = req.start_time
        item_end_time = req.end_time

    # Resolve geographic coordinates (lat, lng)
    resolved_lat = req.lat
    resolved_lng = req.lng

    candidate_places = get_or_create_places_for_destination(session, trip.destination)

    # If coordinates are missing (0.0 or None), resolve from destination catalog or city coordinates
    if (
        not resolved_lat
        or not resolved_lng
        or (resolved_lat == 0.0 and resolved_lng == 0.0)
    ):
        norm_name = req.place_name.lower().strip()
        matched = next(
            (
                p
                for p in candidate_places
                if norm_name in p.name.lower() or p.name.lower() in norm_name
            ),
            None,
        )
        if matched and matched.lat and matched.lng:
            resolved_lat = matched.lat
            resolved_lng = matched.lng
            if not req.category or req.category == "attraction":
                req.category = matched.category
        elif candidate_places:
            # Anchor near destination center with realistic spatial distribution
            base_p = candidate_places[0]
            existing_items = session.exec(
                select(PlanItem).where(PlanItem.plan_id == plan.id)
            ).all()
            stop_num = len(existing_items) + 1
            angle = (stop_num * 1.35) % (2 * math.pi)
            dist = 0.008 + (stop_num % 4) * 0.004
            resolved_lat = round(base_p.lat + math.sin(angle) * dist, 6)
            resolved_lng = round(base_p.lng + math.cos(angle) * dist, 6)
        else:
            resolved_lat = 38.7169
            resolved_lng = -9.1399

    # Create or find place
    place_id = f"custom_{str(uuid.uuid4())[:8]}"
    place = Place(
        place_id=place_id,
        name=req.place_name,
        category=req.category,
        lat=resolved_lat,
        lng=resolved_lng,
        est_cost=req.cost,
    )
    session.add(place)

    item = PlanItem(
        id=str(uuid.uuid4()),
        plan_id=plan.id,
        place_id=place.place_id,
        day_index=req.day_index,
        start_time=item_start_time,
        end_time=item_end_time,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PLAN_ITEM_NOT_FOUND",
                "message": f"PlanItem '{item_id}' not found.",
            },
        )

    if req.day_index is not None and req.day_index < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_DAY_INDEX",
                "message": "day_index must be a non-negative integer.",
            },
        )

    if req.cost is not None and req.cost < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_COST",
                "message": "cost cannot be negative.",
            },
        )

    if (
        req.start_time is not None
        and req.end_time is not None
        and req.end_time <= req.start_time
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_TIME_RANGE",
                "message": "end_time must be after start_time.",
            },
        )

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PLAN_ITEM_NOT_FOUND",
                "message": f"PlanItem '{item_id}' not found.",
            },
        )
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        return ValidationResult(is_valid=True, status=ValidationStatus.VALID, issues=[])

    plan_resp = assemble_plan_response(session, trip, plan)
    constraints = session.exec(
        select(Constraint).where(Constraint.trip_id == trip_id)
    ).all()

    budget_issues = check_budget(
        plan_resp.days, list(constraints), num_members=len(constraints)
    )
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    instruction = req.instruction.strip()
    if not instruction:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_INSTRUCTION",
                "message": "Refinement instruction cannot be empty.",
            },
        )

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PLAN_NOT_FOUND",
                "message": "A plan must be generated first before refining.",
            },
        )

    return AgentPlanner.refine_plan(
        session=session,
        trip=trip,
        current_plan=plan,
        instruction=instruction,
        user_id=req.user_id,
    )


@router.post("/ask", response_model=AskAgentResponse)
def ask_agent(
    trip_id: str,
    req: AskAgentRequest,
    session: Session = Depends(get_session),
):
    """
    Ask the AI agent an open-ended question about the destination or itinerary,
    e.g. 'Which places are the most popular to visit?' or 'Where is the best
    seafood within our $30 lunch budget?'.

    Uses the LLM when configured; falls back to a deterministic recommendation
    otherwise. Answers are advisory only and do not modify the plan.
    """
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    question = req.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_QUESTION",
                "message": "Question cannot be empty.",
            },
        )

    candidate_places = get_or_create_places_for_destination(session, trip.destination)
    trip_constraints = list(
        session.exec(select(Constraint).where(Constraint.trip_id == trip_id)).all()
    )

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    plan_days = assemble_plan_response(session, trip, plan).days if plan else None

    answer = call_gemini_ask(
        trip=trip,
        places=candidate_places,
        plan_days=plan_days,
        question=question,
        constraints=trip_constraints,
    )
    if not answer:
        answer = _fallback_ask_answer(trip, candidate_places, question)

    return AskAgentResponse(question=question, answer=answer)


def _fallback_ask_answer(
    trip: Trip,
    places: list[Place],
    question: str,
) -> str:
    """Deterministic recommendation response when the LLM is unavailable."""
    if not places:
        return (
            f"No venue data is available yet for {trip.destination}. "
            "Generate a plan first so the agent can recommend the best spots."
        )

    q = question.lower()
    lines: list[str] = [f"Here is a quick guide for {trip.destination}:", ""]
    seen_names: set[str] = set()

    def add_bullet(name: str, detail: str) -> None:
        key = name.lower().strip()
        if not key or key in seen_names:
            return
        seen_names.add(key)
        lines.append(f"- {name} — {detail}")

    if any(
        w in q
        for w in (
            "popular",
            "best",
            "top",
            "must",
            "famous",
            "recommend",
            "see",
            "visit",
        )
    ):
        attractions = [p for p in places if p.category not in FOOD_CATEGORIES]
        dining = [p for p in places if p.category in FOOD_CATEGORIES]
        for p in attractions[:4]:
            cost = "$0 (free)" if p.est_cost == 0 else f"${p.est_cost:.0f}"
            add_bullet(p.name, f"{p.category}, {cost}")
        if dining:
            lines.append("")
            lines.append("Best places to eat:")
            for p in dining[:3]:
                lines.append(f"- {p.name} — ${p.est_cost:.0f}")

    cheap = [p for p in places if p.est_cost <= 30]
    if any(w in q for w in ("cheap", "budget", "affordable", "free")) and cheap:
        lines.append("")
        lines.append("Budget-friendly picks:")
        for p in sorted(cheap, key=lambda x: x.est_cost)[:3]:
            add_bullet(p.name, "free" if p.est_cost == 0 else f"${p.est_cost:.0f}")

    if len(lines) <= 2:
        lines.append(f"Top venue to visit: {places[0].name} ({places[0].category}).")

    return "\n".join(lines)


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PLAN_NOT_FOUND",
                "message": "No plan exists yet to export.",
            },
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
