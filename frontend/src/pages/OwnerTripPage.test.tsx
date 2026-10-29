import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OwnerTripPage from './OwnerTripPage';
import type { TripSummary } from '../lib/constants';
import { api } from '../lib/api';

const trip: TripSummary = {
  id: 'trip-1', title: 'Lisbon trip', destination: 'Lisbon',
  start_date: '2026-11-01', end_date: '2026-11-03',
  creator_id: 'owner', member_ids: ['owner', 'bob'], status: 'collecting_constraints',
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  window.innerWidth = 1024;
  vi.spyOn(api.plan, 'get').mockResolvedValue({
    id: 'plan-1', trip_id: trip.id, version: 1, validation_status: 'valid',
    days: [], notes: [], created_at: '2026-10-29T00:00:00Z',
  });
});

function renderOwner(onUpdateMembers = vi.fn()) {
  render(<OwnerTripPage trip={trip} members={[
    { id: 'owner', name: 'Alice', initials: 'AL', submitted: false, role: 'creator' },
    { id: 'bob', name: 'Bob', initials: 'BO', submitted: false, role: 'joiner' },
  ]} onUpdateTrip={vi.fn()} onUpdateMembers={onUpdateMembers}
    onDeleteTrip={vi.fn()} onBackToRoom={vi.fn()}
    currentUser={{ id: 'owner', name: 'Alice', role: 'creator' }} />);
}

describe('OwnerTripPage', () => {
  it('preserves members when the server rejects a removal', async () => {
    vi.spyOn(api.trips, 'update').mockRejectedValue(new Error('Member could not be removed'));
    const onUpdateMembers = vi.fn();
    renderOwner(onUpdateMembers);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Member could not be removed'));
    expect(onUpdateMembers).not.toHaveBeenCalled();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows a failed planning request without inventing a successful version', async () => {
    vi.spyOn(api.plan, 'generate').mockRejectedValue(new Error('Planning request failed'));
    renderOwner();
    fireEvent.click(screen.getByRole('button', { name: 'Agent runs' }));
    await screen.findByText('Version 1');
    expect(screen.queryByRole('button', { name: 'Use this version' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Regenerate Itinerary/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Planning request failed'));
    expect(screen.queryByText('Version 2')).not.toBeInTheDocument();
    expect(screen.queryByText(/synthesized successfully/)).not.toBeInTheDocument();
  });
});
