import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import type { NotificationView } from '@bbms/shared';
import { LoadingState } from '@/components/ui/States';
import { cn } from '@/utils/cn';
import { announceNotificationsChanged, notificationsApi } from '../api';
import { useUnreadCount } from '../useUnreadCount';
import { NotificationItem } from './NotificationItem';

const PREVIEW_SIZE = 8;

/** Header bell: unread badge (critical shown in red) and a dropdown of the latest notifications. */
export function NotificationBell() {
  const { unread, critical, refresh } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[]>();
  const [failed, setFailed] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    notificationsApi
      .list({ limit: PREVIEW_SIZE })
      .then((page) => !cancelled && setItems(page.items))
      .catch(() => !cancelled && setFailed(true));

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = (n: NotificationView) => {
    setOpen(false);
    if (!n.readAt) {
      void notificationsApi
        .markRead(n.id)
        .then(announceNotificationsChanged)
        .catch(() => undefined);
    }
  };

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((current) =>
        current?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      );
      announceNotificationsChanged();
    } catch {
      refresh();
    }
  };

  const label =
    unread === 0
      ? 'Notifications'
      : `Notifications, ${unread} unread${critical ? `, ${critical} critical` : ''}`;
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) {
            setItems(undefined);
            setFailed(false);
          }
          setOpen(!open);
        }}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-semibold text-white',
              critical ? 'bg-red-600' : 'bg-slate-700',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Latest notifications"
          className="fixed top-16 right-4 z-40 mt-1 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {failed ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Notifications could not be loaded.
              </p>
            ) : !items ? (
              <LoadingState />
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                You have no notifications.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationItem notification={n} onOpen={openItem} compact />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
