import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripSummary } from '../lib/constants';
import { api } from '../lib/api';
import OverviewPage from './OverviewPage';

const trip: TripSummary = {
  id: 'overview-trip', title: 'Overview holiday', destination: 'Lisbon',
  start_date: '2026-10-08', end_date: '2026-10-10',
  status: 'planned', creator_id: 'creator', member_ids: ['creator'],
};

describe('trip room progress', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    vi.spyOn(api.plan, 'get').mockRejectedValue(new Error('No saved plan.'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows ongoing travel through the last scheduled day', () => {
    render(<OverviewPage trip={trip} members={[]} setActive={vi.fn()} planMode="ai" setPlanMode={vi.fn()} isCreator={false} />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText(/continues through 2026-10-10/)).toBeInTheDocument();
  });

  it('shows completed travel without hiding itinerary navigation', () => {
    render(<OverviewPage trip={{ ...trip, end_date: '2026-10-09' }} members={[]} setActive={vi.fn()} planMode="ai" setPlanMode={vi.fn()} isCreator={false} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Your trip ended on 2026-10-09.')).toBeInTheDocument();
  });
});
