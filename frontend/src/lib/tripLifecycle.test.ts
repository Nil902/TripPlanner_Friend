import { describe, expect, it } from 'vitest';
import type { TripStatus } from '@shared/types';
import { getTripLifecycleDescription, getTripLifecycleStatus, getUtcDate } from './tripLifecycle';

const trip = { start_date: '2026-10-10', end_date: '2026-10-12', status: 'planned' as TripStatus };

describe('date-based trip progress', () => {
  it.each([
    ['2026-10-09', 'upcoming'],
    ['2026-10-10', 'in_progress'],
    ['2026-10-11', 'in_progress'],
    ['2026-10-12', 'in_progress'],
    ['2026-10-13', 'completed'],
  ] as const)('classifies %s as %s', (today, expected) => {
    expect(getTripLifecycleStatus(trip, today)).toBe(expected);
  });

  it('keeps a manually completed future trip completed', () => {
    expect(getTripLifecycleStatus({ ...trip, status: 'completed' }, '2026-10-01')).toBe('completed');
  });

  it('does not depend on having an itinerary', () => {
    expect(getTripLifecycleStatus({ ...trip, status: 'collecting_constraints' }, '2026-10-13')).toBe('completed');
  });

  it('includes the end date for a one-day trip', () => {
    expect(getTripLifecycleStatus({ ...trip, end_date: trip.start_date }, trip.start_date)).toBe('in_progress');
  });

  it('checks dates even when a trip is flagged', () => {
    expect(getTripLifecycleStatus({ ...trip, status: 'flagged' }, '2026-10-09')).toBe('upcoming');
  });

  it('uses UTC rather than the viewer timezone', () => {
    expect(getUtcDate(new Date('2026-10-10T00:30:00+07:00'))).toBe('2026-10-09');
  });

  it('explains date-based and explicit completion accurately', () => {
    expect(getTripLifecycleDescription(trip, '2026-10-09')).toContain('Not started yet');
    expect(getTripLifecycleDescription(trip, '2026-10-12')).toContain('underway');
    expect(getTripLifecycleDescription(trip, '2026-10-13')).toContain('ended on 2026-10-12');
    expect(getTripLifecycleDescription({ ...trip, status: 'completed' }, '2026-10-09')).toContain('marked as completed');
  });
});
