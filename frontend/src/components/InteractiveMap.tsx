import { useMemo, useState } from 'react';
import { Navigation, Compass, MapPin } from 'lucide-react';
import { BORDER, INK, MUTED, PINE, CLAY, SERIF, Stop } from '../lib/constants';

export interface InteractiveMapProps {
  stops: Stop[];
  dayIndex: number;
}

/** Calculate distance between two lat/lng coordinates in km using Haversine formula */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface ProjectedPoint {
  x: number;
  y: number;
  stop: Stop;
  index: number;
}

export default function InteractiveMap({ stops, dayIndex }: InteractiveMapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { points, totalDistanceKm, estTransitMins } = useMemo(() => {
    if (!stops || stops.length === 0) {
      return { points: [], totalDistanceKm: 0, estTransitMins: 0 };
    }

    const SVG_WIDTH = 500;
    const SVG_HEIGHT = 200;
    const PAD_X = 65;
    const PAD_Y = 48;
    const USABLE_W = SVG_WIDTH - PAD_X * 2;
    const USABLE_H = SVG_HEIGHT - PAD_Y * 2;

    // Resolve lat/lng coordinates for each stop
    const resolvedStops = stops.map((s, idx) => {
      let lat = typeof s.lat === 'number' && !isNaN(s.lat) && s.lat !== 0 ? s.lat : null;
      let lng = typeof s.lng === 'number' && !isNaN(s.lng) && s.lng !== 0 ? s.lng : null;

      if (lat === null || lng === null) {
        // Fallback: distribute smoothly in destination area
        lat = 38.71 + Math.sin(idx * 1.5) * 0.015;
        lng = -9.14 + Math.cos(idx * 1.5) * 0.025;
      }
      return { ...s, lat, lng };
    });

    // Single stop: center in canvas
    if (resolvedStops.length === 1) {
      return {
        points: [
          {
            x: SVG_WIDTH / 2,
            y: SVG_HEIGHT / 2 + 5,
            stop: resolvedStops[0],
            index: 0,
          },
        ],
        totalDistanceKm: 0,
        estTransitMins: 0,
      };
    }

    // Multiple stops: compute bounding box
    const lats = resolvedStops.map((s) => s.lat);
    const lngs = resolvedStops.map((s) => s.lng);

    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);

    const latSpan = Math.max(0.012, maxLat - minLat);
    const lngSpan = Math.max(0.016, maxLng - minLng);

    // Expand bounds slightly to prevent edge-clipping
    const padLat = latSpan * 0.15;
    const padLng = lngSpan * 0.15;
    minLat -= padLat;
    maxLat += padLat;
    minLng -= padLng;
    maxLng += padLng;

    const finalLatSpan = maxLat - minLat;
    const finalLngSpan = maxLng - minLng;

    const pts: ProjectedPoint[] = resolvedStops.map((stop, idx) => {
      // Map longitude to X (West to East -> left to right)
      const x = PAD_X + ((stop.lng - minLng) / finalLngSpan) * USABLE_W;
      // Map latitude to Y (North to South -> top to bottom)
      const y = PAD_Y + ((maxLat - stop.lat) / finalLatSpan) * USABLE_H;

      return {
        x: Math.round(x),
        y: Math.round(y),
        stop,
        index: idx,
      };
    });

    // Handle collision / close overlap
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 26) {
          pts[j].x += 20;
          pts[j].y -= 14;
        }
      }
    }

    // Compute cumulative distance
    let distKm = 0;
    for (let i = 0; i < resolvedStops.length - 1; i++) {
      distKm += haversineKm(
        resolvedStops[i].lat,
        resolvedStops[i].lng,
        resolvedStops[i + 1].lat,
        resolvedStops[i + 1].lng,
      );
    }

    const transitMins = Math.max(
      5,
      Math.round(distKm * 3.5 + (resolvedStops.length - 1) * 6),
    );

    return {
      points: pts,
      totalDistanceKm: distKm,
      estTransitMins: transitMins,
    };
  }, [stops]);

  // Build SVG path data for route connecting the points
  const pathD = useMemo(() => {
    if (points.length < 2) return '';
    return points.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');
  }, [points]);

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
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Compass size={16} color={PINE} />
          <span style={{ ...SERIF, fontSize: 15, fontWeight: 600, color: INK }}>
            Day {dayIndex} Route Map & Spatial Geometry
          </span>
        </div>
        <span style={{ fontSize: 12, color: MUTED }}>
          Geographic projection & route optimization
        </span>
      </div>

      {/* SVG Canvas */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 200,
          background: '#F4EEE1',
          borderRadius: 10,
          border: `1px solid ${BORDER}`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {stops.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              color: MUTED,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <MapPin size={28} color={MUTED} style={{ opacity: 0.5 }} />
            <span style={{ fontSize: 13, fontStyle: 'italic' }}>
              No stops scheduled for Day {dayIndex} yet.
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>
              Add a destination stop below to plot its real route on this map.
            </span>
          </div>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 500 200"
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0 }}
            role="img"
            aria-label={`Day ${dayIndex} route map showing ${stops.length} stop${stops.length === 1 ? '' : 's'}: ${stops.map((s) => s.name).join(', ')}`}
          >
            <title>Day {dayIndex} route map — {stops.length} stop{stops.length === 1 ? '' : 's'}</title>
            <defs>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.2" />
              </filter>
            </defs>

            {/* Subtle terrain topography grid */}
            <path
              d="M 20 60 Q 150 40 280 80 T 480 50"
              fill="none"
              stroke="#E3DAC8"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            <path
              d="M 30 150 Q 160 170 300 130 T 470 160"
              fill="none"
              stroke="#E3DAC8"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            <path
              d="M 0 170 Q 250 185 500 165 L 500 200 L 0 200 Z"
              fill="#E5DDD0"
              opacity="0.5"
            />

            {/* Route path glow and line */}
            {points.length > 1 && (
              <>
                <path
                  d={pathD}
                  fill="none"
                  stroke="rgba(193, 104, 63, 0.22)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={CLAY}
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Stop pins and labels */}
            {points.map((pt) => {
              const isHovered = hoveredIndex === pt.index;
              const displayName = pt.stop.name.length > 16
                ? `${pt.stop.name.slice(0, 15)}…`
                : pt.stop.name;

              return (
                <g
                  key={pt.stop.id || `pt-${pt.index}`}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
                  onMouseEnter={() => setHoveredIndex(pt.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(pt.index)}
                  onBlur={() => setHoveredIndex(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Stop ${pt.index + 1}: ${pt.stop.name}${pt.stop.cost > 0 ? `, $${pt.stop.cost}` : ', free'}`}
                >
                  {/* Pin shadow */}
                  <ellipse cx="0" cy="8" rx="8" ry="3" fill="rgba(36,33,28,0.2)" />

                  {/* Pin Circle */}
                  <circle
                    cx="0"
                    cy="0"
                    r={isHovered ? 13 : 11}
                    fill={isHovered ? CLAY : PINE}
                    stroke="#fff"
                    strokeWidth="2.2"
                    filter="url(#shadow)"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={isHovered ? 11 : 10}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {pt.index + 1}
                  </text>

                  {/* Pill label above pin */}
                  <g transform="translate(0, -26)">
                    <rect
                      x="-48"
                      y="-11"
                      width="96"
                      height="20"
                      rx="6"
                      fill="#fff"
                      stroke={isHovered ? CLAY : BORDER}
                      strokeWidth={isHovered ? 1.5 : 0.8}
                      filter="url(#shadow)"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={INK}
                      fontSize="9"
                      fontWeight="600"
                      fontFamily="sans-serif"
                    >
                      {displayName}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        )}
        <span
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            borderWidth: 0,
          }}
        >
          Route map for Day {dayIndex}: {stops.map((s, i) => `Stop ${i + 1}: ${s.name}`).join('. ')}.
        </span>
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
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          <Navigation size={13} color={CLAY} /> {stops.length} stop{stops.length === 1 ? '' : 's'} sequenced
          {totalDistanceKm > 0 && ` (${totalDistanceKm.toFixed(1)} km total)`}
        </span>
        <span>
          {stops.length > 1
            ? `Est. transit between stops: ~${estTransitMins} mins`
            : stops.length === 1
            ? 'Add more stops to see transit routes'
            : 'No transit legs yet'}
        </span>
      </div>
    </div>
  );
}

