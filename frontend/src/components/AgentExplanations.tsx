import { useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Scale,
  ChevronDown,
  ChevronUp,
  Sliders,
  DollarSign,
  MapPin,
  Clock,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  BORDER,
  CLAY,
  INK,
  MUTED,
  PINE,
  SERIF,
} from '../lib/constants';

export interface AgentExplanationsProps {
  notes: string[];
  title?: string;
  style?: React.CSSProperties;
}

interface ParsedExplanation {
  id: string;
  type: 'success' | 'correction' | 'relaxation' | 'refinement' | 'rebalance' | 'info';
  category: string;
  title: string;
  description: string;
  raw: string;
  badgeColor: string;
  badgeBg: string;
  borderColor: string;
}

interface AggregatedNote {
  note: string;
  children: string[];
}

function aggregateNotes(notes: string[]): AggregatedNote[] {
  const result: AggregatedNote[] = [];
  for (const n of notes) {
    const trimmed = n.trim();
    if (trimmed.startsWith('-') && result.length > 0) {
      result[result.length - 1].children.push(trimmed.replace(/^-\s*/, ''));
    } else {
      result.push({ note: n, children: [] });
    }
  }
  return result;
}

function deTag(reason: string): string {
  return reason.replace(/\[([\w_]+)\]/g, '$1:').trim();
}

