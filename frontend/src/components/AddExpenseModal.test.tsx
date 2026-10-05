import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddExpenseModal from './AddExpenseModal';

describe('AddExpenseModal', () => {
  it('keeps the expense form open when saving fails', async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(new Error('Expense was not saved'));
    const onClose = vi.fn();
    render(
      <AddExpenseModal
        isOpen
        onClose={onClose}
        onAdd={onAdd}
        members={[{ id: 'alice', name: 'Alice', initials: 'A', submitted: true }]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Pasteis tasting/i), {
      target: { value: 'Lunch' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log Expense' }));
    await waitFor(() => expect(screen.getByText('Expense was not saved')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
