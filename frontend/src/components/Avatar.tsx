import { PINE, MUTED, BORDER } from '../lib/constants';

interface AvatarProps {
  initials: string;
  submitted: boolean;
  size?: number;
}

export default function Avatar({ initials, submitted, size = 32 }: AvatarProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: submitted ? PINE : '#fff',
        color: submitted ? '#fff' : MUTED,
        border: submitted ? 'none' : `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600,
        flexShrink: 0,
      }}
      title={submitted ? 'Submitted' : 'Waiting'}
    >
      {initials}
    </div>
  );
}
