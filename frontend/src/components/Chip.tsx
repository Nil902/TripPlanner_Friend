import { PINE, BORDER, INK } from '../lib/constants';

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: string;
}

export default function Chip({ label, active, onClick, accent }: ChipProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 20,
        border: `1px solid ${active ? (accent ?? PINE) : BORDER}`,
        background: active ? (accent ?? PINE) : 'transparent',
        color: active ? '#fff' : INK,
        fontSize: 14,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  );
}
