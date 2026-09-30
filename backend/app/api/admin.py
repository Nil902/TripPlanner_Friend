"""
Platform Administration API endpoints.
Provides overview KPIs, global trip moderation, creator accounts inspection,
API telemetry (Places, Distance Matrix, Gemini LLM), and system health telemetry.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.security import (
    create_access_token,
    get_current_admin_user,
    verify_password,
)
from app.models.schema import (
    AuthResponse,
    LoginRequest,
    Plan,
    Trip,
    TripStatus,
    User,
    UserResponse,
)

router = APIRouter(prefix="/api/v1/admin", tags=["Platform Administration"])


class UpdateTripStatusRequest(BaseModel):
    status: str  # active | flagged | completed


class AdminTripItem(BaseModel):
    id: str
    name: str
    destination: str
    creator: str
    creator_email: str
    members: int
    status: str
    created: str
    start_date: str
    end_date: str


class AdminUserItem(BaseModel):
    id: str
    name: str
    email: str
    is_admin: bool
    trips_count: int
    created_at: str


class ApiUsageItem(BaseModel):
    name: str
    used: int
    freeLimit: int
    cost: float
    category: str


class SystemHealthNode(BaseModel):
    name: str
    status: str  # up | degraded | down
    detail: str
    latency_ms: float | None = None


@router.post("/login", response_model=AuthResponse)
def admin_login(
    req: LoginRequest,
    session: Session = Depends(get_session),
):
    """Authenticate administrator credentials and return bearer token."""
    user = session.exec(
        select(User).where(User.email == req.email.lower().strip())
    ).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Invalid administrator email or password.",
            },
        )
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Access denied. Administrator privileges required.",
            },
        )

    token = create_access_token(user.id)
    return AuthResponse(
        token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/overview")
def get_admin_overview(
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
):
    """Retrieve platform KPI metrics."""
    trips = session.exec(select(Trip)).all()
    users = session.exec(select(User)).all()
    active_trips = [t for t in trips if t.status != TripStatus.COMPLETED]
    creators_count = len(users)

    plans = session.exec(select(Plan)).all()
    valid_plans = sum(1 for plan in plans if plan.validation_status.value == "valid")

    return {
        "metrics": [
            {
                "label": "Active trips",
                "value": str(len(active_trips)),
                "sub": "Trips that are not completed",
            },
            {
                "label": "Registered users",
                "value": str(creators_count),
                "sub": f"{creators_count} accounts on platform",
            },
            {
                "label": "Valid saved plans",
                "value": str(valid_plans),
                "sub": "Current validation status of saved versions",
            },
            {
                "label": "Saved plan versions",
                "value": str(len(plans)),
                "sub": "Includes manual edits and rebalances",
            },
        ],
        "summary": {
            "total_trips": len(trips),
            "active_trips": len(active_trips),
            "total_users": creators_count,
        },
    }


@router.get("/trips", response_model=list[AdminTripItem])
def list_admin_trips(
    query: str | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
):
    """List all trips on the platform with creator details and member counts."""
    trips = session.exec(select(Trip)).all()
    users = {u.id: u for u in session.exec(select(User)).all()}

    results: list[AdminTripItem] = []
    for t in trips:
        creator = users.get(t.creator_id)
        creator_name = creator.name if creator else "Unknown"
        creator_email = creator.email if creator else "unknown@domain.com"
        members_count = len(t.member_ids) if t.member_ids else 1

        trip_status = (
            "closed" if t.status == TripStatus.COMPLETED else str(t.status.value)
        )

        item = AdminTripItem(
            id=t.id,
            name=t.title,
            destination=t.destination,
            creator=creator_name,
            creator_email=creator_email,
            members=members_count,
            status=trip_status,
            created=t.created_at.strftime("%b %d"),
            start_date=str(t.start_date),
            end_date=str(t.end_date),
        )

        if query:
            q = query.lower()
            if (
                q not in item.name.lower()
                and q not in item.creator.lower()
                and q not in item.destination.lower()
            ):
                continue

        if status_filter and status_filter != "all":
            if item.status != status_filter:
                continue

        results.append(item)

    return results


@router.patch("/trips/{trip_id}/status")
def update_trip_status(
    trip_id: str,
    req: UpdateTripStatusRequest,
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
):
    """Update trip moderation status (active, flagged, closed)."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    if req.status == "closed":
        trip.status = TripStatus.COMPLETED
    elif req.status == "active":
        trip.status = TripStatus.IN_PROGRESS
    elif req.status == "flagged":
        trip.status = TripStatus.FLAGGED

    session.add(trip)
    session.commit()
    session.refresh(trip)
    return {"status": "ok", "trip_id": trip.id, "new_status": req.status}


@router.delete("/trips/{trip_id}")
def delete_trip_admin(
    trip_id: str,
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Administrative force deletion of a trip with full cascade."""
    from app.models.schema import Constraint, Expense, PlanItem, TripMember

    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    # Manually cascade: PlanItems -> Plans -> Constraints -> Expenses -> Trip
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
    return {"status": "deleted", "trip_id": trip_id}


@router.get("/users", response_model=list[AdminUserItem])
def list_admin_users(
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
):
    """List registered user accounts and trip statistics."""
    users = session.exec(select(User)).all()
    trips = session.exec(select(Trip)).all()

    trip_counts: dict[str, int] = {}
    for t in trips:
        trip_counts[t.creator_id] = trip_counts.get(t.creator_id, 0) + 1

    return [
        AdminUserItem(
            id=u.id,
            name=u.name or "Unnamed Creator",
            email=u.email,
            is_admin=u.is_admin,
            trips_count=trip_counts.get(u.id, 0),
            created_at=u.created_at.strftime("%b %d, %Y"),
        )
        for u in users
    ]


@router.get("/api-usage", response_model=list[ApiUsageItem])
def get_api_usage(
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
):
    """Return recorded API usage; no usage collector is configured yet."""
    return []


@router.get("/system-health", response_model=list[SystemHealthNode])
def get_system_health(
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
) -> list[SystemHealthNode]:
    """Live system diagnostics for services directly probed by this endpoint."""
    import os
    import time

    results: list[SystemHealthNode] = []

    # 1. Database probe — run a trivial query and time it
    try:
        t0 = time.perf_counter()
        session.exec(select(User).limit(1)).first()
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        results.append(
            SystemHealthNode(
                name="Postgres / SQLite Database",
                status="up",
                detail=f"{db_latency_ms}ms query latency",
                latency_ms=db_latency_ms,
            )
        )
    except Exception:
        results.append(
            SystemHealthNode(
                name="Postgres / SQLite Database",
                status="down",
                detail="Database query failed",
                latency_ms=None,
            )
        )

    # 2. Redis probe — attempt PING via redis-py if REDIS_URL is configured
    redis_url = os.environ.get("REDIS_URL", "")
    if redis_url:
        try:
            import redis as redis_lib

            t0 = time.perf_counter()
            r = redis_lib.from_url(redis_url, socket_connect_timeout=2)
            r.ping()
            redis_latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            results.append(
                SystemHealthNode(
                    name="Redis Cache",
                    status="up",
                    detail=f"{redis_latency_ms}ms PING latency",
                    latency_ms=redis_latency_ms,
                )
            )
        except Exception:
            results.append(
                SystemHealthNode(
                    name="Redis Cache",
                    status="down",
                    detail="Redis PING failed",
                    latency_ms=None,
                )
            )
    else:
        results.append(
            SystemHealthNode(
                name="Redis Cache",
                status="degraded",
                detail="REDIS_URL not configured — cache layer disabled",
                latency_ms=None,
            )
        )

    return results
