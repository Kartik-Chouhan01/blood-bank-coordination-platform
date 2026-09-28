/** Physical blood unit lifecycle. Transitions are enforced by the backend state machine only. */
export const UNIT_STATUSES = [
  'COLLECTED',
  'UNDER_TESTING',
  'AVAILABLE',
  'RESERVED',
  'ISSUED',
  'RECEIVED',
  'EXPIRED',
  'DISCARDED',
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/** Laboratory outcome, tracked separately from where the unit is in its lifecycle. */
export const TESTING_STATUSES = ['PENDING', 'PASSED', 'FAILED'] as const;
export type TestingStatus = (typeof TESTING_STATUSES)[number];

export const REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'PARTIALLY_ALLOCATED',
  'ALLOCATED',
  'FULFILLED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Declared by the requesting hospital; drives administrative priority, not medical triage. */
export const URGENCY_LEVELS = ['EMERGENCY', 'URGENT', 'ROUTINE'] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const URGENCY_RANK: Record<Urgency, number> = { EMERGENCY: 0, URGENT: 1, ROUTINE: 2 };

export const ALLOCATION_STATUSES = ['RESERVED', 'ISSUED', 'RECEIVED', 'RELEASED'] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export const AVAILABILITY_STATUSES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'TEMPORARILY_UNAVAILABLE',
  'DO_NOT_CONTACT',
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const OUTREACH_STATUSES = [
  'NOTIFIED',
  'INTERESTED',
  'DECLINED',
  'NO_RESPONSE',
  'DONATED',
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
