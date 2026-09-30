import { Types } from 'mongoose';
import type {
  ListNotificationsQuery,
  NotificationPriority,
  NotificationType,
  NotificationView,
  UnreadCount,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { sendMail } from '../../infrastructure/mail/mailer.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { buildPaginationMeta, pageToSkip } from '../../utils/pagination.js';
import { NotificationModel, type Delivery, type Notification } from './notification.model.js';

export interface Recipient {
  userId: Types.ObjectId;
  name: string;
  email: string;
  emailVerified: boolean;
  /** Channels this recipient should get for this notification. */
  inApp: boolean;
  byEmail: boolean;
}

export interface NotificationContent {
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  link?: string | null;
  entity?: { type: string; id: Types.ObjectId } | null;
}

const delivery = (
  channel: Delivery['channel'],
  status: Delivery['status'],
  detail: string | null = null,
): Delivery => ({ channel, status, at: new Date(), detail });

function emailText(recipient: Recipient, content: NotificationContent) {
  return (
    `Hi ${recipient.name},\n\n${content.message}\n\n` +
    (content.link ? `Open: ${env.APP_URL}${content.link}\n\n` : '') +
    'You receive this because of your role on the blood coordination platform.'
  );
}

/**
 * Delivers one notification to each recipient on the channels they should get. In-app
 * notifications are stored first; emails follow, and every channel's outcome is recorded.
 *
 * Call this only AFTER the change it describes has committed, so a rolled-back action is never
 * announced. It never throws: a delivery problem must not fail the action that triggered it.
 */
export async function deliver(recipients: Recipient[], content: NotificationContent) {
  const unique = [...new Map(recipients.map((r) => [r.userId.toString(), r])).values()];
  try {
    await Promise.all(
      unique.map(async (recipient) => {
        let stored: Types.ObjectId | null = null;
        if (recipient.inApp) {
          const [doc] = await NotificationModel.create([
            {
              recipientId: recipient.userId,
              type: content.type,
              title: content.title,
              message: content.message,
              priority: content.priority ?? 'NORMAL',
              link: content.link ?? null,
              entity: content.entity ?? null,
              deliveries: [delivery('IN_APP', 'SENT')],
            },
          ]);
          stored = doc!._id;
        }
        if (!recipient.byEmail) return;

        // Unverified addresses may belong to someone else; never send them account activity.
        const outcome = !recipient.emailVerified
          ? delivery('EMAIL', 'SKIPPED', 'Email address not verified')
          : (await sendMail({
                to: recipient.email,
                subject: content.title,
                text: emailText(recipient, content),
                template: `NOTIFY_${content.type}`,
              }))
            ? delivery('EMAIL', 'SENT')
            : delivery('EMAIL', 'FAILED', 'Transport error');
        if (stored) {
          await NotificationModel.updateOne({ _id: stored }, { $push: { deliveries: outcome } });
        }
      }),
    );
  } catch (err) {
    logger.error({ err, type: content.type }, 'Failed to deliver notification');
  }
}

// ─── The recipient's own notifications ───────────────────────────────────────

function toView(n: Notification): NotificationView {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listOwn(actor: Actor, query: ListNotificationsQuery) {
  const filter = { recipientId: actor.userId, ...(query.unread && { readAt: null }) };
  const [items, total] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(pageToSkip(query))
      .limit(query.limit)
      .lean(),
    NotificationModel.countDocuments(filter),
  ]);
  return { items: items.map(toView), meta: buildPaginationMeta(query, total) };
}

export async function unreadCount(actor: Actor): Promise<UnreadCount> {
  const unread = { recipientId: actor.userId, readAt: null };
  const [all, critical] = await Promise.all([
    NotificationModel.countDocuments(unread),
    NotificationModel.countDocuments({ ...unread, priority: 'CRITICAL' }),
  ]);
  return { unread: all, critical };
}

/** Another user's notification is reported as not found. Marking twice is harmless. */
export async function markRead(actor: Actor, id: string) {
  const filter = { _id: new Types.ObjectId(id), recipientId: actor.userId };
  // Only the first read sets the time.
  await NotificationModel.updateOne({ ...filter, readAt: null }, { $set: { readAt: new Date() } });
  const found = await NotificationModel.findOne(filter).lean();
  if (!found) throw AppError.notFound('Notification');
  return toView(found);
}

export async function markAllRead(actor: Actor) {
  const { modifiedCount } = await NotificationModel.updateMany(
    { recipientId: actor.userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { marked: modifiedCount };
}
