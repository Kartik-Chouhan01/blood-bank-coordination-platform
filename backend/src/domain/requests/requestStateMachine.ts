import type { RequestStatus } from '@bbms/shared';

/**
 * Who may trigger a request transition:
 *  - HOSPITAL: the requesting hospital (cancel)
 *  - STAFF: blood-bank staff/admin (review, cancel)
 *  - ALLOCATION: the allocation workflow as units are reserved/released/issued (Phase 7)
 *  - SYSTEM: automatic steps (emergency auto-approval, expiry)
 */
export type RequestActor = 'HOSPITAL' | 'STAFF' | 'ALLOCATION' | 'SYSTEM';

interface RequestRule {
  from: RequestStatus;
  to: RequestStatus;
  by: RequestActor;
  requiresReason: boolean;
}

const CANCELLABLE: RequestStatus[] = ['PENDING', 'APPROVED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'];
/** Expiry applies only while nothing has been issued (the service also checks unitsIssued). */
const EXPIRABLE: RequestStatus[] = ['PENDING', 'APPROVED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'];

export const REQUEST_TRANSITIONS: readonly RequestRule[] = [
  { from: 'PENDING', to: 'APPROVED', by: 'STAFF', requiresReason: false },
  { from: 'PENDING', to: 'APPROVED', by: 'SYSTEM', requiresReason: true },
  { from: 'PENDING', to: 'REJECTED', by: 'STAFF', requiresReason: true },

  { from: 'APPROVED', to: 'PARTIALLY_ALLOCATED', by: 'ALLOCATION', requiresReason: false },
  { from: 'APPROVED', to: 'ALLOCATED', by: 'ALLOCATION', requiresReason: false },
  { from: 'PARTIALLY_ALLOCATED', to: 'ALLOCATED', by: 'ALLOCATION', requiresReason: false },
  { from: 'PARTIALLY_ALLOCATED', to: 'APPROVED', by: 'ALLOCATION', requiresReason: true },
  { from: 'ALLOCATED', to: 'PARTIALLY_ALLOCATED', by: 'ALLOCATION', requiresReason: true },
  { from: 'ALLOCATED', to: 'FULFILLED', by: 'ALLOCATION', requiresReason: false },
  { from: 'FULFILLED', to: 'COMPLETED', by: 'HOSPITAL', requiresReason: false },

  ...CANCELLABLE.flatMap((from): RequestRule[] => [
    { from, to: 'CANCELLED', by: 'HOSPITAL', requiresReason: true },
    { from, to: 'CANCELLED', by: 'STAFF', requiresReason: true },
  ]),
  ...EXPIRABLE.map((from): RequestRule => ({
    from,
    to: 'EXPIRED',
    by: 'SYSTEM',
    requiresReason: true,
  })),
];

export function findRequestTransition(
  from: RequestStatus,
  to: RequestStatus,
  by: RequestActor,
): RequestRule | undefined {
  return REQUEST_TRANSITIONS.find((rule) => rule.from === from && rule.to === to && rule.by === by);
}

export function canTransition(from: RequestStatus, to: RequestStatus, by: RequestActor): boolean {
  return !!findRequestTransition(from, to, by);
}
