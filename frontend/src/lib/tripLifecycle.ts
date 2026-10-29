import type { Trip, TripLifecycleStatus } from '@shared/types';

type TripDates = Pick<Trip, 'start_date' | 'end_date' | 'status'>;

export const TRIP_LIFECYCLE_LABELS: Record<TripLifecycleStatus, string> = {
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  completed: 'Completed',
};

export function getUtcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getTripLifecycleStatus(
  trip: TripDates,
  today = getUtcDate(),
): TripLifecycleStatus {
  // Compare ISO date strings, not local-time parsing of date-only values.
  // Recompute from dates even if an API snapshot's derived status is stale.
  if (trip.status === 'completed' || today > trip.end_date) return 'completed';
  if (today < trip.start_date) return 'upcoming';
  return 'in_progress';
}

export function getTripLifecycleDescription(trip: TripDates, today: string): string {
  if (trip.status === 'completed') return 'This trip was marked as completed.';
  switch (getTripLifecycleStatus(trip, today)) {
    case 'upcoming':
      return `Not started yet. Your trip begins on ${trip.start_date}.`;
    case 'in_progress':
      return `Your trip is underway and continues through ${trip.end_date}.`;
    case 'completed':
      return `Your trip ended on ${trip.end_date}.`;
  }
}