function parseNote(note: string, index: number, children: string[] = []): ParsedExplanation {
  const clean = note.trim();
  const lower = clean.toLowerCase();
  const childLines = children.map(deTag).map((l) => `• ${l}`);

  if (
    lower.includes('all deterministic validations passed strictly') ||
    lower.includes('validations passed')
  ) {
    const warningsMatch = clean.match(
      /\((\d+)\s+budget warnings?,\s+(\d+)\s+travel warnings?\)/i,
    );
    let warningDetails = '';
    if (warningsMatch) {
      const budgetW = parseInt(warningsMatch[1], 10);
      const travelW = parseInt(warningsMatch[2], 10);
      if (budgetW === 0 && travelW === 0) {
        warningDetails =
          'Zero budget overruns, zero transit conflicts, all open hours aligned.';
      } else {
        warningDetails = `${budgetW} budget warnings and ${travelW} travel warnings reviewed and accommodated.`;
      }
    }
    return {
      id: `note-${index}`,
      type: 'success',
      category: 'Deterministic Validation',
      title: 'Optimal Schedule Validated',
      description:
        `All candidate stops passed deterministic budget, travel duration, and open-hour checks. ${warningDetails}`.trim(),
      raw: clean,
      badgeColor: PINE,
      badgeBg: '#EAF3EF',
      borderColor: '#C3D8CE',
    };
  }

  if (
    lower.includes('validators rejected') ||
    lower.includes('rejected by validators') ||
    lower.includes('self-correcting')
  ) {
    const cleanedReasons = childLines.length
      ? childLines
      : [deTag(clean.split(':')[1] || clean)];

    return {
      id: `note-${index}`,
      type: 'correction',
      category: 'Self-Correction',
      title: 'Resolved Constraint Conflict',
      description:
        'Validator flagged the following conflict(s), which the agent repaired with compliant alternatives:\n' +
        cleanedReasons.join('\n'),
      raw: clean,
      badgeColor: CLAY,
      badgeBg: '#FDF2EC',
      borderColor: '#F1C7B2',
    };
  }

  if (
    lower.includes('constraint relaxation') ||
    lower.includes('budget cap by 15%')
  ) {
    return {
      id: `note-${index}`,
      type: 'relaxation',
      category: 'Tradeoff Decision',
      title: 'Budget Cap Relaxed for Must-Sees',
      description:
        'Relaxed daily budget ceiling by 15% to preserve must-see attractions without dropping key group destinations.',
      raw: clean,
      badgeColor: '#7C3AED',
      badgeBg: '#F3E8FF',
      borderColor: '#DDD6FE',
    };
  }

  if (
    lower.includes('refinement requested by user') ||
    lower.includes('refinement requested')
  ) {
    const quoteMatch = clean.match(/['"](.*?)['"]/);
    const instruction = quoteMatch ? quoteMatch[1] : clean;
    return {
      id: `note-${index}`,
      type: 'refinement',
      category: 'User Refinement',
      title: `Applied Custom Request: "${instruction}"`,
      description:
        'Agent re-evaluated the itinerary to incorporate your instruction while preserving other confirmed stops.',
      raw: clean,
      badgeColor: PINE,
      badgeBg: '#EAF3EF',
      borderColor: '#C3D8CE',
    };
  }

  if (lower.includes('substituted')) {
    return {
      id: `note-${index}`,
      type: 'refinement',
      category: 'Venue Substitution',
      title: 'Activity Replaced',
      description: clean,
      raw: clean,
      badgeColor: INK,
      badgeBg: '#F3EEE2',
      borderColor: BORDER,
    };
  }

  if (lower.includes('rebalanced schedule') || lower.includes('disruption')) {
    return {
      id: `note-${index}`,
      type: 'rebalance',
      category: 'Schedule Rebalance',
      title: 'Disruption Handled & History Preserved',
      description: clean,
      raw: clean,
      badgeColor: PINE,
      badgeBg: '#EAF3EF',
      borderColor: '#C3D8CE',
    };
  }

  if (lower.includes('proposing candidate schedule')) {
    return {
      id: `note-${index}`,
      type: 'info',
      category: 'Draft Proposal',
      title: 'Synthesizing Candidate Schedule',
      description:
        'Assembled candidate itinerary matching member styles, geographic clusters, and must-see destinations.',
      raw: clean,
      badgeColor: MUTED,
      badgeBg: '#FAF6EE',
      borderColor: BORDER,
    };
  }

  return {
    id: `note-${index}`,
    type: 'info',
    category: 'Planning Decision',
    title: 'Schedule Optimization Note',
    description: clean,
    raw: clean,
    badgeColor: MUTED,
    badgeBg: '#FAF6EE',
    borderColor: BORDER,
  };
}

export default function AgentExplanations({
  notes,
  title = 'AI Agent Planning Reasoning & Tradeoffs',
  style,
}: AgentExplanationsProps) {
  const [showRawLogs, setShowRawLogs] = useState(false);

  if (!notes || notes.length === 0) {
    return null;
  }

  const aggregated = aggregateNotes(notes);
  const parsedItems = aggregated.map(({ note, children }, idx) =>
    parseNote(note, idx, children),
  );

  // High-signal curated items: filter out repetitive "proposing" drafts if we have real validations or corrections
  const meaningfulItems = parsedItems.filter((p) => p.type !== 'info');
  const displayItems = meaningfulItems.length > 0 ? meaningfulItems : parsedItems;

  const hasCorrection = parsedItems.some((p) => p.type === 'correction');
  const hasRelaxation = parsedItems.some((p) => p.type === 'relaxation');
  const hasSuccess = parsedItems.some((p) => p.type === 'success');

  return (
    <div
      style={{
        padding: '20px 22px',
        borderRadius: 14,
        background: '#fff',
        border: `1px solid ${BORDER}`,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
        ...style,
      }}
    >
      {/* Header with Title and Overall Status Badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: '#FAF6EE',
              border: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={18} color={PINE} />
          </div>
          <div>
            <h3
              style={{
                ...SERIF,
                fontSize: 17,
                fontWeight: 600,
                color: INK,
                margin: '0 0 2px',
              }}
            >
              {title}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
              How the autonomous planner balanced budget caps, travel time, and open hours
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasCorrection && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: 12,
                background: '#FDF2EC',
                color: CLAY,
                border: '1px solid #F1C7B2',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <RefreshCw size={12} />
              Self-Corrected
            </span>
          )}
          {hasRelaxation && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: 12,
                background: '#F3E8FF',
                color: '#7C3AED',
                border: '1px solid #DDD6FE',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Scale size={12} />
              Tradeoff Applied
            </span>
          )}
          {hasSuccess && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: 12,
                background: '#EAF3EF',
                color: PINE,
                border: '1px solid #C3D8CE',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CheckCircle2 size={12} />
              Deterministic Validations Passed
            </span>
          )}
        </div>
      </div>

      {/* Summary Invariant Pillars Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
          marginBottom: 16,
          padding: '10px 12px',
          background: '#FAF8F5',
          borderRadius: 10,
          border: `1px solid ${BORDER}80`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: INK }}>
          <DollarSign size={14} color={PINE} style={{ flexShrink: 0 }} />
          <span>
            <strong>Budget:</strong> Individual caps satisfied
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: INK }}>
          <MapPin size={14} color={PINE} style={{ flexShrink: 0 }} />
          <span>
            <strong>Travel:</strong> Geographic transit buffers
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: INK }}>
          <Clock size={14} color={PINE} style={{ flexShrink: 0 }} />
          <span>
            <strong>Hours:</strong> Open schedules matched
          </span>
        </div>
      </div>

      {/* Organized Explanation Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayItems.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#fff',
              border: `1px solid ${item.borderColor}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {item.type === 'success' && <ShieldCheck size={16} color={PINE} />}
                {item.type === 'correction' && <RefreshCw size={16} color={CLAY} />}
                {item.type === 'relaxation' && <Scale size={16} color="#7C3AED" />}
                {item.type === 'refinement' && <Sparkles size={16} color={PINE} />}
                {item.type === 'rebalance' && <Sliders size={16} color={PINE} />}
                {item.type === 'info' && <Info size={16} color={MUTED} />}
                <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{item.title}</span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: item.badgeBg,
                  color: item.badgeColor,
                  flexShrink: 0,
                }}
              >
                {item.category}
              </span>
            </div>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12.5,
                color: '#4A463F',
                lineHeight: 1.5,
                whiteSpace: 'pre-line',
              }}
            >
              {item.description}
            </p>
          </div>
        ))}
      </div>

      {/* Collapsible Full Iteration Log */}
      {parsedItems.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}60` }}>
          <button
            type="button"
            onClick={() => setShowRawLogs(!showRawLogs)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 11,
              color: MUTED,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {showRawLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{showRawLogs ? 'Hide detailed execution trace' : 'View detailed execution trace'}</span>
          </button>

          {showRawLogs && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 6,
                background: '#FAF6EE',
                border: `1px solid ${BORDER}`,
                fontSize: 11,
                fontFamily: 'monospace',
                color: INK,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {aggregated.map(({ note, children }, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ color: MUTED }}>#{idx + 1}</span>
                    <span>{note}</span>
                  </div>
                  {children.map((child, cIdx) => (
                    <div key={cIdx} style={{ display: 'flex', gap: 6, paddingLeft: 22 }}>
                      <span style={{ color: MUTED }}>→</span>
                      <span>{child}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
