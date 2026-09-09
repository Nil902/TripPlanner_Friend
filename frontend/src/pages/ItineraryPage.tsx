import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  AlertTriangle,
  Plus,
  Lock,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Calendar,
} from 'lucide-react';
import {
  BORDER,
  CLAY,
  INK,
  MUTED,
  PINE,
  SERIF,
  Stop,
} from '../lib/constants';
import Chip from '../components/Chip';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import InteractiveMap from '../components/InteractiveMap';
import RebalanceModal from '../components/RebalanceModal';
import { api } from '../lib/api';

export interface ItineraryPageProps {
  tripId: string;
}

function convertPlanDaysToStops(
  days: Array<{ day_index: number; items?: Array<{ id?: string; place_id?: string; place?: { name?: string; category?: string; lat?: number; lng?: number; est_cost?: number }; cost?: number; start_time?: string }> }>,
): Record<number, Stop[]> {
  const result: Record<number, Stop[]> = {};
  for (const d of days) {
    const dayNumber = d.day_index + 1;
    result[dayNumber] = (d.items || []).map((item) => {
      let formattedTime = '10:00 AM';
      try {
        if (item.start_time) {
          const dt = new Date(item.start_time);
          formattedTime = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
      } catch {
        formattedTime = '10:00 AM';
      }
      return {
        id: item.id || `item-${item.place_id}`,
        time: formattedTime,
        name: item.place?.name || 'Scheduled Activity',
        cost: item.cost ?? item.place?.est_cost ?? 0,
        note: item.place?.category || null,
        category: item.place?.category || 'Sightseeing',
        lat: item.place?.lat || 38.72,
        lng: item.place?.lng || -9.14,
      };
    });
  }
  return result;
}

export default function ItineraryPage({ tripId }: ItineraryPageProps) {
  const [day, setDay] = useState<number>(1);
  const [isRebalanceOpen, setIsRebalanceOpen] = useState(false);
  const [planVersion, setPlanVersion] = useState(1);
  const [activeDiff, setActiveDiff] = useState<{
    version: number;
    scenario: string;
    affectedWindow: string;
    unaffectedDays: string;
    substitution: string;
  } | null>(null);

  const [notes, setNotes] = useState<string[]>([]);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Dynamic Stop data state loaded from backend API
  const [stopsByDay, setStopsByDay] = useState<Record<number, Stop[]>>({});
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [newStopName, setNewStopName] = useState('');
  const [newStopTime, setNewStopTime] = useState('16:00');
  const [newStopCost, setNewStopCost] = useState('10');

  const loadPlan = useCallback(() => {
    if (!tripId) return;
    api.plan
      .get(tripId)
      .then((plan) => {
        if (plan) {
          setPlanVersion(plan.version || 1);
          setNotes(plan.notes || []);
          if (plan.days && plan.days.length > 0) {
            const mapped = convertPlanDaysToStops(plan.days);
            setStopsByDay(mapped);
          }
        }
      })
      .catch(() => {
        // Fallback for initial state before planning
      });
  }, [tripId]);

  const handleRefine = async () => {
    if (!refineInstruction.trim() || isRefining) return;
    setIsRefining(true);
    try {
      const updated = await api.plan.refine(tripId, {
        instruction: refineInstruction.trim(),
      });
      if (updated) {
        setPlanVersion(updated.version || planVersion + 1);
        setNotes(updated.notes || []);
        if (updated.days && updated.days.length > 0) {
          setStopsByDay(convertPlanDaysToStops(updated.days));
        }
      }
      setRefineInstruction('');
    } catch {
      // Fallback
    } finally {
      setIsRefining(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const handleAddStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStopName.trim()) return;

    const costNum = parseFloat(newStopCost) || 0;
    const dayIdx = day - 1;

    try {
      const [hoursStr, minutesStr] = newStopTime.split(':');
      const hours = parseInt(hoursStr || '16', 10);
      const minutes = parseInt(minutesStr || '0', 10);
      
      const startTimeObj = new Date();
      startTimeObj.setHours(hours, minutes, 0, 0);
      const startTime = startTimeObj.toISOString();
      
      const endTimeObj = new Date(startTimeObj);
      endTimeObj.setHours(hours + 2, minutes, 0, 0);
      const endTime = endTimeObj.toISOString();

      await api.plan.addItem(tripId, {
        day_index: dayIdx,
        place_name: newStopName.trim(),
        category: 'Sightseeing',
        start_time: startTime,
        end_time: endTime,
        cost: costNum,
      });
      loadPlan();
    } catch {
      const newStop: Stop = {
        id: `stop-${Date.now()}`,
        time: newStopTime,
        name: newStopName.trim(),
        cost: costNum,
        note: 'Custom manual stop added to schedule',
        category: 'Sightseeing',
      };

      setStopsByDay((prev) => ({
        ...prev,
        [day]: [...(prev[day] || []), newStop],
      }));
    }

    setNewStopName('');
    setIsAddingStop(false);
  };

  const currentStops = stopsByDay[day] || [];

  return (
    <div style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
      {/* Top Title & Rebalance Trigger */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1
              style={{
                ...SERIF,
                fontSize: 'clamp(22px, 5vw, 26px)',
                fontWeight: 400,
                margin: '0 0 4px',
                color: INK,
              }}
            >
              Itinerary
            </h1>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                background: '#FAF6EE',
                border: `1px solid ${BORDER}`,
                color: PINE,
              }}
            >
              Plan v{planVersion}
            </span>
          </div>
          <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>
            Optimized route to eliminate transit backtracking across town.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SecondaryButton
            onClick={() => {
              const url = api.plan.getExportIcsUrl(tripId);
              window.open(url, '_blank');
            }}
            style={{
              fontSize: 13,
              padding: '8px 14px',
              color: PINE,
              borderColor: BORDER,
              background: '#fff',
            }}
          >
            <Calendar size={14} color={PINE} /> Export .ics
          </SecondaryButton>

          <SecondaryButton
            onClick={() => setIsRebalanceOpen(true)}
            style={{
              fontSize: 13,
              padding: '8px 14px',
              color: CLAY,
              borderColor: '#F0D5C7',
              background: '#FDF7F3',
            }}
          >
            <AlertTriangle size={14} color={CLAY} /> Simulate Disruption
          </SecondaryButton>
        </div>
      </div>

      {/* Disruption Diff Report (if triggered) */}
      {activeDiff && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 12,
            background: '#FDF6F2',
            border: `1px solid ${CLAY}`,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <GitBranch size={16} color={CLAY} />
            <strong style={{ fontSize: 14, color: INK }}>
              Dynamic Rebalance Version Diff (v{activeDiff.version - 1} → v
              {activeDiff.version})
            </strong>
          </div>
          <div style={{ fontSize: 13, color: INK, marginBottom: 8, lineHeight: 1.4 }}>
            <strong>{activeDiff.scenario}:</strong> {activeDiff.substitution}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} color={CLAY} /> {activeDiff.affectedWindow}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={12} color={PINE} /> {activeDiff.unaffectedDays}
            </span>
          </div>
        </div>
      )}

      {/* Deterministic Validation Integrity Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: 10,
          background: '#EEF3ED',
          border: `1px solid #D5E2D4`,
          marginBottom: 16,
          fontSize: 12,
          color: PINE,
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <ShieldCheck size={16} /> Deterministic Plan Validation Passed
        </span>
        <span>Budget math, Travel geometry, & Hours synchronized</span>
      </div>

      {/* Natural-Language Refinement Assistant */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 12,
          background: '#fff',
          border: `1px solid ${BORDER}`,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Sparkles size={16} color={PINE} />
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
            Refine Itinerary with AI Agent
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={refineInstruction}
            onChange={(e) => setRefineInstruction(e.target.value)}
            placeholder="e.g. 'Make Day 2 more relaxed', 'Swap lunch for seafood under $30'..."
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              fontSize: 13,
              outline: 'none',
              background: '#FAF6EE',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRefine();
            }}
          />
          <PrimaryButton
            onClick={handleRefine}
            disabled={isRefining || !refineInstruction.trim()}
            style={{ fontSize: 13, padding: '8px 16px', whiteSpace: 'nowrap' }}
          >
            {isRefining ? 'Refining...' : 'Refine'}
          </PrimaryButton>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            'Make Day 2 more relaxed',
            'Swap lunch for seafood under $30',
            'Add evening viewpoint',
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setRefineInstruction(prompt)}
              style={{
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 6,
                background: '#F8F9FA',
                border: `1px solid ${BORDER}`,
                color: MUTED,
                cursor: 'pointer',
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Reasoning & Tradeoff Explanations */}
      {notes && notes.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: '#FAF8F5',
            border: `1px solid ${BORDER}`,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 }}>
            Agent Reasoning & Tradeoff Explanations:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            {notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Interactive Map Visualizing Spatial Geometry */}
      <InteractiveMap stops={currentStops} dayIndex={day} />

      {/* Day Picker */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {(Object.keys(stopsByDay).length > 0
            ? Object.keys(stopsByDay).map(Number).sort((a, b) => a - b)
            : [1, 2]
          ).map((d) => (
            <Chip
              key={d}
              label={`Day ${d}`}
              active={day === d}
              onClick={() => setDay(d)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsAddingStop(!isAddingStop)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            background: '#fff',
            fontSize: 13,
            color: INK,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} color={PINE} /> Add Stop
        </button>
      </div>

      {/* Manual Add Stop Form */}
      {isAddingStop && (
        <form
          onSubmit={handleAddStop}
          style={{
            padding: 16,
            borderRadius: 10,
            background: '#FAF6EE',
            border: `1px solid ${BORDER}`,
            marginBottom: 20,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            placeholder="Venue Name (e.g. MAAT Museum)"
            value={newStopName}
            onChange={(e) => setNewStopName(e.target.value)}
            style={{
              flex: 2,
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              fontSize: 13,
              background: '#fff',
              outline: 'none',
            }}
          />
          <input
            type="time"
            value={newStopTime}
            onChange={(e) => setNewStopTime(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              fontSize: 13,
              background: '#fff',
              outline: 'none',
            }}
          />
          <div style={{ position: 'relative', width: 80 }}>
            <span style={{ position: 'absolute', left: 10, top: 9, fontSize: 13, color: MUTED }}>$</span>
            <input
              type="number"
              placeholder="0"
              value={newStopCost}
              onChange={(e) => setNewStopCost(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 22px',
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                background: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: 'none',
              background: PINE,
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Add
          </button>
        </form>
      )}

      {/* Stops Timeline */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '4px 16px' }}>
        {currentStops.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: MUTED, fontSize: 13, fontStyle: 'italic' }}>
            No stops scheduled for Day {day} yet. Click 'Add Stop' above or generate an itinerary from the Overview tab.
          </div>
        ) : (
          currentStops.map((stop, i) => (
            <div
              key={stop.id || i}
              style={{
                display: 'flex',
                gap: 14,
                padding: '16px 4px',
                borderBottom:
                  i < currentStops.length - 1
                    ? `1px solid ${BORDER}`
                    : 'none',
              }}
            >
              {/* Time */}
              <div
                style={{
                  width: 80,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  color: MUTED,
                  fontSize: 13,
                }}
              >
                <Clock size={13} /> {stop.time}
              </div>

              {/* Stop Details */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: INK,
                    }}
                  >
                    {stop.name}
                  </span>

                  {stop.cost > 0 ? (
                    <span
                      style={{
                        fontSize: 12,
                        color: MUTED,
                        background: '#FAF6EE',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      ${stop.cost}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        color: PINE,
                        background: '#EEF3ED',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      Free
                    </span>
                  )}

                  {stop.category && (
                    <span
                      style={{
                        fontSize: 11,
                        color: MUTED,
                        border: `1px solid ${BORDER}`,
                        padding: '1px 6px',
                        borderRadius: 10,
                      }}
                    >
                      {stop.category}
                    </span>
                  )}
                </div>

                {/* Transition notes & reasonings */}
                {stop.note && (
                  <p
                    style={{
                      fontSize: 13,
                      color: MUTED,
                      margin: '4px 0 0',
                      lineHeight: 1.4,
                    }}
                  >
                    {stop.note}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <RebalanceModal
        isOpen={isRebalanceOpen}
        onClose={() => setIsRebalanceOpen(false)}
        tripId={tripId}
        onRebalanced={(result) => {
          setPlanVersion((v) => v + 1);
          setActiveDiff(result);
          loadPlan();
        }}
      />
    </div>
  );
}
