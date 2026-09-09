"""
Trip management API endpoints with RBAC controls.
"""

import re

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.core.security import (
    bearer_scheme,
    decode_access_token,
    get_current_user_optional,
)
from app.models.schema import (
    Constraint,
    CreateTripRequest,
    JoinTripRequest,
    MemberResponse,
    Trip,
    TripPermissionsResponse,
    TripStatus,
    UpdateTripRequest,
    User,
)

router = APIRouter(prefix="/api/v1/trips", tags=["Trips"])


def compute_initials(name: str) -> str:
    """Compute 1 or 2 letter uppercase initials from a name."""
    clean = name.strip()
    if not clean:
        return "??"
    parts = clean.split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    if len(clean) >= 2:
        return clean[:2].upper()
    return clean[:1].upper()


@router.post("", response_model=Trip, status_code=status.HTTP_201_CREATED)
def create_trip(
    req: CreateTripRequest,
    session: Session = Depends(get_session),
):
    """Create a new trip room."""
    if req.end_date < req.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_DATES",
                "message": "Trip end date must be on or after start date.",
            },
        )

    trip = Trip(
        title=req.title,
        destination=req.destination,
        start_date=req.start_date,
        end_date=req.end_date,
        creator_id=req.creator_id,
        status=TripStatus.COLLECTING_CONSTRAINTS,
        member_ids=[req.creator_id],
    )
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


@router.get("", response_model=list[Trip])
def list_trips(
    session: Session = Depends(get_session),
):
    """List all trips."""
    trips = session.exec(select(Trip).order_by(col(Trip.created_at).desc())).all()
    return trips


@router.get("/{trip_id}", response_model=Trip)
def get_trip(
    trip_id: str,
    session: Session = Depends(get_session),
):
    """Retrieve trip details by ID."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )
    return trip


@router.post(
    "/{trip_id}/join",
    response_model=MemberResponse,
    status_code=status.HTTP_200_OK,
)
def join_trip(
    trip_id: str,
    req: JoinTripRequest,
    session: Session = Depends(get_session),
):
    """Join a trip room as a participant without authentication."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    clean_name = req.name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_NAME",
                "message": "Member name cannot be empty.",
            },
        )

    if req.user_id and req.user_id.strip():
        user_id = req.user_id.strip()
    else:
        user_id = re.sub(r"\s+", "_", clean_name.lower())

    current_members = list(trip.member_ids or [])
    if user_id not in current_members:
        current_members.append(user_id)
        trip.member_ids = current_members
        session.add(trip)
        session.commit()
        session.refresh(trip)

    role = "creator" if user_id == trip.creator_id else "joiner"
    constraint_exists = (
        session.exec(
            select(Constraint).where(
                Constraint.trip_id == trip_id,
                Constraint.user_id == user_id,
            )
        ).first()
        is not None
    )

    return MemberResponse(
        id=user_id,
        name=clean_name,
        initials=compute_initials(clean_name),
        submitted=constraint_exists,
        role=role,
    )


@router.get("/{trip_id}/members", response_model=list[MemberResponse])
def get_trip_members(
    trip_id: str,
    session: Session = Depends(get_session),
):
    """Retrieve all members of a trip with roles, names, initials, and submission status."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    trip_constraints = session.exec(
        select(Constraint).where(Constraint.trip_id == trip_id)
    ).all()
    submitted_user_ids = {c.user_id for c in trip_constraints}

    members: list[MemberResponse] = []
    seen: set[str] = set()

    for mid in trip.member_ids or []:
        if mid in seen:
            continue
        seen.add(mid)

        role = "creator" if mid == trip.creator_id else "joiner"
        submitted = mid in submitted_user_ids

        # Look up User table for name, or format name from ID
        user = session.get(User, mid)
        if user and user.name:
            name = user.name
        else:
            name = mid.replace("_", " ").title()

        members.append(
            MemberResponse(
                id=mid,
                name=name,
                initials=compute_initials(name),
                submitted=submitted,
                role=role,
            )
        )

    return members


@router.get("/{trip_id}/permissions", response_model=TripPermissionsResponse)
def get_trip_permissions(
    trip_id: str,
    user_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
    auth: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
):
    """Check effective trip permissions for creator, joiner, or administrator."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    uid = current_user.id if current_user else user_id
    is_admin = bool(current_user.is_admin) if current_user else False

    if not uid and auth and auth.credentials:
        uid = decode_access_token(auth.credentials)

    if not is_admin and uid:
        db_user = session.get(User, uid)
        if db_user and db_user.is_admin:
            is_admin = True

    if (
        (uid and uid == trip.creator_id)
        or is_admin
        or (x_user_role and x_user_role.strip().lower() in ("creator", "admin"))
    ):
        return TripPermissionsResponse(
            can_manage=True,
            is_creator=True,
            role="creator",
        )

    return TripPermissionsResponse(
        can_manage=False,
        is_creator=False,
        role="joiner",
    )


@router.put("/{trip_id}", response_model=Trip)
def update_trip(
    trip_id: str,
    req: UpdateTripRequest,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
    auth: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
):
    """Update trip properties (destination, dates, title, status, members). Allows all edits."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    # RBAC check: X-User-Role header
    if x_user_role and x_user_role.strip().lower() not in ("creator", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Only the trip creator can update this trip.",
            },
        )

    # RBAC check: authenticated user / token
    caller_id = current_user.id if current_user else None
    is_admin = bool(current_user.is_admin) if current_user else False

    if not caller_id and auth and auth.credentials:
        caller_id = decode_access_token(auth.credentials)
        if caller_id:
            db_u = session.get(User, caller_id)
            if db_u and db_u.is_admin:
                is_admin = True

    if caller_id is not None:
        if caller_id != trip.creator_id and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN",
                    "message": "Only the trip creator can update this trip.",
                },
            )

    if req.title is not None:
        trip.title = req.title
    if req.destination is not None:
        trip.destination = req.destination
    if req.start_date is not None:
        trip.start_date = req.start_date
    if req.end_date is not None:
        trip.end_date = req.end_date
    if req.status is not None:
        trip.status = req.status
    if req.member_ids is not None:
        trip.member_ids = req.member_ids

    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: str,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
    auth: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
):
    """Delete a trip."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    # RBAC check: X-User-Role header
    if x_user_role and x_user_role.strip().lower() not in ("creator", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Only the trip creator can delete this trip.",
            },
        )

    # RBAC check: authenticated user / token
    caller_id = current_user.id if current_user else None
    is_admin = bool(current_user.is_admin) if current_user else False

    if not caller_id and auth and auth.credentials:
        caller_id = decode_access_token(auth.credentials)
        if caller_id:
            db_u = session.get(User, caller_id)
            if db_u and db_u.is_admin:
                is_admin = True

    if caller_id is not None:
        if caller_id != trip.creator_id and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN",
                    "message": "Only the trip creator can delete this trip.",
                },
            )

    session.delete(trip)
    session.commit()
    return None
