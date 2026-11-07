import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JoinModal from './JoinModal';
import { api, getGuestSession } from '../lib/api';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('JoinModal', () => {
  it('keeps the dialog open when the server rejects the invitation', async () => {
    vi.spyOn(api.trips, 'join').mockRejectedValue(new Error('Invitation not found'));
    const onJoin = vi.fn(), onClose = vi.fn();
    render(<JoinModal isOpen initialCode="missing-trip" onJoin={onJoin} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Guest' } });
    fireEvent.click(screen.getByRole('button', { name: /Enter Trip Room/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invitation not found'));
    expect(onJoin).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getGuestSession()).toBeNull();
  });

  it('stores the server-issued identity and opens the verified trip', async () => {
    vi.spyOn(api.trips, 'join').mockResolvedValue({ id: 'opaque-guest-id', name: 'Alice', initials: 'AL', submitted: false, role: 'joiner', session_token: 'signed-trip-token' });
    vi.spyOn(api.trips, 'get').mockResolvedValue({ id: 'trip-1', title: 'Real trip', destination: 'Lisbon', start_date: '2026-11-01', end_date: '2026-11-03', creator_id: 'owner-id', status: 'collecting_constraints', member_ids: ['owner-id', 'opaque-guest-id'], created_at: '2026-10-29T00:00:00Z' });
    const onJoin = vi.fn();
    render(<JoinModal isOpen initialCode="https://trips.example.com/?code=trip-1" onJoin={onJoin} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: /Enter Trip Room/ }));
    await waitFor(() => expect(onJoin).toHaveBeenCalled());
    expect(api.trips.join).toHaveBeenCalledWith('trip-1', { name: 'Alice' });
    expect(getGuestSession()?.memberId).toBe('opaque-guest-id');
    expect(getGuestSession()?.token).toBe('signed-trip-token');
  });
});
