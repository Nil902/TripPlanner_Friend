import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PrimaryButton } from '../Button';
import { PINE, BORDER, MUTED, INK } from '../../lib/constants';
import { api } from '../../lib/api';

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

interface RefinementAssistantProps {
  tripId: string;
  destination: string;
  planVersion: number;
  notes: string[];
  onRefined: (version: number, notes: string[], days: PlanDayItem[]) => void;
}

const QUICK_PROMPTS = [
  'Make Day 2 more relaxed',
  'Add a nightlife stop in the evening',
  'Swap lunch for seafood under $30',
  'Add a museum or gallery in the afternoon',
  'Include a scenic viewpoint at sunset',
  'Add local entertainment or live music',
];

export default function RefinementAssistant({
  tripId,
  planVersion,
  onRefined,
}: RefinementAssistantProps) {
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const handleRefine = async () => {
    if (!refineInstruction.trim() || isRefining) return;
    setIsRefining(true);
    try {
      const updated = await api.plan.refine(tripId, {
        instruction: refineInstruction.trim(),
      });
      if (updated) {
        onRefined(updated.version || planVersion + 1, updated.notes || [], updated.days || []);
      }
      setRefineInstruction('');
    } catch {
      // Error handled by parent
    } finally {
      setIsRefining(false);
    }
  };

  return (
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
          placeholder="e.g. 'Add a museum afternoon', 'Replace dinner with street food under $20', 'Add nightlife on Day 2'..."
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
        {QUICK_PROMPTS.map((prompt) => (
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
  );
}