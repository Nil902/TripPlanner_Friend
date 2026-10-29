import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AddExpenseModal from './AddExpenseModal';

describe('AddExpenseModal', () => {
  it('keeps an unsaved expense visible when the server rejects it', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Expense was not saved'));
    const onClose = vi.fn();
    render(<AddExpenseModal isOpen onClose={onClose} onAdd={onAdd}
      members={[{ id: 'alice', name: 'Alice', initials: 'AL', submitted: false }]} />);
    fireEvent.change(screen.getByLabelText('What was this for?'), { target: { value: 'Lunch' } });
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log Expense' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Expense was not saved'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('What was this for?')).toHaveValue('Lunch');
  });
});
