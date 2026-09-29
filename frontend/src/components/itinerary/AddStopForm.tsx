import { useState, FormEvent } from 'react';
import { X } from 'lucide-react';
import { PINE, BORDER, MUTED, INK } from '../../lib/constants';
import type { Stop } from '../../lib/constants';

interface AddStopFormProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStop: (stop: Omit<Stop, 'id'>) => Promise<void>;
  day: number;
  destination: string;
  stopsByDay: Record<number, Stop[]>;
  suggestedStops: Array<{ name: string; category: string; cost: number }>;
}

export default function AddStopForm({
  isOpen,
  onClose,
  onAddStop,
  day,
  destination,
  stopsByDay,
  suggestedStops,
}: AddStopFormProps) {
  const [newStopName, setNewStopName] = useState('');
  const [newStopTime, setNewStopTime] = useState('16:00');
  const [newStopCost, setNewStopCost] = useState('10');
  const [newStopCategory, setNewStopCategory] = useState('Sightseeing');

  const STOP_CATEGORIES = [
    'Sightseeing',
    'Restaurant',
    'Cafe',
    'Museum',
    'Entertainment',
    'Park',
    'Shopping',
    'Nightlife',
    'Culture',
    'Relaxed',
    'Other',
  ];

  function formatTime24to12(time24: string): string {
    const [hoursStr, minutesStr] = time24.split(':');
    const hours = parseInt(hoursStr || '0', 10);
    const minutes = parseInt(minutesStr || '0', 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  function getDestinationCenter(dest?: string): { lat: number; lng: number } {
    const d = (dest || '').toLowerCase();
    if (d.includes('tokyo') || d.includes('japan')) return { lat: 35.6762, lng: 139.6503 };
    if (d.includes('paris') || d.includes('france')) return { lat: 48.8566, lng: 2.3522 };
    if (d.includes('new york') || d.includes('nyc')) return { lat: 40.7128, lng: -74.006 };
    if (d.includes('london')) return { lat: 51.5074, lng: -0.1278 };
    if (d.includes('siem reap') || d.includes('angkor')) return { lat: 13.4125, lng: 103.8670 };
    return { lat: 38.7223, lng: -9.1393 };
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newStopName.trim()) return;

    const costNum = parseFloat(newStopCost) || 0;
    const displayTime = formatTime24to12(newStopTime);

    const destCenter = getDestinationCenter(destination);
    const existingDayStops = stopsByDay[day] || [];
    let optLat = destCenter.lat;
    let optLng = destCenter.lng;
    if (existingDayStops.length > 0 && existingDayStops[0].lat && existingDayStops[0].lng) {
      const angle = (existingDayStops.length * 1.35) % (2 * Math.PI);
      const dist = 0.008 + (existingDayStops.length % 4) * 0.004;
      optLat = Number((existingDayStops[0].lat + Math.sin(angle) * dist).toFixed(6));
      optLng = Number((existingDayStops[0].lng + Math.cos(angle) * dist).toFixed(6));
    }

    const newStop: Omit<Stop, 'id'> = {
      time: displayTime,
      name: newStopName.trim(),
      cost: costNum,
      note: 'Custom stop added manually',
      category: newStopCategory,
      lat: optLat,
      lng: optLng,
    };

    await onAddStop(newStop);

    setNewStopName('');
    setNewStopCost('10');
    setNewStopCategory('Sightseeing');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <form onSubmit={handleSubmit} style={{
      padding: '14px 16px',
      borderRadius: 10,
      background: '#FAF6EE',
      border: `1px solid ${BORDER}`,
      marginBottom: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: INK }}>Add Stop</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add stop form"
          title="Close"
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: MUTED,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <input
        type="text"
        placeholder="Venue / Place name (e.g. MAAT Museum, Night Market)"
        value={newStopName}
        onChange={(e) => setNewStopName(e.target.value)}
        autoFocus
        required
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 6,
          border: `1px solid ${BORDER}`,
          fontSize: 13,
          background: '#fff',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
          Quick Suggestions ({destination || 'Popular Places'}):
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestedStops.map((sug) => (
            <button
              key={sug.name}
              type="button"
              onClick={() => {
                setNewStopName(sug.name);
                setNewStopCategory(sug.category);
                setNewStopCost(String(sug.cost));
              }}
              style={{
                padding: '3px 8px',
                borderRadius: 14,
                border: `1px solid ${BORDER}`,
                background: newStopName === sug.name ? '#E5EDE9' : '#fff',
                color: newStopName === sug.name ? PINE : INK,
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>{sug.name}</span>
              <span style={{ color: MUTED, fontSize: 10 }}>(${sug.cost})</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Time</label>
          <input
            type="time"
            value={newStopTime}
            onChange={(e) => setNewStopTime(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              fontSize: 13,
              background: '#fff',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Cost (USD)</label>
          <div style={{ position: 'relative', width: 90 }}>
            <span style={{ position: 'absolute', left: 10, top: 8, fontSize: 13, color: MUTED }}>$</span>
            <input
              type="number"
              placeholder="0"
              min="0"
              value={newStopCost}
              onChange={(e) => setNewStopCost(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 22px',
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                background: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Category</label>
          <select
            value={newStopCategory}
            onChange={(e) => setNewStopCategory(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              fontSize: 13,
              background: '#fff',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {STOP_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: '#fff',
              color: MUTED,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: PINE,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Add Stop
          </button>
        </div>
      </div>
    </form>
  );
}