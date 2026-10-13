import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AddExpenseModal from './AddExpenseModal';

const members = [{ id: 'alice', name: 'Alice', initials: 'AL', submitted: true }];

function fillExpense() {
  fireEvent.change(screen.getByLabelText('What was this for?'), { target: { value: 'Lunch' } });
  fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '12.50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log Expense' }));
}

describe('expense persistence', () => {
  it('preserves entered values and displays a failed save', async () => {
    const onClose = vi.fn();
    const onAdd = vi.fn().mockRejectedValue(new Error('Expense could not be saved.'));
    render(<AddExpenseModal isOpen onClose={onClose} members={members} onAdd={onAdd} />);
    fillExpense();
    expect(await screen.findByRole('alert')).toHaveTextContent('Expense could not be saved.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('What was this for?')).toHaveValue('Lunch');
  });

  it('waits for confirmation and prevents repeat submissions', async () => {
    let finish: () => void = () => {};
    const onAdd = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onClose = vi.fn();
    render(<AddExpenseModal isOpen onClose={onClose} members={members} onAdd={onAdd} />);
    fillExpense();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
