import { Link } from 'react-router';
import { Bell, CircleAlert, Siren } from 'lucide-react';
import type { NotificationView } from '@bbms/shared';
import { cn } from '@/utils/cn';
import { formatDateTime, formatRelative } from '@/utils/format';

const PRIORITY_ICON = {
  CRITICAL: <Siren className="size-4 text-red-700" aria-hidden />,
  HIGH: <CircleAlert className="size-4 text-amber-700" aria-hidden />,
  NORMAL: <Bell className="size-4 text-slate-400" aria-hidden />,
};

interface NotificationItemProps {
  notification: NotificationView;
  /** Called when the item is opened (to mark it read). */
  onOpen: (notification: NotificationView) => void;
  compact?: boolean;
}

/** One notification. Unread items are bold with a labelled dot; priority is an icon, not colour alone. */
export function NotificationItem({ notification: n, onOpen, compact }: NotificationItemProps) {
  const unread = !n.readAt;
  const body = (
    <>
      <span className="mt-0.5 shrink-0">{PRIORITY_ICON[n.priority]}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span
            className={cn('text-sm', unread ? 'font-semibold text-slate-900' : 'text-slate-700')}
          >
            {n.priority === 'CRITICAL' && <span className="sr-only">Critical: </span>}
            {n.title}
          </span>
          {unread && (
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" title="Unread">
              <span className="sr-only">Unread</span>
            </span>
          )}
        </span>
        <span className={cn('mt-0.5 block text-sm text-slate-600', compact && 'line-clamp-2')}>
          {n.message}
        </span>
        <time
          dateTime={n.createdAt}
          title={formatDateTime(n.createdAt)}
          className="mt-1 block text-xs text-slate-400"
        >
          {formatRelative(n.createdAt)}
        </time>
      </span>
    </>
  );
  const className = cn(
    'flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50',
    n.priority === 'CRITICAL' && unread && 'bg-red-50/60',
  );
  return n.link ? (
    <Link to={n.link} className={className} onClick={() => onOpen(n)}>
      {body}
    </Link>
  ) : (
    <button type="button" className={className} onClick={() => onOpen(n)}>
      {body}
    </button>
  );
}
