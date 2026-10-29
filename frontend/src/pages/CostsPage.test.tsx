import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CostsPage from './CostsPage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { expenses: { list: vi.fn(), settleUp: vi.fn(), create: vi.fn() } } }));

const members = [{ id: 'alice', name: 'Alice', initials: 'AL', submitted: true }];

describe('expense saves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.expenses.list).mockResolvedValue([]);
    vi.mocked(api.expenses.settleUp).mockResolvedValue({ trip_id: 't1', user_balances: [], transfers: [] });
  });

  it('does not display an unsaved expense as persisted', async () => {
    vi.mocked(api.expenses.create).mockRejectedValue(new Error('Storage unavailable'));
    render(<CostsPage tripId="t1" members={members} />);
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    fireEvent.change(screen.getByLabelText('What was this for?'), { target: { value: 'Lunch' } });
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log Expense' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
    expect(screen.getByText('Logged Expenses (0)')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows failures when balances cannot be loaded', async () => {
    vi.mocked(api.expenses.settleUp).mockRejectedValue(new Error('Balances unavailable'));
    render(<CostsPage tripId="t1" members={members} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Balances unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.expenses.settleUp).toHaveBeenCalledTimes(2));
  });
});
