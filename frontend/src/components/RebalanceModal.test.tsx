import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Plan } from '@shared/types';
import RebalanceModal from './RebalanceModal';
import { api } from '../lib/api';

const priorPlan = {
  version: 3,
  notes: ['Initial plan'],
  days: [{ day_index: 0, items: [{
    id: 'item-1', place_id: 'venue-1', place: { name: 'Known venue' },
    start_time: '2026-10-01T10:00:00', end_time: '2026-10-01T11:00:00', cost: 10,
  }] }],
} as unknown as Plan;

describe('RebalanceModal', () => {
  it('submits the selected venue and reports the actual plan version', async () => {
    vi.spyOn(api.plan, 'get').mockResolvedValueOnce(priorPlan);
    const rebalance = vi.spyOn(api.plan, 'rebalance').mockResolvedValueOnce({
      ...priorPlan,
      version: 4,
      notes: ['Initial plan', "Substituted 'Known venue' with 'Museum'."],
    });
    const onRebalanced = vi.fn();
    render(<RebalanceModal isOpen tripId="trip-1" onClose={vi.fn()} onRebalanced={onRebalanced} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Execute Dynamic Rebalance/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Execute Dynamic Rebalance/i }));
    await waitFor(() => expect(onRebalanced).toHaveBeenCalled());
    expect(rebalance).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      type: 'venue_closed', day_index: 0, place_id: 'venue-1',
    }));
    expect(onRebalanced.mock.calls[0][0].version).toBe(4);
  });

  it('shows a failed rebalance without reporting success', async () => {
    vi.spyOn(api.plan, 'get').mockResolvedValueOnce(priorPlan);
    vi.spyOn(api.plan, 'rebalance').mockRejectedValueOnce(new Error('No suitable replacement'));
    const onRebalanced = vi.fn();
    const onClose = vi.fn();
    render(<RebalanceModal isOpen tripId="trip-1" onClose={onClose} onRebalanced={onRebalanced} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Execute Dynamic Rebalance/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Execute Dynamic Rebalance/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No suitable replacement'));
    expect(onRebalanced).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
