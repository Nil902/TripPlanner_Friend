import { useState, useEffect, useCallback } from 'react';
import { Calendar, AlertTriangle, Plus } from 'lucide-react';
import {
  BORDER,
  CLAY,
  INK,
  MUTED,
  PINE,
  SERIF,
  Stop,
} from '../lib/constants';
import { SecondaryButton } from '../components/Button';
import InteractiveMap from '../components/InteractiveMap';
import RebalanceModal from '../components/RebalanceModal';
import DayPicker from '../components/itinerary/DayPicker';
import RefinementAssistant from '../components/itinerary/RefinementAssistant';
import DisruptionDiffReport from '../components/itinerary/DisruptionDiffReport';

import AddStopForm from '../components/itinerary/AddStopForm';
import StopTimeline from '../components/itinerary/StopTimeline';
import AgentAskPanel from '../components/AgentAskPanel';
import { api } from '../lib/api';

/** Convert a 24h "HH:MM" string to "H:MM AM/PM" display format */
function formatTime24to12(time24: string): string {
  const [hoursStr, minutesStr] = time24.split(':');
  const hours = parseInt(hoursStr || '0', 10);
  const minutes = parseInt(minutesStr || '0', 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export interface ItineraryPageProps {
  tripId: string;
  planMode?: 'ai' | 'manual';
}

function getDestinationCenter(dest?: string): { lat: number; lng: number } {
  const d = (dest || '').toLowerCase();
  if (d.includes('tokyo') || d.includes('japan')) return { lat: 35.6762, lng: 139.6503 };
  if (d.includes('paris') || d.includes('france')) return { lat: 48.8566, lng: 2.3522 };
  if (d.includes('new york') || d.includes('nyc')) return { lat: 40.7128, lng: -74.006 };
  if (d.includes('london')) return { lat: 51.5074, lng: -0.1278 };
  return { lat: 38.7223, lng: -9.1393 }; // Lisbon default
}

const DESTINATION_SUGGESTIONS: Record<string, Array<{ name: string; category: string; cost: number }>> = {
  lisbon: [
    { name: 'Belém Tower', category: 'Sightseeing', cost: 10 },
    { name: 'Jerónimos Monastery', category: 'Sightseeing', cost: 12 },
    { name: 'Time Out Market Lisbon', category: 'Restaurant', cost: 22 },
    { name: 'MAAT Museum', category: 'Museum', cost: 11 },
    { name: 'LX Factory Entertainment', category: 'Entertainment', cost: 0 },
    { name: 'Miradouro de Santa Luzia', category: 'Sightseeing', cost: 0 },
  ],
  tokyo: [
    { name: 'Senso-ji Temple', category: 'Sightseeing', cost: 0 },
    { name: 'Shibuya Crossing & Hachiko', category: 'Sightseeing', cost: 0 },
    { name: 'teamLab Planets', category: 'Museum', cost: 32 },
    { name: 'Tsukiji Outer Market', category: 'Restaurant', cost: 28 },
    { name: 'Shinjuku Golden Gai', category: 'Entertainment', cost: 20 },
    { name: 'Akihabara Electric Town', category: 'Entertainment', cost: 10 },
  ],
  paris: [
    { name: 'Louvre Museum', category: 'Museum', cost: 22 },
    { name: 'Eiffel Tower Summit', category: 'Sightseeing', cost: 35 },
    { name: 'Musée d\'Orsay', category: 'Museum', cost: 16 },
    { name: 'Sainte-Chapelle', category: 'Sightseeing', cost: 13 },
    { name: 'Centre Pompidou', category: 'Entertainment', cost: 15 },
    { name: 'Montmartre & Sacré-Cœur', category: 'Sightseeing', cost: 0 },
  ],
};

interface PlanDayItem {
  day_index: number;
  date?: string;
  items?: Array<{
    id?: string;
    place_id?: string;
    place?: {
      name?: string;
      category?: string;
      lat?: number;
      lng?: number;
      est_cost?: number;
    };
    cost?: number;
    start_time?: string;
  }>;
}

function convertPlanDaysToStops(
  days: PlanDayItem[],
  destinationName?: string,
): Record<number, Stop[]> {
  const defaultCenter = getDestinationCenter(destinationName);
  const result: Record<number, Stop[]> = {};
  for (const d of days) {
    const dayNumber = d.day_index + 1;
    const mappedStops: Stop[] = (d.items || []).map((item) => {
      let formattedTime = '10:00 AM';
      try {
        if (item.start_time) {
          const timePart = item.start_time.includes('T')
            ? item.start_time.split('T')[1]?.substring(0, 5)
            : item.start_time.split(' ')[1]?.substring(0, 5);
          if (timePart && /^\d{1,2}:\d{2}$/.test(timePart)) {
            formattedTime = formatTime24to12(timePart);
          } else {
            const dt = new Date(item.start_time);
            if (!isNaN(dt.getTime())) {
              formattedTime = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
          }
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
        lat: item.place?.lat || defaultCenter.lat,
        lng: item.place?.lng || defaultCenter.lng,
      };
    });
    result[dayNumber] = mappedStops.sort((a, b) => {
      const ampmMatch = (t: string) => t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      const parse = (t: string) => {
        const m = ampmMatch(t);
        if (!m) return 0;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const mod = m[3]?.toUpperCase();
        if (mod === 'PM' && h < 12) h += 12;
        if (mod === 'AM' && h === 12) h = 0;
        return h * 60 + min;
      };
      return parse(a.time) - parse(b.time);
    });
  }
  return result;
}

export default function ItineraryPage({ tripId }: ItineraryPageProps) {
  const [day, setDay] = useState<number>(1);
  const [destination, setDestination] = useState<string>('');
  const [isRebalanceOpen, setIsRebalanceOpen] = useState(false);
  const [planVersion, setPlanVersion] = useState(1);
  const [tripDays, setTripDays] = useState<number[]>([1, 2]);
  const [planDaysList, setPlanDaysList] = useState<Array<{ day_index: number; date: string }>>([]);
  const [activeDiff, setActiveDiff] = useState<{
    version: number;
    scenario: string;
    affectedWindow: string;
    unaffectedDays: string;
    substitution: string;
  } | null>(null);

  const [notes, setNotes] = useState<string[]>([]);
  const [isAddingStop, setIsAddingStop] = useState(false);

  // Dynamic Stop data state loaded from backend API
  const [stopsByDay, setStopsByDay] = useState<Record<number, Stop[]>>({});

  const loadPlan = useCallback(() => {
    if (!tripId) return;

    api.trips
      .get(tripId)
      .then((trip) => {
        let currentDest = '';
        if (trip?.destination) {
          currentDest = trip.destination;
          setDestination(trip.destination);
        }
        if (trip?.start_date && trip?.end_date) {
          const start = new Date(trip.start_date);
          const end = new Date(trip.end_date);
          const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          const count = Math.max(1, diff + 1);
          setTripDays(Array.from({ length: count }, (_, i) => i + 1));
        }
        return currentDest;
      })
      .then((currentDest) => {
        return api.plan.get(tripId).then((plan) => {
          if (plan) {
            setPlanVersion(plan.version || 1);
            setNotes(plan.notes || []);
            if (plan.days && plan.days.length > 0) {
              setPlanDaysList(plan.days.map((d) => ({ day_index: d.day_index, date: String(d.date) })));
              setTripDays(plan.days.map((d) => d.day_index + 1));
              const mapped = convertPlanDaysToStops(plan.days, currentDest || destination);
              setStopsByDay(mapped);
            }
          }
        });
      })
      .catch(() => {
        // Fallback for initial state before planning
      });
  }, [tripId, destination]);

  const handleRefined = useCallback((version: number, newNotes: string[], days: PlanDayItem[]) => {
    setPlanVersion(version);
    setNotes(newNotes);
    if (days && days.length > 0) {
      setStopsByDay(convertPlanDaysToStops(days, destination));
    }
  }, [destination]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const handleAddStop = async (newStop: Omit<Stop, 'id'>) => {
    const dayIdx = day - 1;
    const [hoursStr, minutesStr] = newStop.time.includes(':') ? newStop.time.split(':') : ['16', '00'];
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr.replace(/\D/g, ''), 10);
    const endH = (hours + 2) % 24;

    const dayDateStr =
      planDaysList.find((p) => p.day_index === dayIdx)?.date ||
      new Date().toISOString().split('T')[0];
    const startTime = `${dayDateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    const endTime = `${dayDateStr}T${endH.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

    try {
      const addedItem = await api.plan.addItem(tripId, {
        day_index: dayIdx,
        place_name: newStop.name,
        category: newStop.category,
        start_time: startTime,
        end_time: endTime,
        cost: newStop.cost,
      });
      if (addedItem && addedItem.id) {
        const resolvedStop: Stop = {
          ...newStop,
          id: addedItem.id,
          name: addedItem.place?.name || newStop.name,
          cost: addedItem.cost ?? newStop.cost,
          note: addedItem.place?.category || newStop.note,
          category: addedItem.place?.category || newStop.category,
          lat: addedItem.place?.lat ?? newStop.lat,
          lng: addedItem.place?.lng ?? newStop.lng,
        };
        setStopsByDay((prev) => ({
          ...prev,
          [day]: [...(prev[day] || []), resolvedStop].sort((a, b) => {
            const parse = (t: string) => {
              const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
              if (!m) return 0;
              let h = parseInt(m[1], 10);
              const min = parseInt(m[2], 10);
              const mod = m[3]?.toUpperCase();
              if (mod === 'PM' && h < 12) h += 12;
              if (mod === 'AM' && h === 12) h = 0;
              return h * 60 + min;
            };
            return parse(a.time) - parse(b.time);
          }),
        }));
      }
      loadPlan();
    } catch {
      // Offline fallback: already placed optimistically in state
    }
  };

  const handleDeleteStop = async (stopId?: string) => {
    if (!stopId) return;
    try {
      if (!stopId.startsWith('stop-')) {
        await api.plan.deleteItem(tripId, stopId);
      }
    } catch {
      // offline fallback
    }
    setStopsByDay((prev) => ({
      ...prev,
      [day]: (prev[day] || []).filter((s) => s.id !== stopId),
    }));
  };

  const availableDays = Array.from(
    new Set([...tripDays, ...Object.keys(stopsByDay).map(Number)])
  ).sort((a, b) => a - b);

  const currentStops = stopsByDay[day] || [];

  const destKey = destination.toLowerCase().trim();
  const suggestedStops =
    DESTINATION_SUGGESTIONS[destKey] ||
    (destKey.includes('tokyo') ? DESTINATION_SUGGESTIONS['tokyo'] : null) ||
    (destKey.includes('paris') ? DESTINATION_SUGGESTIONS['paris'] : null) ||
    DESTINATION_SUGGESTIONS['lisbon'];

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
      <DisruptionDiffReport
        diff={activeDiff}
        onDismiss={() => setActiveDiff(null)}
      />

      {/* Natural-Language Refinement Assistant */}
      <RefinementAssistant
        tripId={tripId}
        destination={destination}
        planVersion={planVersion}
        notes={notes}
        onRefined={handleRefined}
      />

      {/* Interactive Ask-the-Agent Q&A Panel */}
      <AgentAskPanel tripId={tripId} />

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
        <DayPicker
          availableDays={availableDays}
          currentDay={day}
          onDayChange={setDay}
        />

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
      <AddStopForm
        isOpen={isAddingStop}
        onClose={() => setIsAddingStop(false)}
        onAddStop={handleAddStop}
        day={day}
        destination={destination}
        stopsByDay={stopsByDay}
        suggestedStops={suggestedStops}
      />

      {/* Stops Timeline */}
      <StopTimeline
        stops={currentStops}
        day={day}
        onDeleteStop={handleDeleteStop}
      />

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