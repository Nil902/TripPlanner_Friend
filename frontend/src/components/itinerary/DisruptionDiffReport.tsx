import { GitBranch, Clock, Lock } from 'lucide-react';
import { CLAY, PINE, INK, MUTED } from '../../lib/constants';

interface DisruptionDiffReportProps {
  diff: {
    version: number;
    scenario: string;
    affectedWindow: string;
    unaffectedDays: string;
    substitution: string;
  } | null;
  onDismiss: () => void;
}

export default function DisruptionDiffReport({ diff, onDismiss }: DisruptionDiffReportProps) {
  if (!diff) return null;

  return (
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
          Dynamic Rebalance Version Diff (v{diff.version - 1} → v{diff.version})
        </strong>
      </div>
      <div style={{ fontSize: 13, color: INK, marginBottom: 8, lineHeight: 1.4 }}>
        <strong>{diff.scenario}:</strong> {diff.substitution}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={12} color={CLAY} /> {diff.affectedWindow}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Lock size={12} color={PINE} /> {diff.unaffectedDays}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          marginTop: 8,
          padding: '4px 8px',
          fontSize: 11,
          color: MUTED,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}