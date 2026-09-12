import { Clock, Trash2 } from 'lucide-react';
import { PINE, CLAY, INK, MUTED, BORDER } from '../../lib/constants';
import type { Stop } from '../../lib/constants';

interface StopTimelineProps {
  stops: Stop[];
  day: number;
  onDeleteStop: (stopId?: string) => void;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const ampmMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const modifier = ampmMatch[3] ? ampmMatch[3].toUpperCase() : null;
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  return 0;
}

function sortStops(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
}

export default function StopTimeline({ stops, day, onDeleteStop }: StopTimelineProps) {
  const currentStops = sortStops(stops);

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '4px 16px' }}>
      {currentStops.length === 0 ? (
        <div style={{ padding: '36px 16px', textAlign: 'center', color: MUTED, fontSize: 13, fontStyle: 'italic' }}>
          No stops scheduled for Day {day} yet. Click 'Add Stop' above to add your own venue or activity to this day.
        </div>
      ) : (
        currentStops.map((stop, i) => (
          <div
            key={stop.id || i}
            style={{
              display: 'flex',
              gap: 14,
              padding: '16px 4px',
              alignItems: 'center',
              borderBottom:
                i < currentStops.length - 1
                  ? `1px solid ${BORDER}`
                  : 'none',
            }}
          >
            <div
              style={{
                width: 85,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                color: INK,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <Clock size={13} color={PINE} /> {stop.time}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>
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

            <button
              type="button"
              onClick={() => onDeleteStop(stop.id)}
              title="Remove stop"
              style={{
                background: 'transparent',
                border: 'none',
                color: MUTED,
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = CLAY)}
              onMouseLeave={(e) => (e.currentTarget.style.color = MUTED)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}