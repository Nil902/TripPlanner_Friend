"""
Trip management API endpoints with RBAC controls.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.core.security import (
    TripAccess,
    create_guest_token,
    get_current_user,
    get_current_user_optional,
    get_trip_access,
    require_trip_manager,
)
from app.models.schema import (
    Constraint,
    CreateTripRequest,
    Expense,
    JoinTripRequest,
    JoinTripResponse,
    MemberResponse,
    Plan,
    PlanItem,
    Trip,
    TripMember,
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
    current_user: User = Depends(get_current_user),
):
    """Create a new trip room."""
    if req.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Creator ID must match your account.",
            },
        )
    if not req.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_TITLE",
                "message": "Trip title cannot be empty.",
            },
        )
    if not req.destination.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_DESTINATION",
                "message": "Trip destination cannot be empty.",
            },
        )
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
    current_user: User = Depends(get_current_user),
):
    """List only trips owned by or joined by the authenticated account."""
    trips = session.exec(select(Trip).order_by(col(Trip.created_at).desc())).all()
    return [
        trip
        for trip in trips
        if current_user.is_admin or current_user.id in trip.member_ids
    ]


@router.get("/{trip_id}", response_model=Trip)
def get_trip(
    trip_id: str,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
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
    response_model=JoinTripResponse,
    status_code=status.HTTP_200_OK,
)
def join_trip(
    trip_id: str,
    req: JoinTripRequest,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
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

    if current_user:
        if req.user_id and req.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN",
                    "message": "Cannot join as another account.",
                },
            )
        user_id = current_user.id
    else:
        if req.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN",
                    "message": "Guest identity is assigned by the server.",
                },
            )
        user_id = f"guest_{uuid.uuid4().hex}"

    current_members = list(trip.member_ids or [])
    if user_id not in current_members:
        current_members.append(user_id)
        trip.member_ids = current_members
        session.add(trip)
    member_record = session.get(TripMember, (trip_id, user_id))
    if member_record is None:
        member_record = TripMember(trip_id=trip_id, user_id=user_id, name=clean_name)
    else:
        member_record.name = clean_name
    session.add(member_record)
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

    return JoinTripResponse(
        id=user_id,
        name=clean_name,
        initials=compute_initials(clean_name),
        submitted=constraint_exists,
        role=role,
        access_token=None if current_user else create_guest_token(trip_id, user_id),
    )


@router.get("/{trip_id}/members", response_model=list[MemberResponse])
def get_trip_members(
    trip_id: str,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
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

    member_ids_list: list[str] = []
    for mid in trip.member_ids or []:
        if mid not in seen:
            seen.add(mid)
            member_ids_list.append(mid)

    # Batch-load all user records in a single query
    user_map: dict[str, User] = {}
    name_map: dict[str, str] = {}
    if member_ids_list:
        db_users = session.exec(
            select(User).where(col(User.id).in_(member_ids_list))
        ).all()
        user_map = {u.id: u for u in db_users}
        name_map = {
            member.user_id: member.name
            for member in session.exec(
                select(TripMember).where(TripMember.trip_id == trip_id)
            ).all()
        }

    for mid in member_ids_list:
        role = "creator" if mid == trip.creator_id else "joiner"
        submitted = mid in submitted_user_ids

        user = user_map.get(mid)
        if user and user.name:
            name = user.name
        elif mid in name_map:
            name = name_map[mid]
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
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
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

    is_creator = not access.is_guest and access.user_id == trip.creator_id
    if is_creator or access.is_admin:
        return TripPermissionsResponse(
            can_manage=True,
            is_creator=is_creator,
            role="creator" if is_creator else "admin",
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
    access: TripAccess = Depends(require_trip_manager),
):
    """Update trip properties for its creator or an administrator."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    if req.title is not None and not req.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_TITLE",
                "message": "Trip title cannot be empty.",
            },
        )
    if req.destination is not None and not req.destination.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_DESTINATION",
                "message": "Trip destination cannot be empty.",
            },
        )

    # Validate date range when either date is being updated
    new_start = req.start_date if req.start_date is not None else trip.start_date
    new_end = req.end_date if req.end_date is not None else trip.end_date
    if new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_DATES",
                "message": "Trip end date must be on or after start date.",
            },
        )

    removed_member_ids: set[str] = set()
    if req.member_ids is not None:
        supplied = req.member_ids
        existing = set(trip.member_ids or [])
        if (
            trip.creator_id not in supplied
            or len(supplied) != len(set(supplied))
            or not set(supplied).issubset(existing)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_MEMBERS",
                    "message": "Member updates may only remove non-creator members.",
                },
            )
        removed_member_ids = existing - set(supplied)
        if removed_member_ids:
            trip_expenses = session.exec(
                select(Expense).where(Expense.trip_id == trip_id)
            ).all()
            if any(
                expense.paid_by in removed_member_ids
                or any(
                    member in removed_member_ids
                    for member in (expense.split_between or [])
                )
                for expense in trip_expenses
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "MEMBER_HAS_EXPENSES",
                        "message": "Resolve or reassign this member's expenses before removal.",
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
        for removed_id in removed_member_ids:
            for constraint in session.exec(
                select(Constraint).where(
                    Constraint.trip_id == trip_id,
                    Constraint.user_id == removed_id,
                )
            ):
                session.delete(constraint)
            member = session.get(TripMember, (trip_id, removed_id))
            if member:
                session.delete(member)

    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: str,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(require_trip_manager),
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

    # Cascade-delete child records manually — SQLite/SQLModel do not enforce
    # FK cascade by default, so we must remove children before the parent.
    trip_plans = session.exec(select(Plan).where(Plan.trip_id == trip_id)).all()
    for plan in trip_plans:
        plan_items = session.exec(
            select(PlanItem).where(PlanItem.plan_id == plan.id)
        ).all()
        for item in plan_items:
            session.delete(item)
        session.delete(plan)

    constraints_to_delete = session.exec(
        select(Constraint).where(Constraint.trip_id == trip_id)
    ).all()
    for c in constraints_to_delete:
        session.delete(c)

    expenses_to_delete = session.exec(
        select(Expense).where(Expense.trip_id == trip_id)
    ).all()
    for e in expenses_to_delete:
        session.delete(e)

    members_to_delete = session.exec(
        select(TripMember).where(TripMember.trip_id == trip_id)
    ).all()
    for member in members_to_delete:
        session.delete(member)

    session.delete(trip)
    session.commit()
    return None
