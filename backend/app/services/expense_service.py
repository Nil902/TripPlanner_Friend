"""
Expense calculation and greedy settle-up debt simplification service.
"""

from collections import defaultdict
from dataclasses import dataclass

from app.models.schema import DebtTransfer, Expense, SettleUpReport, UserBalanceSummary


@dataclass
class _BalanceTarget:
    """Mutable balance tracker used by the greedy settle-up algorithm."""

    amount: float
    user_id: str


def calculate_settle_up(
    trip_id: str, expenses: list[Expense], members: list[str]
) -> SettleUpReport:
    """
    Computes net balances and executes the greedy debt reduction algorithm (Section 10.3).
    """
    total_paid: dict[str, float] = defaultdict(float)
    total_share: dict[str, float] = defaultdict(float)

    # Initialize all members
    for m in members:
        total_paid[m] = 0.0
        total_share[m] = 0.0

    for exp in expenses:
        total_paid[exp.paid_by] += exp.amount
        split_targets = exp.split_between if exp.split_between else members
        if not split_targets:
            split_targets = [exp.paid_by]

        per_person_share = exp.amount / len(split_targets)
        for user_id in split_targets:
            total_share[user_id] += per_person_share

    all_users = set(total_paid.keys()).union(set(total_share.keys()))
    user_balances: list[UserBalanceSummary] = []
    debtors: list[_BalanceTarget] = []
    creditors: list[_BalanceTarget] = []

    for uid in sorted(all_users):
        paid = round(total_paid[uid], 2)
        share = round(total_share[uid], 2)
        net = round(paid - share, 2)
        user_balances.append(
            UserBalanceSummary(
                user_id=uid,
                total_paid=paid,
                total_share=share,
                net_balance=net,
            )
        )
        if net < -0.01:
            debtors.append(_BalanceTarget(amount=-net, user_id=uid))
        elif net > 0.01:
            creditors.append(_BalanceTarget(amount=net, user_id=uid))

    # Sort descending by magnitude of debt/credit
    debtors.sort(key=lambda x: x.amount, reverse=True)
    creditors.sort(key=lambda x: x.amount, reverse=True)

    transfers: list[DebtTransfer] = []
    d_idx = 0
    c_idx = 0

    # Greedy debt matching
    while d_idx < len(debtors) and c_idx < len(creditors):
        debtor = debtors[d_idx]
        creditor = creditors[c_idx]

        settle_amount = round(min(debtor.amount, creditor.amount), 2)
        transfers.append(
            DebtTransfer(
                debtor_id=debtor.user_id,
                creditor_id=creditor.user_id,
                amount=settle_amount,
            )
        )

        debtor.amount -= settle_amount
        creditor.amount -= settle_amount

        if debtor.amount <= 0.01:
            d_idx += 1
        if creditor.amount <= 0.01:
            c_idx += 1

    return SettleUpReport(
        trip_id=trip_id,
        user_balances=user_balances,
        transfers=transfers,
    )
