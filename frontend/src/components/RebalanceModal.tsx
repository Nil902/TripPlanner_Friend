import { useState } from 'react';
import { X, AlertTriangle, Sparkles, RefreshCw, Lock } from 'lucide-react';
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
  const [disruptionType, setDisruptionType] = useState<
    'venue_closed' | 'flight_delayed' | 'weather_alert' | 'custom'
  >('venue_closed');
  const [dayIndex, setDayIndex] = useState(0);
  const [description, setDescription] = useState('Belem Tower is closed for renovation today');
  const [delayMinutes, setDelayMinutes] = useState(120);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExecute = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const plan = await api.plan.rebalance(tripId, {
        type: disruptionType,
        day_index: dayIndex,
        delay_minutes: disruptionType === 'flight_delayed' ? delayMinutes : undefined,
        description,
      });
      onRebalanced({
        version: plan.version,
        scenario: disruptionType.replace(/_/g, ' ').toUpperCase(),
        affectedWindow: `Day ${dayIndex + 1}`,
        unaffectedDays: 'Other days are preserved in the saved plan version.',
        substitution: plan.notes.join(' ') || 'The updated itinerary has been saved.',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rebalance the itinerary. Please try again.');
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
                Agent scopes & rebalances only the affected time window
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
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
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
            <button
              type="button"
              onClick={() => {
                setDisruptionType('weather_alert');
                setDescription('Heavy rain expected between 2 PM and 6 PM');
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1.5px solid ${disruptionType === 'weather_alert' ? PINE : BORDER}`,
                background: disruptionType === 'weather_alert' ? '#EFEAE0' : '#fff',
                fontSize: 13,
                fontWeight: disruptionType === 'weather_alert' ? 600 : 400,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              🌧️ Weather Alert
            </button>
            <button
              type="button"
              onClick={() => {
                setDisruptionType('custom');
                setDescription('Lunch venue fully booked, need nearby alternative under $25');
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1.5px solid ${disruptionType === 'custom' ? PINE : BORDER}`,
                background: disruptionType === 'custom' ? '#EFEAE0' : '#fff',
                fontSize: 13,
                fontWeight: disruptionType === 'custom' ? 600 : 400,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              ⚡ Custom Change
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
                <option value={0}>Day 1 (Arrival)</option>
                <option value={1}>Day 2 (Exploration)</option>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <SecondaryButton type="button" onClick={onClose}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              disabled={isSubmitting}
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
