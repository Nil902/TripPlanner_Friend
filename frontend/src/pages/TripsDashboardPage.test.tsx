import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TripsDashboardPage from './TripsDashboardPage';
import type { TripSummary } from '../lib/constants';

describe('TripsDashboardPage', () => {
  it('offers trip management only for trips owned by the signed-in user', () => {
    const baseTrip: TripSummary = {
      id: 'owned',
      title: 'Owned trip',
      destination: 'Lisbon',
      start_date: '2026-10-01',
      end_date: '2026-10-02',
      creator_id: 'alice',
      status: 'collecting_constraints',
      member_ids: ['alice'],
    };
    render(
      <TripsDashboardPage
        user={{ id: 'alice', name: 'Alice', email: 'alice@example.com' }}
        currentUser={{ id: 'alice', name: 'Alice', role: 'creator' }}
        trips={[baseTrip, { ...baseTrip, id: 'joined', title: 'Joined trip', creator_id: 'bob' }]}
        onSelectTrip={vi.fn()}
        onCreateTrip={vi.fn()}
        onLogout={vi.fn()}
        onManageTrip={vi.fn()}
      />,
    );

    expect(screen.getAllByTitle('Manage Trip Settings')).toHaveLength(1);
  });
});
