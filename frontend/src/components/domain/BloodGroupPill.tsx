import { BadgeCheck, CircleHelp } from 'lucide-react';
import type { BloodGroup } from '@bbms/shared';
import { cn } from '@/utils/cn';

interface BloodGroupPillProps {
  bloodGroup: BloodGroup;
  /** Omit to show the group alone; true/false adds a confirmed / self-declared indicator. */
  confirmed?: boolean;
  size?: 'sm' | 'lg';
}

export function BloodGroupPill({ bloodGroup, confirmed, size = 'sm' }: BloodGroupPillProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'rounded-md bg-brand-50 font-bold text-brand-800 ring-1 ring-brand-200 ring-inset',
          size === 'lg' ? 'px-3 py-1 text-2xl' : 'px-2 py-0.5 text-sm',
        )}
      >
        {bloodGroup}
      </span>
      {confirmed !== undefined &&
        (confirmed ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700">
            <BadgeCheck className="size-3.5" aria-hidden />
            Confirmed
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
            <CircleHelp className="size-3.5" aria-hidden />
            Self-declared
          </span>
        ))}
    </span>
  );
}
