import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RebalanceModal from './RebalanceModal';
import { api } from '../lib/api';

afterEach(() => vi.restoreAllMocks());

describe('RebalanceModal', () => {
  it('reports a failed rebalance without announcing a saved plan', async () => {
    vi.spyOn(api.plan, 'rebalance').mockRejectedValue(new Error('Rebalance unavailable'));
    const onRebalanced = vi.fn();
    const onClose = vi.fn();
    render(<RebalanceModal isOpen tripId="trip-1" onClose={onClose} onRebalanced={onRebalanced} />);
    fireEvent.click(screen.getByRole('button', { name: /Execute Dynamic Rebalance/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Rebalance unavailable'));
    expect(onRebalanced).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the plan version and notes returned by the API', async () => {
    vi.spyOn(api.plan, 'rebalance').mockResolvedValue({
      id: 'plan-7', trip_id: 'trip-1', version: 7,
      validation_status: 'valid', days: [],
      notes: ['Replaced the closed gallery with the city museum.'],
      created_at: '2026-10-29T00:00:00Z',
    });
    const onRebalanced = vi.fn();
    render(<RebalanceModal isOpen tripId="trip-1" onClose={vi.fn()} onRebalanced={onRebalanced} />);
    fireEvent.click(screen.getByRole('button', { name: /Execute Dynamic Rebalance/ }));

    await waitFor(() => expect(onRebalanced).toHaveBeenCalledWith(expect.objectContaining({
      version: 7,
      substitution: 'Replaced the closed gallery with the city museum.',
    })));
  });
});
