"""Verified account and trip-scoped guest access to trip resources."""

from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlmodel import Session

from app.core.db import get_session
from app.core.security import bearer_scheme, decode_access_token
from app.models.schema import Trip, TripGuest, User


@dataclass(frozen=True)
class Identity:
    id: str
    name: str
    is_admin: bool = False
    guest_trip_id: str | None = None


@dataclass(frozen=True)
class TripAccess:
    trip: Trip
    identity: Identity

    @property
    def can_manage(self) -> bool:
        return self.identity.guest_trip_id is None and (
            self.identity.is_admin or self.identity.id == self.trip.creator_id
        )


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={
            "code": "UNAUTHORIZED",
            "message": "Please sign in or rejoin this trip.",
        },
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_identity_optional(
    auth: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Identity | None:
    if auth is None:
        return None
    subject = decode_access_token(auth.credentials)
    if not subject:
        raise unauthorized()
    if subject.startswith("guest."):
        parts = subject.split(".")
        if len(parts) != 3:
            raise unauthorized()
        _, trip_id, guest_id = parts
        guest = session.get(TripGuest, guest_id)
        if guest is None or guest.trip_id != trip_id:
            raise unauthorized()
        return Identity(id=guest.id, name=guest.name, guest_trip_id=trip_id)
    user = session.get(User, subject)
    if user is None:
        raise unauthorized()
    return Identity(id=user.id, name=user.name, is_admin=user.is_admin)


def get_identity(
    identity: Identity | None = Depends(get_identity_optional),
) -> Identity:
    if identity is None:
        raise unauthorized()
    return identity


def require_trip_member(
    trip_id: str,
    identity: Identity = Depends(get_identity),
    session: Session = Depends(get_session),
) -> TripAccess:
    trip = session.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "TRIP_NOT_FOUND", "message": "This trip does not exist."},
        )
    if identity.guest_trip_id is not None and identity.guest_trip_id != trip.id:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "FORBIDDEN",
                "message": "This guest session belongs to another trip.",
            },
        )
    if not identity.is_admin and identity.id not in set(
        (trip.member_ids or []) + [trip.creator_id]
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "FORBIDDEN",
                "message": "You are not a member of this trip.",
            },
        )
    return TripAccess(trip=trip, identity=identity)


def require_trip_manager(
    access: TripAccess = Depends(require_trip_member),
) -> TripAccess:
    if not access.can_manage:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "FORBIDDEN",
                "message": "Only the trip creator or an administrator can manage this trip.",
            },
        )
    return access
