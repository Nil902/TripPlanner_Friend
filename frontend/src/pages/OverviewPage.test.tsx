import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '@shared/types';
import OverviewPage from './OverviewPage';
import type { TripSummary } from '../lib/constants';
import { api } from '../lib/api';

const trip: TripSummary = {
  id: 'trip-1', title: 'Lisbon trip', destination: 'Lisbon',
  start_date: '2026-11-01', end_date: '2026-11-03',
  creator_id: 'owner', member_ids: ['owner'], status: 'collecting_constraints',
};
const emptyPlan: Plan = {
  id: 'plan-1', trip_id: trip.id, version: 1, validation_status: 'valid',
  days: [], notes: [], created_at: '2026-10-29T00:00:00Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api.plan, 'get').mockResolvedValue(emptyPlan);
});

describe('OverviewPage', () => {
  it('keeps an unsaved visit in the form and shows the server error', async () => {
    vi.spyOn(api.plan, 'addItem').mockRejectedValue(new Error('Visit could not be saved'));
    render(<OverviewPage trip={trip} members={[]} setActive={vi.fn()}
      planMode="manual" setPlanMode={vi.fn()} isCreator />);
    const name = screen.getByPlaceholderText('e.g. Belém Tower, Louvre Museum, Senso-ji Temple...');
    fireEvent.change(name, { target: { value: 'A new visit' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Visit/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Visit could not be saved'));
    expect(name).toHaveValue('A new visit');
    expect(screen.queryByText(/Added "A new visit"/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Scheduled Destination Stops/)).not.toBeInTheDocument();
  });

  it('stays on the overview if generation fails', async () => {
    vi.spyOn(api.plan, 'generate').mockRejectedValue(new Error('Planner unavailable'));
    const setActive = vi.fn();
    render(<OverviewPage trip={trip} members={[]} setActive={setActive}
      planMode="ai" setPlanMode={vi.fn()} isCreator />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Itinerary/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Planner unavailable'));
    expect(setActive).not.toHaveBeenCalled();
  });

  it('prevents a joining member from creating stops or generating plans', () => {
    const { rerender } = render(<OverviewPage trip={trip} members={[]} setActive={vi.fn()}
      planMode="ai" setPlanMode={vi.fn()} isCreator={false} />);
    expect(screen.getByRole('button', { name: /Generate Itinerary/ })).toBeDisabled();
    rerender(<OverviewPage trip={trip} members={[]} setActive={vi.fn()}
      planMode="manual" setPlanMode={vi.fn()} isCreator={false} />);
    expect(screen.queryByRole('button', { name: /Add Visit/ })).not.toBeInTheDocument();
  });
});
