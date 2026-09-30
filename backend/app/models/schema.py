"""
Relational database models and API schemas using SQLModel.
"""

import uuid
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel
from sqlmodel import JSON, Column, Field, SQLModel


def utc_now() -> datetime:
    """Return current UTC datetime (timezone-aware)."""
    return datetime.now(UTC)


# ==============================================================================
# ENUMS
# ==============================================================================


class TripStatus(StrEnum):
    COLLECTING_CONSTRAINTS = "collecting_constraints"
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FLAGGED = "flagged"


class ValidationStatus(StrEnum):
    VALID = "valid"
    INVALID = "invalid"
    PARTIAL = "partial"


class DisruptionType(StrEnum):
    VENUE_CLOSED = "venue_closed"
    FLIGHT_DELAYED = "flight_delayed"
    WEATHER_ALERT = "weather_alert"
    CUSTOM = "custom"


# ==============================================================================
# DATABASE TABLES (SQLModel)
# ==============================================================================


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
    )
    email: str = Field(unique=True, index=True)
    name: str = Field(default="")
    hashed_password: str = Field()
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)


class Trip(SQLModel, table=True):
    __tablename__ = "trips"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
    )
    title: str = Field(index=True)
    destination: str = Field(index=True)
    start_date: date = Field()
    end_date: date = Field()
    creator_id: str = Field(index=True)
    status: TripStatus = Field(default=TripStatus.COLLECTING_CONSTRAINTS)
    member_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


class TripMember(SQLModel, table=True):
    """Display name supplied when a member joins a trip."""

    __tablename__ = "trip_members"

    trip_id: str = Field(foreign_key="trips.id", primary_key=True)
    user_id: str = Field(primary_key=True)
    name: str = Field()


class Constraint(SQLModel, table=True):
    __tablename__ = "constraints"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
    )
    trip_id: str = Field(foreign_key="trips.id", index=True)
    user_id: str = Field(index=True)
    budget_per_day: float = Field(default=100.0)
    dietary: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    style_tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    must_see: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    must_avoid: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=utc_now)


class Place(SQLModel, table=True):
    __tablename__ = "places"

    place_id: str = Field(primary_key=True, index=True)
    name: str = Field(index=True)
    category: str = Field(default="attraction")
    lat: float = Field(default=0.0)
    lng: float = Field(default=0.0)
    est_cost: float = Field(default=0.0)
    opening_hours: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    cached_at: datetime = Field(default_factory=utc_now)


class Plan(SQLModel, table=True):
    __tablename__ = "plans"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
    )
    trip_id: str = Field(foreign_key="trips.id", index=True)
    version: int = Field(default=1, index=True)
    validation_status: ValidationStatus = Field(default=ValidationStatus.VALID)
    notes: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


class PlanItem(SQLModel, table=True):
    __tablename__ = "plan_items"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
    )
    plan_id: str = Field(foreign_key="plans.id", index=True)
    place_id: str = Field(foreign_key="places.place_id", index=True)
    day_index: int = Field(default=0, index=True)
    start_time: datetime = Field()
    end_time: datetime = Field()
    cost: float = Field(default=0.0)


class Expense(SQLModel, table=True):
    __tablename__ = "expenses"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
    )
    trip_id: str = Field(foreign_key="trips.id", index=True)
    paid_by: str = Field(index=True)
    amount: float = Field(default=0.0)
    description: str = Field(default="")
    category: str | None = Field(default="activity")
    split_between: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)


# ==============================================================================
# API REQUEST & RESPONSE SCHEMAS
# ==============================================================================


# --- Auth ---
class SignupRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    is_admin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


# --- Trips ---
class CreateTripRequest(BaseModel):
    title: str
    destination: str
    start_date: date
    end_date: date
    creator_id: str


class UpdateTripRequest(BaseModel):
    title: str | None = None
    destination: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: TripStatus | None = None
    member_ids: list[str] | None = None


class MemberResponse(BaseModel):
    id: str
    name: str
    initials: str
    submitted: bool = False
    role: str = "joiner"

    model_config = {"from_attributes": True}


class JoinTripResponse(MemberResponse):
    access_token: str | None = None


class JoinTripRequest(BaseModel):
    name: str
    user_id: str | None = None


class TripPermissionsResponse(BaseModel):
    can_manage: bool
    is_creator: bool
    role: str

    model_config = {"from_attributes": True}


# --- Constraints ---
class SubmitConstraintRequest(BaseModel):
    user_id: str
    budget_per_day: float
    dietary: list[str] | None = None
    style_tags: list[str] | None = None
    must_see: list[str] | None = None
    must_avoid: list[str] | None = None


# --- Places & Itinerary ---
class PlaceResponse(BaseModel):
    place_id: str
    name: str
    category: str
    lat: float
    lng: float
    est_cost: float
    opening_hours: dict[str, Any] | None = None

    model_config = {"from_attributes": True}


class PlanItemResponse(BaseModel):
    id: str
    place_id: str
    place: PlaceResponse | None = None
    day_index: int
    start_time: datetime
    end_time: datetime
    cost: float

    model_config = {"from_attributes": True}


class PlanDayResponse(BaseModel):
    date: date
    day_index: int
    items: list[PlanItemResponse]

    model_config = {"from_attributes": True}


class PlanResponse(BaseModel):
    id: str
    trip_id: str
    version: int
    validation_status: ValidationStatus
    days: list[PlanDayResponse]
    notes: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class CreatePlanItemRequest(BaseModel):
    day_index: int
    place_name: str
    category: str = "attraction"
    start_time: datetime
    end_time: datetime
    cost: float = 0.0
    lat: float | None = None
    lng: float | None = None


class UpdatePlanItemRequest(BaseModel):
    day_index: int | None = None
    place_name: str | None = None
    category: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    cost: float | None = None
    lat: float | None = None
    lng: float | None = None


class RefinePlanRequest(BaseModel):
    instruction: str
    user_id: str | None = None


class AskAgentRequest(BaseModel):
    question: str


class AskAgentResponse(BaseModel):
    question: str
    answer: str


# --- Disruption & Rebalance ---
class DisruptionEvent(BaseModel):
    type: DisruptionType
    day_index: int
    place_id: str | None = None
    delay_minutes: int | None = None
    description: str | None = None


# --- Expenses & Settle-Up ---
class CreateExpenseRequest(BaseModel):
    paid_by: str
    amount: float
    description: str
    category: str | None = "activity"
    split_between: list[str] | None = None


class UpdateExpenseRequest(BaseModel):
    paid_by: str | None = None
    amount: float | None = None
    description: str | None = None
    category: str | None = None
    split_between: list[str] | None = None


class DebtTransfer(BaseModel):
    debtor_id: str
    creditor_id: str
    amount: float


class UserBalanceSummary(BaseModel):
    user_id: str
    total_paid: float
    total_share: float
    net_balance: float


class SettleUpReport(BaseModel):
    trip_id: str
    user_balances: list[UserBalanceSummary]
    transfers: list[DebtTransfer]


# --- Validators ---
class ValidationIssue(BaseModel):
    type: str  # "budget" | "travel_time" | "open_hours"
    severity: str  # "error" | "warning"
    day_index: int | None = None
    place_id: str | None = None
    user_id: str | None = None
    message: str
    suggested_action: str | None = None


class ValidationResult(BaseModel):
    is_valid: bool = True
    status: ValidationStatus = ValidationStatus.VALID
    issues: list[ValidationIssue] = []
