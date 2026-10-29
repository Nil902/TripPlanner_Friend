"""Trip lifecycle and invitation joins with verified ownership."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import String, cast, or_
from sqlmodel import Session, col, select

from app.core.access import (
    Identity,
    TripAccess,
    get_identity_optional,
    require_trip_manager,
    require_trip_member,
)
from app.core.db import get_session
from app.core.security import create_guest_access_token, get_current_user
from app.models.schema import (
    Constraint,
    CreateTripRequest,
    JoinTripRequest,
    MemberResponse,
    Trip,
    TripGuest,
    TripPermissionsResponse,
    TripStatus,
    UpdateTripRequest,
    User,
)
from app.services.trip_service import delete_trip_records

router = APIRouter(prefix="/api/v1/trips", tags=["Trips"])


def compute_initials(name: str) -> str:
    parts = name.strip().split()
    if not parts:
        return "??"
    if len(parts) > 1:
        return (parts[0][0] + parts[1][0]).upper()
    return parts[0][:2].upper()


def validate_trip_fields(title: str, destination: str, num_days: int) -> None:
    if not title.strip() or len(title) > 200:
        raise HTTPException(
            400,
            detail={
                "code": "INVALID_TITLE",
                "message": "Use a trip title between 1 and 200 characters.",
            },
        )
    if not destination.strip() or len(destination) > 200:
        raise HTTPException(
            400,
            detail={
                "code": "INVALID_DESTINATION",
                "message": "Use a destination between 1 and 200 characters.",
            },
        )
    if num_days < 1 or num_days > 31:
        raise HTTPException(
            400,
            detail={
                "code": "INVALID_DATES",
                "message": "Choose a trip lasting between 1 and 31 days.",
            },
        )


@router.post("", response_model=Trip, status_code=status.HTTP_201_CREATED)
def create_trip(
    req: CreateTripRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Trip:
    if req.creator_id is not None and req.creator_id != current_user.id:
        raise HTTPException(
            403,
            detail={
                "code": "FORBIDDEN",
                "message": "You can only create trips for your own account.",
            },
        )
    validate_trip_fields(
        req.title, req.destination, (req.end_date - req.start_date).days + 1
    )
    trip = Trip(
        title=req.title.strip(),
        destination=req.destination.strip(),
        start_date=req.start_date,
        end_date=req.end_date,
        creator_id=current_user.id,
        member_ids=[current_user.id],
        status=TripStatus.COLLECTING_CONSTRAINTS,
    )
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


@router.get("", response_model=list[Trip])
def list_trips(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Trip]:
    query = select(Trip)
    if not current_user.is_admin:
        query = query.where(
            or_(
                col(Trip.creator_id) == current_user.id,
                cast(Trip.member_ids, String).contains(
                    f'"{current_user.id}"', autoescape=True
                ),
            )
        )
    return list(session.exec(query.order_by(col(Trip.created_at).desc())).all())


@router.get("/{trip_id}", response_model=Trip)
def get_trip(access: TripAccess = Depends(require_trip_member)) -> Trip:
    return access.trip


@router.post(
    "/{trip_id}/join", response_model=MemberResponse, openapi_extra={"security": [{}]}
)
def join_trip(
    trip_id: str,
    req: JoinTripRequest,
    identity: Identity | None = Depends(get_identity_optional),
    session: Session = Depends(get_session),
) -> MemberResponse:
    trip = session.exec(
        select(Trip).where(Trip.id == trip_id).with_for_update()
    ).first()
    if trip is None:
        raise HTTPException(
            404,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": "This invitation does not match a trip.",
            },
        )
    name = req.name.strip()
    if not name:
        raise HTTPException(
            400, detail={"code": "INVALID_NAME", "message": "Please enter your name."}
        )
    session_token = None
    if identity is not None and identity.guest_trip_id is None:
        if req.user_id is not None and req.user_id != identity.id:
            raise HTTPException(
                403,
                detail={
                    "code": "FORBIDDEN",
                    "message": "You can only join as yourself.",
                },
            )
        member_id, name = identity.id, identity.name
    elif identity is not None and identity.guest_trip_id == trip.id:
        member_id, name = identity.id, identity.name
        session_token = create_guest_access_token(trip.id, member_id)
    else:
        guest = TripGuest(trip_id=trip.id, name=name)
        session.add(guest)
        member_id = guest.id
        session_token = create_guest_access_token(trip.id, member_id)
    members = list(trip.member_ids or [])
    if member_id not in members:
        if len(members) >= 100:
            raise HTTPException(
                400,
                detail={
                    "code": "TRIP_FULL",
                    "message": "This trip has reached its member limit.",
                },
            )
        trip.member_ids = members + [member_id]
        session.add(trip)
    session.commit()
    submitted = (
        session.exec(
            select(Constraint).where(
                Constraint.trip_id == trip.id,
                Constraint.user_id == member_id,
            )
        ).first()
        is not None
    )
    return MemberResponse(
        id=member_id,
        name=name,
        initials=compute_initials(name),
        submitted=submitted,
        role="creator" if member_id == trip.creator_id else "joiner",
        session_token=session_token,
    )


@router.get("/{trip_id}/members", response_model=list[MemberResponse])
def get_trip_members(
    access: TripAccess = Depends(require_trip_member),
    session: Session = Depends(get_session),
) -> list[MemberResponse]:
    trip = access.trip
    member_ids = list(dict.fromkeys(trip.member_ids or []))
    users = session.exec(select(User).where(col(User.id).in_(member_ids))).all()
    guests = session.exec(select(TripGuest).where(TripGuest.trip_id == trip.id)).all()
    names = {u.id: u.name for u in users}
    names.update({g.id: g.name for g in guests})
    constraints = session.exec(
        select(Constraint).where(Constraint.trip_id == trip.id)
    ).all()
    submitted = {c.user_id for c in constraints}
    return [
        MemberResponse(
            id=member_id,
            name=names.get(member_id, "Trip member"),
            initials=compute_initials(names.get(member_id, "Trip member")),
            submitted=member_id in submitted,
            role="creator" if member_id == trip.creator_id else "joiner",
        )
        for member_id in member_ids
    ]


@router.get("/{trip_id}/permissions", response_model=TripPermissionsResponse)
def get_trip_permissions(
    access: TripAccess = Depends(require_trip_member),
) -> TripPermissionsResponse:
    return TripPermissionsResponse(
        can_manage=access.can_manage,
        is_creator=access.identity.id == access.trip.creator_id
        and access.identity.guest_trip_id is None,
        role="admin"
        if access.identity.is_admin
        else "creator"
        if access.can_manage
        else "joiner",
    )


@router.put("/{trip_id}", response_model=Trip)
def update_trip(
    req: UpdateTripRequest,
    access: TripAccess = Depends(require_trip_manager),
    session: Session = Depends(get_session),
) -> Trip:
    trip = access.trip
    title = req.title if req.title is not None else trip.title
    destination = req.destination if req.destination is not None else trip.destination
    start_date = req.start_date if req.start_date is not None else trip.start_date
    end_date = req.end_date if req.end_date is not None else trip.end_date
    validate_trip_fields(title, destination, (end_date - start_date).days + 1)
    if req.member_ids is not None:
        members = list(dict.fromkeys(req.member_ids))
        if trip.creator_id not in members or not set(members).issubset(
            trip.member_ids or []
        ):
            raise HTTPException(
                400,
                detail={
                    "code": "INVALID_MEMBERS",
                    "message": "Keep the creator and use invitations to add members.",
                },
            )
        trip.member_ids = members
    trip.title, trip.destination = title.strip(), destination.strip()
    trip.start_date, trip.end_date = start_date, end_date
    if req.status is not None:
        if not access.identity.is_admin and (
            req.status == TripStatus.FLAGGED or trip.status == TripStatus.FLAGGED
        ):
            raise HTTPException(
                403,
                detail={
                    "code": "FORBIDDEN",
                    "message": "Only an administrator can change moderation status.",
                },
            )
        trip.status = req.status
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    access: TripAccess = Depends(require_trip_manager),
    session: Session = Depends(get_session),
) -> None:
    delete_trip_records(session, access.trip)
