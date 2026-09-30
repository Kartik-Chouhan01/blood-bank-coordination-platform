import type { BloodGroup, StockLevel } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';
import { dashboardApi } from '../api';

const STOCK_LEVEL_HELP: Record<StockLevel, string> = {
  LOW: 'Stock is low — donors of this group are especially needed.',
  MODERATE: 'Stock is moderate.',
  GOOD: 'Stock is currently good.',
};

/**
 * Coarse red-cell stock level per blood group (never exact counts). Renders nothing if the levels
 * cannot be loaded — it is context, not something a page depends on.
 */
export function PublicStockLevels({ highlight }: { highlight?: BloodGroup }) {
  const { data } = useApiQuery(() => dashboardApi.publicStats());
  if (!data) return null;
  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.stock.map((s) => (
          <li
            key={s.bloodGroup}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-200',
              highlight === s.bloodGroup && 'ring-2 ring-brand-600',
            )}
          >
            <span className="text-lg font-bold text-slate-900">
              {s.bloodGroup}
              {highlight === s.bloodGroup && <span className="sr-only"> (your group)</span>}
            </span>
            <StatusBadge kind="stockLevel" value={s.level} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Red-cell stock across participating blood banks, updated {formatDateTime(data.updatedAt)}.
        Levels only — exact counts are not published.
      </p>
    </div>
  );
}

/** The donor's own group, in one line (for the donor overview). */
export function OwnGroupStockLevel({ bloodGroup }: { bloodGroup: BloodGroup }) {
  const { data } = useApiQuery(() => dashboardApi.publicStats());
  const level = data?.stock.find((s) => s.bloodGroup === bloodGroup)?.level;
  if (!level) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
      <span>{bloodGroup} stock right now:</span>
      <StatusBadge kind="stockLevel" value={level} />
      <span className="text-slate-600">{STOCK_LEVEL_HELP[level]}</span>
    </div>
  );
}
