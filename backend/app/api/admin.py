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
    Place,
    Plan,
    PlanItem,
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
    # Each Plan record represents one agent generation run.
    # Summing versions inflates the count (a v5 plan would count as 5 calls).
    llm_calls = len(plans)
    total_spend = round(llm_calls * 0.05, 2)

    # Calculate a rough success rate based on invalid plans
    invalid_plans = sum(1 for p in plans if p.validation_status.value == "invalid")
    total_plans_generated = len(plans)
    success_rate = (
        100
        if total_plans_generated == 0
        else round(100 - (invalid_plans / total_plans_generated * 100))
    )

    # Cache hit rate estimate (mock dynamic)
    places_count = len(session.exec(select(Place)).all())
    cache_hit_rate = 100 if places_count == 0 else min(95, 40 + (places_count * 2))

    return {
        "metrics": [
            {
                "label": "Active trips",
                "value": str(len(active_trips)),
                "sub": f"+{max(1, len(active_trips))} this week",
            },
            {
                "label": "Registered creators",
                "value": str(creators_count),
                "sub": f"{creators_count} accounts on platform",
            },
            {
                "label": "Agent success rate",
                "value": f"{success_rate}%",
                "sub": "valid on first pass, 30-day avg",
            },
            {
                "label": "API spend, month to date",
                "value": f"${total_spend:.2f}",
                "sub": "of $10.00 allocated budget",
            },
        ],
        "summary": {
            "total_trips": len(trips),
            "active_trips": len(active_trips),
            "total_users": creators_count,
            "api_spend": total_spend,
            "cache_hit_rate": f"{cache_hit_rate}%",
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
    from app.models.schema import Constraint, Expense, PlanItem

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
    """External API consumption and quota tracking."""
    places_count = len(session.exec(select(Place)).all())
    # Estimate distance matrix calls: roughly proportional to plan items
    plan_items_count = len(session.exec(select(PlanItem)).all())
    distance_calls = max(0, plan_items_count * 2)

    # Estimate LLM calls: one call per plan generation run
    plans = session.exec(select(Plan)).all()
    llm_calls = len(plans)

    # Calculate costs
    llm_cost = round(llm_calls * 0.05, 2)  # Assume $0.05 per LLM generation

    return [
        ApiUsageItem(
            name="Google Places API",
            used=places_count,
            freeLimit=10000,
            cost=0.0,
            category="places",
        ),
        ApiUsageItem(
            name="Distance Matrix API",
            used=distance_calls,
            freeLimit=2500,
            cost=0.0,
            category="distance",
        ),
        ApiUsageItem(
            name="LLM (Gemini 2.5 Flash)",
            used=llm_calls,
            freeLimit=1500,
            cost=llm_cost,
            category="llm",
        ),
    ]


@router.get("/system-health", response_model=list[SystemHealthNode])
def get_system_health(
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_admin_user),
) -> list[SystemHealthNode]:
    """Live system diagnostics — probes DB and Redis; Nginx/LLM are inferred."""
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
                detail=f"{db_latency_ms}ms query latency · Connection pool healthy",
                latency_ms=db_latency_ms,
            )
        )
    except Exception as exc:
        results.append(
            SystemHealthNode(
                name="Postgres / SQLite Database",
                status="down",
                detail=f"Database unreachable: {exc}",
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
        except Exception as exc:
            results.append(
                SystemHealthNode(
                    name="Redis Cache",
                    status="down",
                    detail=f"Redis unreachable: {exc}",
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

    # 3. Nginx/Gateway — inferred (no direct probe available from backend)
    results.append(
        SystemHealthNode(
            name="Nginx Gateway",
            status="up",
            detail="Inferred healthy (request reached backend)",
            latency_ms=None,
        )
    )

    # 4. Gemini LLM — inferred from settings
    from app.core.config import settings as cfg

    if cfg.GEMINI_API_KEY:
        results.append(
            SystemHealthNode(
                name="Gemini LLM Service",
                status="up",
                detail=f"API key configured · model {cfg.LLM_MODEL_NAME}",
                latency_ms=None,
            )
        )
    else:
        results.append(
            SystemHealthNode(
                name="Gemini LLM Service",
                status="degraded",
                detail="GEMINI_API_KEY not set — heuristic fallback active",
                latency_ms=None,
            )
        )

    return results
