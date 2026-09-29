import { Clock, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime, formatRelative } from '@/utils/format';

/** Required-by time with a relative hint; overdue open requests are flagged in words. */
export function RequiredBy({
  iso,
  overdue,
  open = true,
}: {
  iso: string;
  overdue: boolean;
  open?: boolean;
}) {
  if (overdue) {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <Badge tone="critical" icon={<TriangleAlert className="size-3.5" aria-hidden />}>
          Overdue {formatRelative(iso).replace(/^in /, '')}
        </Badge>
        <span className="text-xs text-slate-500">{formatDateTime(iso)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col">
      <span className="text-slate-800">{formatDateTime(iso)}</span>
      {open && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Clock className="size-3" aria-hidden />
          {formatRelative(iso)}
        </span>
      )}
    </span>
  );
}
