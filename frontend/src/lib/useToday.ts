import { useEffect, useState } from 'react';
import { getUtcDate } from './tripLifecycle';

/** Update at UTC midnight and when returning to a previously suspended tab. */
export function useToday(): string {
  const [today, setToday] = useState(getUtcDate);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setToday(getUtcDate(now));
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    };

    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return today;
}
