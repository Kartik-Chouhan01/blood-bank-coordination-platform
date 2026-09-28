import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type BadgeTone =
  'critical' | 'warning' | 'info' | 'success' | 'reserved' | 'neutral' | 'muted';

const TONES: Record<BadgeTone, string> = {
  critical: 'bg-red-50 text-red-800 ring-red-600/30',
  warning: 'bg-amber-50 text-amber-900 ring-amber-600/30',
  info: 'bg-sky-50 text-sky-800 ring-sky-600/30',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-600/30',
  reserved: 'bg-violet-50 text-violet-800 ring-violet-600/30',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-500/30',
  muted: 'bg-slate-50 text-slate-500 ring-slate-400/30 line-through decoration-slate-400/60',
};

interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
