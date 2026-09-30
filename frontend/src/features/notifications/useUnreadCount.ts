import { useCallback, useEffect, useState } from 'react';
import type { UnreadCount } from '@bbms/shared';
import { notificationsApi, onNotificationsChanged } from './api';

/** How often the badge refreshes while the tab is visible (there is no push channel yet). */
export const UNREAD_POLL_MS = 60_000;

/**
 * The unread badge: fetched on mount, every minute while the page is visible, when the tab becomes
 * visible again, and whenever notifications are marked read elsewhere in the app. Failures keep
 * the last known value; the badge is a hint, never a blocker.
 */
export function useUnreadCount() {
  const [count, setCount] = useState<UnreadCount>({ unread: 0, critical: 0 });

  const refresh = useCallback(() => {
    notificationsApi
      .unreadCount()
      .then(setCount)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, UNREAD_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = onNotificationsChanged(refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [refresh]);

  return { ...count, refresh };
}
