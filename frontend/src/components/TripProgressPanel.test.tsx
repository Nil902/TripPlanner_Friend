import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trip } from '@shared/types';
import type { TripSummary } from '../lib/constants';
import { api } from '../lib/api';
import TripProgressPanel from './TripProgressPanel';

const trip: TripSummary = {
  id: 'progress-trip', title: 'October trip', destination: 'Lisbon',
  start_date: '2026-10-11', end_date: '2026-10-13',
  status: 'planned', creator_id: 'creator', member_ids: ['creator'],
};

describe('trip progress panel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('requires confirmation and only reports a successful completion after saving', async () => {
    const update = vi.spyOn(api.trips, 'update').mockResolvedValue({ ...trip, status: 'completed', created_at: '2026-10-01T00:00:00Z' });
    const onUpdate = vi.fn();
    const { rerender } = render(<TripProgressPanel trip={trip} onUpdateTrip={onUpdate} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark trip as completed' }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, mark as completed' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' })));
    expect(update).toHaveBeenCalledWith(trip.id, { status: 'completed' });
    rerender(<TripProgressPanel trip={{ ...trip, status: 'completed' }} onUpdateTrip={onUpdate} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark trip as completed' })).not.toBeInTheDocument();
  });

  it('does not mark a failed save as completed and allows retrying', async () => {
    const update = vi.spyOn(api.trips, 'update')
      .mockRejectedValueOnce(new Error('Connection lost. Please retry.'))
      .mockResolvedValueOnce({ ...trip, status: 'completed', created_at: '2026-10-01T00:00:00Z' });
    const onUpdate = vi.fn();
    render(<TripProgressPanel trip={trip} onUpdateTrip={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark trip as completed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, mark as completed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, mark as completed' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does not accept an unconfirmed API response as completed', async () => {
    vi.spyOn(api.trips, 'update').mockResolvedValue({ ...trip, created_at: '2026-10-01T00:00:00Z' });
    const onUpdate = vi.fn();
    render(<TripProgressPanel trip={trip} onUpdateTrip={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark trip as completed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, mark as completed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not confirmed');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('lets the creator cancel without changing the trip', () => {
    const update = vi.spyOn(api.trips, 'update');
    render(<TripProgressPanel trip={trip} onUpdateTrip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark trip as completed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark trip as completed' })).toBeInTheDocument();
  });

  it('disables confirmation controls during the save', async () => {
    let finish: (value: Trip) => void = () => {};
    const pending = new Promise<Trip>((resolve) => { finish = resolve; });
    const update = vi.spyOn(api.trips, 'update').mockReturnValue(pending);
    const onUpdate = vi.fn();
    render(<TripProgressPanel trip={trip} onUpdateTrip={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark trip as completed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, mark as completed' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(update).toHaveBeenCalledTimes(1);
    finish({ ...trip, status: 'completed', created_at: '2026-10-01T00:00:00Z' });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });

  it('updates progress when the travel dates change without saving a status', () => {
    const update = vi.spyOn(api.trips, 'update');
    const onUpdate = vi.fn();
    const { rerender } = render(<TripProgressPanel trip={trip} onUpdateTrip={onUpdate} />);
    rerender(<TripProgressPanel trip={{ ...trip, start_date: '2026-10-08', end_date: '2026-10-10' }} onUpdateTrip={onUpdate} />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    rerender(<TripProgressPanel trip={{ ...trip, start_date: '2026-10-08', end_date: '2026-10-09' }} onUpdateTrip={onUpdate} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark trip as completed' })).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps moderation information visible without offering to overwrite it', () => {
    render(<TripProgressPanel trip={{ ...trip, status: 'flagged' }} onUpdateTrip={vi.fn()} />);
    expect(screen.getByText('This trip is flagged for review.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark trip as completed' })).not.toBeInTheDocument();
  });
});
