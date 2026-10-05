import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Expense, SettleUpReport } from '@shared/types';
import CostsPage from './CostsPage';
import { api } from '../lib/api';

const members = [
  { id: 'alice', name: 'Alice', initials: 'A', submitted: true },
  { id: 'bob', name: 'Bob', initials: 'B', submitted: true },
];

const expenses: Expense[] = [
  {
    id: 'expense-1',
    trip_id: 'trip-1',
    paid_by: 'alice',
    amount: 60,
    description: 'Dinner',
    category: 'food',
    split_between: ['alice', 'bob'],
    created_at: '2026-10-05T12:00:00Z',
  },
];

const report: SettleUpReport = {
  trip_id: 'trip-1',
  user_balances: [
    { user_id: 'alice', total_paid: 60, total_share: 30, net_balance: 30 },
    { user_id: 'bob', total_paid: 0, total_share: 30, net_balance: -30 },
  ],
  transfers: [{ debtor_id: 'bob', creditor_id: 'alice', amount: 30 }],
};

describe('CostsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state before rendering expense totals', async () => {
    let resolveExpenses: (value: Expense[]) => void = () => undefined;
    let resolveReport: (value: SettleUpReport) => void = () => undefined;
    vi.spyOn(api.expenses, 'list').mockReturnValue(
      new Promise((resolve) => {
        resolveExpenses = resolve;
      }),
    );
    vi.spyOn(api.expenses, 'settleUp').mockReturnValue(
      new Promise((resolve) => {
        resolveReport = resolve;
      }),
    );

    render(<CostsPage tripId="trip-1" members={members} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading expenses');
    expect(screen.queryByText('Total Group Spend')).not.toBeInTheDocument();

    resolveExpenses(expenses);
    resolveReport(report);
    expect(await screen.findAllByText('$60.00')).toHaveLength(2);
    expect(screen.getByText('Owes $30.00')).toBeInTheDocument();
    expect(screen.getByText('Is owed $30.00')).toBeInTheDocument();
  });

  it('shows a retryable error without claiming expenses are settled', async () => {
    const list = vi.spyOn(api.expenses, 'list')
      .mockRejectedValueOnce(new Error('Expense service is unavailable'))
      .mockResolvedValueOnce([]);
    const settleUp = vi.spyOn(api.expenses, 'settleUp')
      .mockRejectedValueOnce(new Error('Expense service is unavailable'))
      .mockResolvedValueOnce({ ...report, user_balances: [], transfers: [] });

    render(<CostsPage tripId="trip-1" members={members} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Expense service is unavailable',
    );
    expect(screen.queryByText(/fully settled/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(settleUp).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/No expenses logged yet/)).toBeInTheDocument();
    expect(screen.getByText(/No transfers to calculate yet/)).toBeInTheDocument();
  });

  it('disables expense entry until the trip has a member', async () => {
    vi.spyOn(api.expenses, 'list').mockResolvedValue([]);
    vi.spyOn(api.expenses, 'settleUp').mockResolvedValue({
      ...report,
      user_balances: [],
      transfers: [],
    });

    render(<CostsPage tripId="trip-1" members={[]} />);

    expect(await screen.findByText(/Add at least one trip member/)).toBeInTheDocument();
    const addButtons = screen.getAllByRole('button', { name: /Add.*expense/i });
    expect(addButtons).toHaveLength(2);
    addButtons.forEach((button) => expect(button).toBeDisabled());
  });
});
