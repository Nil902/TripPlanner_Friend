import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripSummary } from '../lib/constants';
import { api } from '../lib/api';
import OwnerTripPage from './OwnerTripPage';

const trip: TripSummary = {
  id: 'owner-trip', title: 'Owner holiday', destination: 'Lisbon',
  start_date: '2026-10-11', end_date: '2026-10-13',
  status: 'planned', creator_id: 'creator', member_ids: ['creator'],
};

function renderOwner() {
  const props = {
    trip, members: [], onUpdateTrip: vi.fn(), onUpdateMembers: vi.fn(),
    onDeleteTrip: vi.fn(), onBackToRoom: vi.fn(),
    currentUser: { id: 'creator', name: 'Creator', email: 'creator@example.com', role: 'creator' as const },
  };
  render(<OwnerTripPage {...props} />);
  return props;
}

describe('owner trip completion', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows progress and completion controls directly in trip settings', () => {
    renderOwner();
    expect(screen.getByRole('region', { name: 'Trip progress' })).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark trip as completed' })).toBeInTheDocument();
  });

  it('never reports a failed legacy completion action as successful', async () => {
    vi.spyOn(api.trips, 'update').mockRejectedValueOnce(new Error('Cannot save completion.'));
    const props = renderOwner();
    fireEvent.click(screen.getByRole('button', { name: 'Danger zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, complete the trip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot save completion');
    expect(props.onUpdateTrip).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Yes, complete the trip' })).toBeEnabled();
  });

  it('persists legacy completion through the existing update API', async () => {
    vi.spyOn(api.trips, 'update').mockResolvedValueOnce({ ...trip, status: 'completed', created_at: '2026-10-01T00:00:00Z' });
    const props = renderOwner();
    fireEvent.click(screen.getByRole('button', { name: 'Danger zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, complete the trip' }));
    await waitFor(() => expect(props.onUpdateTrip).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' })));
  });
});
