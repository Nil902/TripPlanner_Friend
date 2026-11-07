"""Transactional deletion of a trip and its dependent records."""

from sqlmodel import Session, col, delete, select

from app.models.schema import Constraint, Expense, Plan, PlanItem, Trip, TripGuest


def delete_trip_records(session: Session, trip: Trip) -> None:
    """Remove a trip and its children within one transaction."""
    # Without ORM relationships, explicit SQL guarantees child-before-parent
    # ordering even if an intervening query would trigger an ORM autoflush.
    plan_ids = session.exec(select(Plan.id).where(Plan.trip_id == trip.id)).all()
    if plan_ids:
        session.exec(delete(PlanItem).where(col(PlanItem.plan_id).in_(plan_ids)))
    session.exec(delete(Plan).where(col(Plan.trip_id) == trip.id))
    session.exec(delete(Constraint).where(col(Constraint.trip_id) == trip.id))
    session.exec(delete(Expense).where(col(Expense.trip_id) == trip.id))
    session.exec(delete(TripGuest).where(col(TripGuest.trip_id) == trip.id))
    session.delete(trip)
    session.commit()
