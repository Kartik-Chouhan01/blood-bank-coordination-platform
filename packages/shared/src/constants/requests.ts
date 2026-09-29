import type { RequestStatus } from './statuses.js';

/**
 * Administrative categories only — deliberately no diagnoses or patient details.
 */
export const REQUEST_REASON_CATEGORIES = [
  'SCHEDULED_PROCEDURE',
  'EMERGENCY_CARE',
  'MATERNITY',
  'ONGOING_TREATMENT',
  'STOCK_REPLENISHMENT',
  'OTHER',
] as const;
export type RequestReasonCategory = (typeof REQUEST_REASON_CATEGORIES)[number];

export const REQUEST_REASON_LABELS: Record<RequestReasonCategory, string> = {
  SCHEDULED_PROCEDURE: 'Scheduled procedure',
  EMERGENCY_CARE: 'Emergency care',
  MATERNITY: 'Maternity',
  ONGOING_TREATMENT: 'Ongoing treatment',
  STOCK_REPLENISHMENT: 'Hospital stock replenishment',
  OTHER: 'Other',
};

/** Requests still being worked on; everything else is closed. */
export const OPEN_REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'PARTIALLY_ALLOCATED',
  'ALLOCATED',
] as const satisfies readonly RequestStatus[];

export const CLOSED_REQUEST_STATUSES = [
  'FULFILLED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const satisfies readonly RequestStatus[];

export const MAX_UNITS_PER_REQUEST = 20;
export const MAX_REQUEST_LEAD_DAYS = 30;
