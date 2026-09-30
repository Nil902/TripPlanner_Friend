"""
Dynamic disruption rebalancing API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.core.security import TripAccess, require_trip_manager
from app.models.schema import (
    DisruptionEvent,
    DisruptionType,
    Plan,
    PlanItem,
    PlanResponse,
    Trip,
)
from app.services.agent_planner import AgentPlanner

router = APIRouter(prefix="/api/v1/trips/{trip_id}/rebalance", tags=["Rebalance"])


@router.post("", response_model=PlanResponse)
def rebalance_trip(
    trip_id: str,
    disruption: DisruptionEvent,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(require_trip_manager),
):
    """
    Dynamically rebalances the itinerary in response to a disruption
    (venue closed, flight delay, weather, etc.) by isolating the affected slice
    and preserving plan version history.
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

    current_plan = session.exec(
        select(Plan).where(Plan.trip_id == trip_id).order_by(col(Plan.version).desc())
    ).first()

    if not current_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NO_PLAN_EXISTS",
                "message": "Cannot rebalance a trip without an initial generated plan.",
            },
        )

    day_count = (trip.end_date - trip.start_date).days + 1
    if disruption.day_index < 0 or disruption.day_index >= day_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_DAY_INDEX",
                "message": "Affected day is outside the trip.",
            },
        )
    if disruption.type == DisruptionType.VENUE_CLOSED:
        affected_place = session.exec(
            select(PlanItem).where(
                PlanItem.plan_id == current_plan.id,
                PlanItem.day_index == disruption.day_index,
                PlanItem.place_id == disruption.place_id,
            )
        ).first()
        if disruption.place_id is None or affected_place is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "VENUE_NOT_IN_PLAN",
                    "message": "Select a venue scheduled on the affected day.",
                },
            )
    elif disruption.type == DisruptionType.FLIGHT_DELAYED:
        if disruption.delay_minutes is None or disruption.delay_minutes <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_DELAY",
                    "message": "A positive delay is required.",
                },
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "UNSUPPORTED_DISRUPTION",
                "message": "Only venue closures and flight delays are currently supported.",
            },
        )

    return AgentPlanner.rebalance(session, trip, current_plan, disruption)
