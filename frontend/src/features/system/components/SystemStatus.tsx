import { useApiQuery } from '@/hooks/useApiQuery';
import { cn } from '@/utils/cn';
import { fetchHealth } from '../api';

/** Small footer indicator; also a quick end-to-end check that frontend, API and database connect. */
export function SystemStatus() {
  const { data, error, isLoading } = useApiQuery(fetchHealth);

  const state = isLoading ? 'checking' : error || data?.status !== 'ok' ? 'down' : 'up';
  const label = {
    checking: 'Checking system status…',
    up: 'All systems operational',
    down: 'Service degraded',
  }[state];

  return (
    <p className="flex items-center gap-2 text-xs text-slate-400" role="status">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          state === 'up' && 'bg-emerald-400',
          state === 'down' && 'bg-amber-400',
          state === 'checking' && 'bg-slate-500',
        )}
      />
      {label}
    </p>
  );
}
