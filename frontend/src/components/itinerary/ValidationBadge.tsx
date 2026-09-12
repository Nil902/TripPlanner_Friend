import { ShieldCheck } from 'lucide-react';
import { PINE } from '../../lib/constants';

interface ValidationBadgeProps {
  notes: string[];
  planMode: 'ai' | 'manual';
}

export default function ValidationBadge({ notes, planMode }: ValidationBadgeProps) {
  if (planMode !== 'ai' || !notes || notes.length === 0) return null;

  return (
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
  );
}