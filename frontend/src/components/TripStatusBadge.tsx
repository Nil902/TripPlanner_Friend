import type { TripLifecycleStatus } from '@shared/types';
import { TRIP_LIFECYCLE_LABELS } from '../lib/tripLifecycle';

const statusClasses: Record<TripLifecycleStatus, string> = {
  upcoming: 'border-[#F6DEC8] bg-[#FEF7ED] text-[#8E4726]',
  in_progress: 'border-[#D1DFCE] bg-[#EEF3ED] text-[#2B4C3F]',
  completed: 'border-[#DDD5C4] bg-[#F3EEE2] text-[#595347]',
};

export default function TripStatusBadge({ status }: { status: TripLifecycleStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {TRIP_LIFECYCLE_LABELS[status]}
    </span>
  );
}
