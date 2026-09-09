"""
Expense calculation and greedy settle-up debt simplification service.
"""

from collections import defaultdict

from app.models.schema import DebtTransfer, Expense, SettleUpReport, UserBalanceSummary


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
    debtors: list[list] = []  # [-balance, user_id]
    creditors: list[list] = []  # [balance, user_id]

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
            debtors.append([-net, uid])
        elif net > 0.01:
            creditors.append([net, uid])

    # Sort descending by magnitude of debt/credit
    debtors.sort(key=lambda x: x[0], reverse=True)
    creditors.sort(key=lambda x: x[0], reverse=True)

    transfers: list[DebtTransfer] = []
    d_idx = 0
    c_idx = 0

    # Greedy debt matching
    while d_idx < len(debtors) and c_idx < len(creditors):
        debtor_amt, debtor_id = debtors[d_idx]
        creditor_amt, creditor_id = creditors[c_idx]

        settle_amount = min(debtor_amt, creditor_amt)
        transfers.append(
            DebtTransfer(
                debtor_id=debtor_id,
                creditor_id=creditor_id,
                amount=round(settle_amount, 2),
            )
        )

        debtors[d_idx][0] -= settle_amount
        creditors[c_idx][0] -= settle_amount

        if debtors[d_idx][0] <= 0.01:
            d_idx += 1
        if creditors[c_idx][0] <= 0.01:
            c_idx += 1

    return SettleUpReport(
        trip_id=trip_id,
        user_balances=user_balances,
        transfers=transfers,
    )
