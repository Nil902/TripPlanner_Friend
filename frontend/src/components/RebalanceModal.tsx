import { useEffect, useState } from 'react';
import { X, AlertTriangle, Sparkles, RefreshCw, Lock } from 'lucide-react';
import type { Plan } from '@shared/types';
import { BORDER, INK, MUTED, PINE, CLAY, SERIF } from '../lib/constants';
import { PrimaryButton, SecondaryButton } from './Button';
import { api } from '../lib/api';

export interface RebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  onRebalanced: (result: {
    version: number;
    scenario: string;
    affectedWindow: string;
    unaffectedDays: string;
    substitution: string;
  }) => void;
}

export default function RebalanceModal({
  isOpen,
  onClose,
  tripId,
  onRebalanced,
}: RebalanceModalProps) {
  const [disruptionType, setDisruptionType] = useState<'venue_closed' | 'flight_delayed'>('venue_closed');
  const [dayIndex, setDayIndex] = useState(0);
  const [description, setDescription] = useState('Venue closed');
  const [delayMinutes, setDelayMinutes] = useState(120);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [placeId, setPlaceId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    api.plan.get(tripId).then(setPlan).catch((err: unknown) => {
      setPlan(null);
      setError(err instanceof Error ? err.message : 'Could not load the current plan.');
    });
  }, [isOpen, tripId]);

  const dayItems = plan?.days.find((day) => day.day_index === dayIndex)?.items ?? [];
  const firstPlaceId = dayItems[0]?.place_id ?? '';

  useEffect(() => {
    setPlaceId(firstPlaceId);
  }, [dayIndex, firstPlaceId]);

  if (!isOpen) return null;

  const handleExecute = async () => {
    if (!plan || (disruptionType === 'venue_closed' && !placeId)) {
      setError('Choose a scheduled venue before rebalancing.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await api.plan.rebalance(tripId, {
        type: disruptionType,
        day_index: dayIndex,
        place_id: disruptionType === 'venue_closed' ? placeId : undefined,
        delay_minutes: disruptionType === 'flight_delayed' ? delayMinutes : undefined,
        description,
      });
      const changedDays = updated.days.filter((day) => {
        const old = plan.days.find((prior) => prior.day_index === day.day_index);
        return JSON.stringify(day.items.map((item) => [item.place_id, item.start_time, item.end_time, item.cost]))
          !== JSON.stringify((old?.items ?? []).map((item) => [item.place_id, item.start_time, item.end_time, item.cost]));
      });
      onRebalanced({
        version: updated.version,
        scenario: disruptionType.replace('_', ' ').toUpperCase(),
        affectedWindow: `Day ${dayIndex + 1}`,
        unaffectedDays: `${updated.days.length - changedDays.length} day(s) unchanged`,
        substitution: updated.notes.slice(plan.notes.length).join(' ') || 'No changes recorded.',
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rebalance failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(36, 33, 28, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          maxWidth: 500,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAF6EE',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: CLAY,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle color="#fff" size={16} />
            </div>
            <div>
              <h2
                style={{
                  ...SERIF,
                  fontSize: 20,
                  fontWeight: 400,
                  margin: 0,
                  color: INK,
                }}
              >
                Dynamic Disruption Simulator
              </h2>
              <span style={{ fontSize: 12, color: MUTED }}>
                Agent rebalances the affected day and preserves other days
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rebalance modal"
            title="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: MUTED,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24, overflowY: 'auto' }}>
          {/* Architecture principle highlight */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: '#EEF3ED',
              border: `1px solid #D5E2D4`,
              fontSize: 12,
              color: PINE,
              marginBottom: 18,
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Lock size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>Minimal Disruption Guarantee:</strong> Unaffected days remain
              strictly locked and untouched. Only the disrupted slice is recalculated.
            </span>
          </div>

          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              color: INK,
            }}
          >
            Disruption Scenario
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                setDisruptionType('venue_closed');
                setDescription('Belem Tower is closed for renovation today');
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1.5px solid ${disruptionType === 'venue_closed' ? PINE : BORDER}`,
                background: disruptionType === 'venue_closed' ? '#EFEAE0' : '#fff',
                fontSize: 13,
                fontWeight: disruptionType === 'venue_closed' ? 600 : 400,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              🏛️ Venue Closed
            </button>
            <button
              type="button"
              onClick={() => {
                setDisruptionType('flight_delayed');
                setDescription('Inbound flight delayed by 2 hours');
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1.5px solid ${disruptionType === 'flight_delayed' ? PINE : BORDER}`,
                background: disruptionType === 'flight_delayed' ? '#EFEAE0' : '#fff',
                fontSize: 13,
                fontWeight: disruptionType === 'flight_delayed' ? 600 : 400,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              ✈️ Flight Delayed
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: INK,
                }}
              >
                Affected Day
              </label>
              <select
                value={dayIndex}
                onChange={(e) => setDayIndex(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  fontSize: 13,
                  background: '#fff',
                  outline: 'none',
                }}
              >
                {(plan?.days ?? []).map((day) => (
                  <option key={day.day_index} value={day.day_index}>
                    Day {day.day_index + 1}
                  </option>
                ))}
              </select>
            </div>

            {disruptionType === 'flight_delayed' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: INK,
                  }}
                >
                  Delay Duration
                </label>
                <select
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    fontSize: 13,
                    background: '#fff',
                    outline: 'none',
                  }}
                >
                  <option value={60}>+1 Hour</option>
                  <option value={120}>+2 Hours</option>
                  <option value={180}>+3 Hours</option>
                </select>
              </div>
            )}
            {disruptionType === 'venue_closed' && (
              <div>
                <label htmlFor="closed-venue" style={{ display: 'block', fontSize: 13, marginBottom: 6, color: INK }}>
                  Closed Venue
                </label>
                <select
                  id="closed-venue"
                  value={placeId}
                  onChange={(event) => setPlaceId(event.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${BORDER}` }}
                >
                  {dayItems.map((item) => (
                    <option key={item.id} value={item.place_id}>
                      {item.place?.name ?? item.place_id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Event Details
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {error && <p role="alert" style={{ color: CLAY, fontSize: 13 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <SecondaryButton type="button" onClick={onClose}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              disabled={isSubmitting || !plan || (disruptionType === 'venue_closed' && !placeId)}
              onClick={handleExecute}
              style={{ background: CLAY }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Rebalancing...
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Execute Dynamic Rebalance
                </>
              )}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
