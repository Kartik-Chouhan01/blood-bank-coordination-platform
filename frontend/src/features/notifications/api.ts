import type { ListNotificationsQuery, NotificationView, UnreadCount } from '@bbms/shared';
import { apiGet, apiGetPage, apiPost } from '@/services/httpClient';

export const notificationsApi = {
  list: (query: Partial<ListNotificationsQuery>) =>
    apiGetPage<NotificationView>('/notifications', query),
  unreadCount: () => apiGet<UnreadCount>('/notifications/unread-count'),
  markRead: (id: string) => apiPost<NotificationView>(`/notifications/${id}/read`),
  markAllRead: () => apiPost<{ marked: number }>('/notifications/read-all'),
};

/** Lets the bell and the notifications page stay in step after either marks something read. */
const CHANGED = 'bbms:notifications-changed';
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(CHANGED));
export function onNotificationsChanged(listener: () => void) {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
