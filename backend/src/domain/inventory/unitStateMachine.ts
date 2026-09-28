import type { UnitStatus } from '@bbms/shared';

/**
 * Who may trigger a transition:
 *  - STAFF: manual action by blood-bank staff/admin through the transitions endpoint
 *  - TESTING: only as the outcome of recording a donation's test result
 *  - ALLOCATION: only through the reservation/issue workflow (Phase 7)
 *  - SYSTEM: only background jobs (expiry)
 *  - OVERRIDE: administrators correcting a record, always with a reason and audited
 */
export type TransitionActor = 'STAFF' | 'TESTING' | 'ALLOCATION' | 'SYSTEM' | 'OVERRIDE';

export interface TransitionRule {
  from: UnitStatus;
  to: UnitStatus;
  by: TransitionActor;
  requiresReason: boolean;
  label: string;
}

const EXPIRABLE: UnitStatus[] = ['COLLECTED', 'UNDER_TESTING', 'AVAILABLE', 'RESERVED'];

/**
 * The complete blood-unit lifecycle. Anything not listed here is impossible.
 * Note that no rule lets anyone — including an override — reach AVAILABLE except a passed
 * test result, or reach RESERVED/ISSUED except the allocation workflow.
 */
export const UNIT_TRANSITIONS: readonly TransitionRule[] = [
  {
    from: 'COLLECTED',
    to: 'UNDER_TESTING',
    by: 'STAFF',
    requiresReason: false,
    label: 'Send to testing',
  },
  { from: 'COLLECTED', to: 'DISCARDED', by: 'STAFF', requiresReason: true, label: 'Discard' },
  {
    from: 'UNDER_TESTING',
    to: 'AVAILABLE',
    by: 'TESTING',
    requiresReason: false,
    label: 'Release to inventory',
  },
  {
    from: 'UNDER_TESTING',
    to: 'DISCARDED',
    by: 'TESTING',
    requiresReason: true,
    label: 'Discard (failed testing)',
  },
  { from: 'UNDER_TESTING', to: 'DISCARDED', by: 'STAFF', requiresReason: true, label: 'Discard' },
  { from: 'AVAILABLE', to: 'DISCARDED', by: 'STAFF', requiresReason: true, label: 'Discard' },
  { from: 'AVAILABLE', to: 'RESERVED', by: 'ALLOCATION', requiresReason: false, label: 'Reserve' },
  {
    from: 'RESERVED',
    to: 'AVAILABLE',
    by: 'ALLOCATION',
    requiresReason: true,
    label: 'Release reservation',
  },
  { from: 'RESERVED', to: 'ISSUED', by: 'ALLOCATION', requiresReason: false, label: 'Issue' },
  {
    from: 'ISSUED',
    to: 'RECEIVED',
    by: 'ALLOCATION',
    requiresReason: false,
    label: 'Confirm receipt',
  },
  ...EXPIRABLE.map((from): TransitionRule => ({
    from,
    to: 'EXPIRED',
    by: 'SYSTEM',
    requiresReason: false,
    label: 'Expire',
  })),
  { from: 'EXPIRED', to: 'DISCARDED', by: 'STAFF', requiresReason: true, label: 'Record disposal' },
  {
    from: 'DISCARDED',
    to: 'UNDER_TESTING',
    by: 'OVERRIDE',
    requiresReason: true,
    label: 'Return to testing (discarded in error)',
  },
];

export function findTransition(
  from: UnitStatus,
  to: UnitStatus,
  by: TransitionActor,
): TransitionRule | undefined {
  return UNIT_TRANSITIONS.find((rule) => rule.from === from && rule.to === to && rule.by === by);
}

/** Transitions available to a person from the current status (for the UI's action menu). */
export function manualTransitionsFrom(status: UnitStatus, canOverride: boolean): TransitionRule[] {
  return UNIT_TRANSITIONS.filter(
    (rule) =>
      rule.from === status && (rule.by === 'STAFF' || (canOverride && rule.by === 'OVERRIDE')),
  );
}
