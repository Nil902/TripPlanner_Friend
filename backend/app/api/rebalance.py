"""
Dynamic disruption rebalancing API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.models.schema import DisruptionEvent, Plan, PlanResponse, Trip
from app.services.agent_planner import AgentPlanner

router = APIRouter(prefix="/api/v1/trips/{trip_id}/rebalance", tags=["Rebalance"])


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

    return AgentPlanner.rebalance(session, trip, current_plan, disruption)
