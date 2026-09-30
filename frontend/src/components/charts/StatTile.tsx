import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Context under the value (what it counts, the comparison, a caveat). */
  hint?: ReactNode;
  /** Optional status badge (icon + label) when the value needs attention. */
  status?: ReactNode;
}

/** A single headline number. The number is the chart. */
export function StatTile({ label, value, hint, status }: StatTileProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-600">{label}</p>
        {status}
      </div>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
