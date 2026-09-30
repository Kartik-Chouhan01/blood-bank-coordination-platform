import type { NotificationPriority, NotificationType } from '../constants/notifications.js';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  /** In-app path to open (e.g. the request); null when there is nothing to open. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadCount {
  unread: number;
  /** Unread CRITICAL notifications (emergencies), shown more prominently. */
  critical: number;
}
