import { Schema, model, type Types } from 'mongoose';
import {
  DELIVERY_STATUSES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TYPES,
  type DeliveryStatus,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationType,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import { baseSchemaOptions } from '../../utils/mongoose.js';

export interface Delivery {
  channel: NotificationChannel;
  status: DeliveryStatus;
  at: Date;
  /** Why a delivery was skipped or failed (never message content). */
  detail: string | null;
}

export interface Notification {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  link: string | null;
  entity: { type: string; id: Types.ObjectId } | null;
  readAt: Date | null;
  deliveries: Delivery[];
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<Notification>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 150 },
    message: { type: String, required: true, maxlength: 1000 },
    priority: { type: String, enum: NOTIFICATION_PRIORITIES, default: 'NORMAL' },
    link: { type: String, default: null, maxlength: 300 },
    entity: {
      type: { type: String },
      id: { type: Schema.Types.ObjectId },
    },
    readAt: { type: Date, default: null },
    deliveries: {
      type: [
        {
          channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
          status: { type: String, enum: DELIVERY_STATUSES, required: true },
          at: { type: Date, required: true },
          detail: { type: String, default: null },
          _id: false,
        },
      ],
      default: [],
    },
  },
  baseSchemaOptions<Notification>(),
);

// The recipient's list and unread badge.
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });
// Bounded growth: old notifications are removed by MongoDB itself.
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: env.NOTIFICATION_RETENTION_DAYS * 86_400 },
);

export const NotificationModel = model<Notification>('Notification', notificationSchema);
