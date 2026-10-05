"""
Participant constraint intake API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.security import TripAccess, get_trip_access
from app.models.schema import Constraint, SubmitConstraintRequest, Trip, utc_now

router = APIRouter(prefix="/api/v1/trips/{trip_id}/constraints", tags=["Constraints"])


@router.post("", response_model=Constraint)
def submit_constraint(
    trip_id: str,
    req: SubmitConstraintRequest,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
):
    """Submit or update constraints for a trip member."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    if req.user_id != access.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Submit only your own constraints.",
            },
        )

    if req.budget_per_day <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_BUDGET",
                "message": "budget_per_day must be greater than 0.",
            },
        )

    # Check for existing constraint for this user
    existing = session.exec(
        select(Constraint).where(
            Constraint.trip_id == trip_id, Constraint.user_id == req.user_id
        )
    ).first()

    if existing:
        existing.budget_per_day = req.budget_per_day
        existing.dietary = req.dietary or []
        existing.style_tags = req.style_tags or []
        existing.must_see = req.must_see or []
        existing.must_avoid = req.must_avoid or []
        existing.updated_at = utc_now()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    constraint = Constraint(
        trip_id=trip_id,
        user_id=req.user_id,
        budget_per_day=req.budget_per_day,
        dietary=req.dietary or [],
        style_tags=req.style_tags or [],
        must_see=req.must_see or [],
        must_avoid=req.must_avoid or [],
    )
    session.add(constraint)
    session.commit()
    session.refresh(constraint)
    return constraint


@router.get("", response_model=list[Constraint])
def list_constraints(
    trip_id: str,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
):
    """List all submitted constraints for a trip."""
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
    return constraints
