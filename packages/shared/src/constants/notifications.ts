/** Every kind of notification the platform sends. */
export const NOTIFICATION_TYPES = [
  // Hospitals
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'REQUEST_CANCELLED_BY_STAFF',
  'REQUEST_EXPIRED',
  'UNITS_RESERVED',
  'UNITS_ISSUED',
  'HOSPITAL_VERIFICATION',
  // Blood-bank staff and administrators
  'URGENT_REQUEST',
  'REQUEST_CANCELLED_BY_HOSPITAL',
  'RESERVATION_RELEASED',
  'DONOR_INTERESTED',
  // Donors
  'DONOR_OUTREACH',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** CRITICAL is reserved for emergencies. */
export const NOTIFICATION_PRIORITIES = ['NORMAL', 'HIGH', 'CRITICAL'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const DELIVERY_STATUSES = ['SENT', 'SKIPPED', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
