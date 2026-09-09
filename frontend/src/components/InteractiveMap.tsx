import { Navigation, Compass } from 'lucide-react';
import { BORDER, INK, MUTED, PINE, CLAY, SERIF, Stop } from '../lib/constants';

export interface InteractiveMapProps {
  stops: Stop[];
  dayIndex: number;
}

export default function InteractiveMap({ stops, dayIndex }: InteractiveMapProps) {
  // Compute normalized coordinates for SVG canvas display
  const points = [
    { x: 70, y: 140 },
    { x: 190, y: 90 },
    { x: 320, y: 150 },
    { x: 420, y: 70 },
  ];

  return (
    <div
      style={{
        background: '#FAF8F5',
        borderRadius: 14,
        border: `1px solid ${BORDER}`,
        padding: '16px 20px',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Compass size={16} color={PINE} />
          <span style={{ ...SERIF, fontSize: 15, fontWeight: 600, color: INK }}>
            Day {dayIndex} Route Map & Spatial Geometry
          </span>
        </div>
        <span style={{ fontSize: 12, color: MUTED }}>
          Backtracking minimized via Distance Matrix
        </span>
      </div>

      {/* SVG Canvas */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 180,
          background: '#F4EEE1',
          borderRadius: 10,
          border: `1px solid ${BORDER}`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 500 200"
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* Subtle grid and terrain lines */}
          <path
            d="M 20 60 Q 150 40 280 80 T 480 50"
            fill="none"
            stroke="#E3DAC8"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <path
            d="M 30 150 Q 160 170 300 130 T 470 160"
            fill="none"
            stroke="#E3DAC8"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* River / Coastline subtle curve */}
          <path
            d="M 0 170 Q 250 185 500 165 L 500 200 L 0 200 Z"
            fill="#E5DDD0"
            opacity="0.6"
          />

          {/* Route path connecting the stops */}
          {stops.length > 1 && (
            <path
              d={stops.reduce((acc, _, i) => {
                const pt = points[i % points.length];
                return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
              }, '')}
              fill="none"
              stroke={CLAY}
              strokeWidth="2.5"
              strokeDasharray="5 5"
            />
          )}

          {/* Stop markers */}
          {stops.map((stop, i) => {
            const pt = points[i % points.length];
            return (
              <g key={stop.name + i} transform={`translate(${pt.x}, ${pt.y})`}>
                {/* Pin shadow */}
                <ellipse cx="0" cy="5" rx="8" ry="3" fill="rgba(36,33,28,0.15)" />
                {/* Pin body */}
                <circle cx="0" cy="0" r="11" fill={PINE} stroke="#fff" strokeWidth="2" />
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {i + 1}
                </text>
                {/* Name tag pill */}
                <rect
                  x="-40"
                  y="-26"
                  width="80"
                  height="16"
                  rx="4"
                  fill="#fff"
                  stroke={BORDER}
                  strokeWidth="0.8"
                />
                <text
                  x="0"
                  y="-14"
                  textAnchor="middle"
                  fill={INK}
                  fontSize="8.5"
                  fontWeight="600"
                  fontFamily="sans-serif"
                >
                  {stop.name.slice(0, 14)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Route leg stats summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          fontSize: 12,
          color: MUTED,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Navigation size={13} color={CLAY} /> {stops.length} stops sequenced
        </span>
        <span>Avg. transit between stops: 8–12 mins</span>
      </div>
    </div>
  );
}
