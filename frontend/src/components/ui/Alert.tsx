import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/cn';

type AlertTone = 'info' | 'success' | 'warning' | 'error';

const STYLES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-900',
    icon: <Info className="size-4" aria-hidden />,
  },
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <CircleCheck className="size-4" aria-hidden />,
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: <TriangleAlert className="size-4" aria-hidden />,
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-900',
    icon: <CircleAlert className="size-4" aria-hidden />,
  },
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const { box, icon } = STYLES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', box, className)}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
