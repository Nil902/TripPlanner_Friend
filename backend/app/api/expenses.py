"""
Expense logging and settle-up API endpoints.
"""

import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from app.core.db import get_session
from app.core.security import TripAccess, get_trip_access
from app.models.schema import (
    CreateExpenseRequest,
    Expense,
    SettleUpReport,
    Trip,
    UpdateExpenseRequest,
)
from app.services.expense_service import calculate_settle_up

router = APIRouter(prefix="/api/v1/trips/{trip_id}/expenses", tags=["Expenses"])


@router.post("", response_model=Expense, status_code=status.HTTP_201_CREATED)
def add_expense(
    trip_id: str,
    req: CreateExpenseRequest,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
):
    """Log a new group expense."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    if not math.isfinite(req.amount) or req.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_AMOUNT",
                "message": "Expense amount must be greater than 0.",
            },
        )

    if req.paid_by not in trip.member_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NOT_A_MEMBER",
                "message": "Payer must be a member of the trip.",
            },
        )
    if req.paid_by != access.user_id and not (
        access.is_admin or access.user_id == trip.creator_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Cannot log another member's payment.",
            },
        )

    invalid_splits = (
        [m for m in req.split_between if m not in trip.member_ids]
        if req.split_between
        else []
    )
    if invalid_splits:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NOT_A_MEMBER",
                "message": f"Split member(s) not in trip: {', '.join(invalid_splits)}",
            },
        )
    if req.split_between and len(req.split_between) != len(set(req.split_between)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_SPLIT",
                "message": "Split members must be unique.",
            },
        )

    # If split_between is empty, default to all trip members
    split_members = req.split_between if req.split_between else list(trip.member_ids)
    if not split_members:
        split_members = [req.paid_by]

    expense = Expense(
        trip_id=trip_id,
        paid_by=req.paid_by,
        amount=req.amount,
        description=req.description,
        category=req.category or "activity",
        split_between=split_members,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@router.get("", response_model=list[Expense])
def list_expenses(
    trip_id: str,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
):
    """List all recorded expenses for a trip."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    expenses = session.exec(
        select(Expense)
        .where(Expense.trip_id == trip_id)
        .order_by(col(Expense.created_at).desc())
    ).all()
    return expenses


@router.put("/{expense_id}", response_model=Expense)
def update_expense(
    trip_id: str,
    expense_id: str,
    req: UpdateExpenseRequest,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
):
    """Update an existing expense (Always allow all edits)."""
    expense = session.get(Expense, expense_id)
    if not expense or expense.trip_id != trip_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "EXPENSE_NOT_FOUND",
                "message": f"Expense '{expense_id}' not found.",
            },
        )

    if req.amount is not None and (not math.isfinite(req.amount) or req.amount <= 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_AMOUNT",
                "message": "Expense amount must be greater than 0.",
            },
        )

    trip = session.get(Trip, expense.trip_id)
    if access.user_id != expense.paid_by and not (
        access.is_admin or (trip and access.user_id == trip.creator_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Cannot edit another member's expense.",
            },
        )

    if req.paid_by is not None:
        if trip and req.paid_by not in trip.member_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "NOT_A_MEMBER",
                    "message": "Payer must be a member of the trip.",
                },
            )
        if req.paid_by != access.user_id and not (
            access.is_admin or (trip and access.user_id == trip.creator_id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "Cannot assign another payer."},
            )
        expense.paid_by = req.paid_by
    if req.amount is not None:
        expense.amount = req.amount
    if req.description is not None:
        expense.description = req.description
    if req.category is not None:
        expense.category = req.category
    if req.split_between is not None:
        if not req.split_between or len(req.split_between) != len(
            set(req.split_between)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_SPLIT",
                    "message": "Split members must be a nonempty unique list.",
                },
            )
        if trip and any(member not in trip.member_ids for member in req.split_between):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "NOT_A_MEMBER",
                    "message": "Split members must belong to trip.",
                },
            )
        expense.split_between = req.split_between

    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    trip_id: str,
    expense_id: str,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
):
    """Delete an expense."""
    expense = session.get(Expense, expense_id)
    if not expense or expense.trip_id != trip_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "EXPENSE_NOT_FOUND",
                "message": f"Expense '{expense_id}' not found.",
            },
        )

    trip = session.get(Trip, trip_id)
    if access.user_id != expense.paid_by and not (
        access.is_admin or (trip and access.user_id == trip.creator_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Cannot delete another member's expense.",
            },
        )

    session.delete(expense)
    session.commit()
    return None


@router.get("/settle-up", response_model=SettleUpReport)
def get_settle_up(
    trip_id: str,
    session: Session = Depends(get_session),
    access: TripAccess = Depends(get_trip_access),
):
    """Calculate greedy minimal-transaction debt settlement."""
    trip = session.get(Trip, trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TRIP_NOT_FOUND",
                "message": f"Trip '{trip_id}' not found.",
            },
        )

    expenses = session.exec(select(Expense).where(Expense.trip_id == trip_id)).all()

    return calculate_settle_up(
        trip_id=trip_id,
        expenses=list(expenses),
        members=list(trip.member_ids),
    )
