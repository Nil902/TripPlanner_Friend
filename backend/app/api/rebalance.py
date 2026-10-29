"""
Dynamic disruption rebalancing API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from app.core.access import require_trip_manager
from app.core.db import get_session
from app.models.schema import DisruptionEvent, Plan, PlanResponse, Trip
from app.services.agent_planner import AgentPlanner

router = APIRouter(
    prefix="/api/v1/trips/{trip_id}/rebalance",
    tags=["Rebalance"],
    dependencies=[Depends(require_trip_manager)],
)


@router.post("", response_model=PlanResponse)
def rebalance_trip(
    trip_id: str,
    disruption: DisruptionEvent,
    session: Session = Depends(get_session),
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

    if (
        disruption.day_index < 0
        or disruption.day_index > (trip.end_date - trip.start_date).days
    ):
        raise HTTPException(
            400,
            detail={
                "code": "INVALID_DAY_INDEX",
                "message": "Choose a day within this trip.",
            },
        )
    if (
        disruption.delay_minutes is not None
        and not 0 <= disruption.delay_minutes <= 1440
    ):
        raise HTTPException(
            400,
            detail={
                "code": "INVALID_DELAY",
                "message": "Choose a delay between 0 and 1440 minutes.",
            },
        )

    return AgentPlanner.rebalance(session, trip, current_plan, disruption)
