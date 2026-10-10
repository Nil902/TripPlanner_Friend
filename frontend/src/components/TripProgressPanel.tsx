import { useState } from 'react';
import type { TripSummary } from '../lib/constants';
import { api } from '../lib/api';
import { getTripLifecycleDescription, getTripLifecycleStatus } from '../lib/tripLifecycle';
import { useToday } from '../lib/useToday';
import TripStatusBadge from './TripStatusBadge';

interface TripProgressPanelProps {
  trip: TripSummary;
  onUpdateTrip: (trip: TripSummary) => void;
}

export default function TripProgressPanel({ trip, onUpdateTrip }: TripProgressPanelProps) {
  const today = useToday();
  const lifecycle = getTripLifecycleStatus(trip, today);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishTrip = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.trips.update(trip.id, { status: 'completed' });
      if (updated.status !== 'completed') {
        throw new Error('Trip completion was not confirmed. Please try again.');
      }
      onUpdateTrip({ ...trip, ...updated });
      setConfirming(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to finish the trip. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Trip progress" className="mb-6 rounded-xl border border-[#DDD5C4] bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[#24211C]">Trip progress</h3>
        <TripStatusBadge status={lifecycle} />
      </div>
      <p className="text-sm text-[#595347]">{getTripLifecycleDescription(trip, today)}</p>
      <p className="mt-2 text-xs text-[#595347]">
        Dates are checked automatically using UTC. The end date is included; completion starts the next day.
        This status does not delete your itinerary or expenses.
      </p>
      {trip.status === 'flagged' && (
        <p className="mt-2 text-sm text-[#8E4726]">This trip is flagged for review.</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {lifecycle !== 'completed' && trip.status !== 'flagged' && (
        <div className="mt-4">
          {confirming ? (
            <div>
              <p className="mb-3 text-sm text-[#24211C]">
                Finished traveling? Mark this trip as completed, even if the scheduled end date has not passed.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void finishTrip()} disabled={saving}
                  className="rounded-lg bg-[#2B4C3F] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B4C3F] disabled:opacity-50">
                  {saving ? 'Saving…' : 'Yes, mark as completed'}
                </button>
                <button type="button" onClick={() => { setConfirming(false); setError(null); }} disabled={saving}
                  className="rounded-lg border border-[#DDD5C4] px-4 py-2 text-sm text-[#24211C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B4C3F] disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}
              className="rounded-lg border border-[#2B4C3F] px-4 py-2 text-sm font-semibold text-[#2B4C3F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B4C3F]">
              Mark trip as completed
            </button>
          )}
        </div>
      )}
    </section>
  );
}
