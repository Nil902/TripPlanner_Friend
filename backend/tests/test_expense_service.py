"""
Unit tests for expense calculations and greedy debt reduction service.
"""

from app.models.schema import Expense
from app.services.expense_service import calculate_settle_up


def test_settle_up_two_people():
    """Verify simplest 2-person debt transfer."""
    expenses = [
        Expense(
            id="e1",
            trip_id="t1",
            paid_by="alice",
            amount=100.0,
            description="Hotel deposit",
            split_between=["alice", "bob"],
        )
    ]
    members = ["alice", "bob"]

    report = calculate_settle_up(trip_id="t1", expenses=expenses, members=members)
    assert len(report.transfers) == 1
    transfer = report.transfers[0]
    assert transfer.debtor_id == "bob"
    assert transfer.creditor_id == "alice"
    assert transfer.amount == 50.0


def test_settle_up_three_people_circular_greedy_reduction():
    """
    Verify greedy minimal transfers among 3 participants.
    Alice pays $90 for (Alice, Bob, Charlie) -> each owes $30
    Bob pays $30 for (Bob, Charlie) -> each owes $15
    Net:
      Alice: paid 90, share 30 -> net +60
      Bob: paid 30, share 45 -> net -15
      Charlie: paid 0, share 45 -> net -45
    Transfers:
      Charlie pays Alice 45
      Bob pays Alice 15
    Total transactions: 2 (instead of 3)
    """
    expenses = [
        Expense(
            id="e1",
            trip_id="t1",
            paid_by="alice",
            amount=90.0,
            description="Dinner",
            split_between=["alice", "bob", "charlie"],
        ),
        Expense(
            id="e2",
            trip_id="t1",
            paid_by="bob",
            amount=30.0,
            description="Museum Tickets",
            split_between=["bob", "charlie"],
        ),
    ]
    members = ["alice", "bob", "charlie"]

    report = calculate_settle_up(trip_id="t1", expenses=expenses, members=members)

    balances = {b.user_id: b.net_balance for b in report.user_balances}
    assert balances["alice"] == 60.0
    assert balances["bob"] == -15.0
    assert balances["charlie"] == -45.0

    # Net sum must be 0
    assert round(sum(balances.values()), 2) == 0.0

    # Number of transfers should be 2
    assert len(report.transfers) == 2
    transfer_map = {(t.debtor_id, t.creditor_id): t.amount for t in report.transfers}
    assert transfer_map[("charlie", "alice")] == 45.0
    assert transfer_map[("bob", "alice")] == 15.0


def test_settle_up_zero_expenses():
    """Verify empty trip handles cleanly with zero transfers."""
    report = calculate_settle_up(
        trip_id="t1", expenses=[], members=["alice", "bob", "charlie"]
    )
    assert len(report.transfers) == 0
    assert len(report.user_balances) == 3
    for b in report.user_balances:
        assert b.net_balance == 0.0
