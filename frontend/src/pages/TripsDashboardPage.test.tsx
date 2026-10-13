import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripSummary } from '../lib/constants';
import TripsDashboardPage from './TripsDashboardPage';

const base: TripSummary = {
  id: 'trip-base', title: 'Future holiday', destination: 'Lisbon',
  start_date: '2026-10-11', end_date: '2026-10-13',
  status: 'planned', creator_id: 'creator', member_ids: ['creator'],
};
const trips: TripSummary[] = [
  base,
  { ...base, id: 'trip-current', title: 'Traveling today', start_date: '2026-10-08', end_date: '2026-10-10' },
  { ...base, id: 'trip-past', title: 'Past holiday', start_date: '2026-10-01', end_date: '2026-10-09', status: 'collecting_constraints' },
  { ...base, id: 'trip-finished', title: 'Finished early', status: 'completed' },
];

function renderDashboard(items = trips) {
  const props = {
    user: { id: 'creator', name: 'Creator', email: 'creator@example.com' },
    trips: items, onSelectTrip: vi.fn(), onCreateTrip: vi.fn(), onLogout: vi.fn(), onManageTrip: vi.fn(),
  };
  render(<TripsDashboardPage {...props} />);
  return props;
}

describe('trip dashboard progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('labels future, current, past and manually completed trips correctly', () => {
    renderDashboard();
    expect(within(screen.getByRole('group', { name: 'Future holiday' })).getByText('Upcoming')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Traveling today' })).getByText('In progress')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Past holiday' })).getByText('Completed')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Finished early' })).getByText('Completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upcoming (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In progress (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completed (2)' })).toBeInTheDocument();
  });

  it('filters completed trips and can return to all trips', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Completed (2)' }));
    expect(screen.getByRole('button', { name: 'Completed (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: 'Future holiday' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Traveling today' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Past holiday' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All (4)' }));
    expect(screen.getAllByRole('group')).toHaveLength(4);
  });

  it('shows a useful empty state for a filter without trips', () => {
    renderDashboard([base]);
    fireEvent.click(screen.getByRole('button', { name: 'Completed (0)' }));
    expect(screen.getByRole('status')).toHaveTextContent('No completed trips');
    expect(screen.queryByText('No trips planned yet')).not.toBeInTheDocument();
  });

  it('keeps the first-trip empty state when there are no trips', () => {
    renderDashboard([]);
    expect(screen.getByText('No trips planned yet')).toBeInTheDocument();
  });

  it('automatically moves trips into completed at midnight while the page is open', () => {
    vi.setSystemTime(new Date('2026-10-10T23:59:59Z'));
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Completed (2)' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: 'Completed (3)' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Traveling today' })).toBeInTheDocument();
  });

  it('can still open and manage a completed trip', () => {
    const props = renderDashboard();
    const card = within(screen.getByRole('group', { name: 'Past holiday' }));
    fireEvent.click(card.getByRole('button', { name: /Open Room/ }));
    expect(props.onSelectTrip).toHaveBeenCalledWith(trips[2]);
    fireEvent.click(card.getByTitle('Manage Trip Settings'));
    expect(props.onManageTrip).toHaveBeenCalledWith(trips[2]);
  });

  it('retains flagged information alongside date progress', () => {
    renderDashboard([{ ...base, status: 'flagged' }]);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Flagged for review')).toBeInTheDocument();
    expect(screen.queryByText('Itinerary planned')).not.toBeInTheDocument();
  });
});
