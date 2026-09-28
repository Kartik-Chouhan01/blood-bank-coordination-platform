import { Hourglass, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/utils/format';

interface ExpiryBadgeProps {
  expiryDate: string;
  daysToExpiry: number;
  expiredByDate: boolean;
  /** Only meaningful for units still in inventory. */
  inInventory: boolean;
  warningDays?: number;
}

/** Expiry shown as text + icon + colour, never colour alone. */
export function ExpiryBadge({
  expiryDate,
  daysToExpiry,
  expiredByDate,
  inInventory,
  warningDays = 3,
}: ExpiryBadgeProps) {
  if (!inInventory) return <span className="text-slate-500">{formatDate(expiryDate)}</span>;
  if (expiredByDate) {
    return (
      <Badge tone="critical" icon={<Hourglass className="size-3.5" aria-hidden />}>
        Expired {formatDate(expiryDate)}
      </Badge>
    );
  }
  if (daysToExpiry <= warningDays) {
    return (
      <Badge tone="warning" icon={<TriangleAlert className="size-3.5" aria-hidden />}>
        {daysToExpiry === 0
          ? 'Expires today'
          : `${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'} left`}
      </Badge>
    );
  }
  return (
    <span className="text-slate-700">
      {formatDate(expiryDate)} <span className="text-xs text-slate-400">({daysToExpiry} days)</span>
    </span>
  );
}
