"""
Expense logging and settle-up API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from app.core.access import TripAccess, require_trip_member
from app.core.db import get_session
from app.models.schema import (
    CreateExpenseRequest,
    Expense,
    SettleUpReport,
    Trip,
    UpdateExpenseRequest,
)
from app.services.expense_service import calculate_settle_up

router = APIRouter(
    prefix="/api/v1/trips/{trip_id}/expenses",
    tags=["Expenses"],
    dependencies=[Depends(require_trip_member)],
)


@router.post("", response_model=Expense, status_code=status.HTTP_201_CREATED)
def add_expense(
    trip_id: str,
    req: CreateExpenseRequest,
    session: Session = Depends(get_session),
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

    if req.amount <= 0:
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
            400,
            detail={
                "code": "INVALID_SPLIT",
                "message": "Choose each split member only once.",
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
    access: TripAccess = Depends(require_trip_member),
    session: Session = Depends(get_session),
):
    """Update an expense as its payer or the trip manager."""
    expense = session.get(Expense, expense_id)
    if not expense or expense.trip_id != trip_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "EXPENSE_NOT_FOUND",
                "message": f"Expense '{expense_id}' not found.",
            },
        )

    if expense.paid_by != access.identity.id and not access.can_manage:
        raise HTTPException(
            403,
            detail={
                "code": "FORBIDDEN",
                "message": "Only the payer or trip manager can change this expense.",
            },
        )
    if req.amount is not None and req.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_AMOUNT",
                "message": "Expense amount must be greater than 0.",
            },
        )

    trip = session.get(Trip, expense.trip_id)

    if req.split_between is not None:
        if (
            not req.split_between
            or len(req.split_between) != len(set(req.split_between))
            or not set(req.split_between).issubset(access.trip.member_ids)
        ):
            raise HTTPException(
                400,
                detail={
                    "code": "INVALID_SPLIT",
                    "message": "Choose distinct members of this trip to split the expense.",
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
        expense.paid_by = req.paid_by
    if req.amount is not None:
        expense.amount = req.amount
    if req.description is not None:
        expense.description = req.description
    if req.category is not None:
        expense.category = req.category
    if req.split_between is not None:
        expense.split_between = req.split_between

    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    trip_id: str,
    expense_id: str,
    access: TripAccess = Depends(require_trip_member),
    session: Session = Depends(get_session),
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

    if expense.paid_by != access.identity.id and not access.can_manage:
        raise HTTPException(
            403,
            detail={
                "code": "FORBIDDEN",
                "message": "Only the payer or trip manager can delete this expense.",
            },
        )
    session.delete(expense)
    session.commit()
    return None


@router.get("/settle-up", response_model=SettleUpReport)
def get_settle_up(
    trip_id: str,
    session: Session = Depends(get_session),
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
