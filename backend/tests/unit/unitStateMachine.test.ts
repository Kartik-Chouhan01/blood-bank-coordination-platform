import { describe, expect, it } from 'vitest';
import { UNIT_STATUSES } from '@bbms/shared';
import {
  UNIT_TRANSITIONS,
  findTransition,
  manualTransitionsFrom,
} from '../../src/domain/inventory/unitStateMachine.js';
import {
  computeExpiryDate,
  daysToExpiry,
  isExpiredByDate,
} from '../../src/domain/inventory/expiry.js';

describe('blood unit state machine', () => {
  it('only reaches AVAILABLE through a passed test result', () => {
    const intoAvailable = UNIT_TRANSITIONS.filter((rule) => rule.to === 'AVAILABLE');
    expect(intoAvailable.map((r) => `${r.from}:${r.by}`).sort()).toEqual([
      'RESERVED:ALLOCATION',
      'UNDER_TESTING:TESTING',
    ]);
  });

  it('only reaches RESERVED, ISSUED and RECEIVED through allocation', () => {
    for (const to of ['RESERVED', 'ISSUED', 'RECEIVED'] as const) {
      expect(UNIT_TRANSITIONS.filter((r) => r.to === to).every((r) => r.by === 'ALLOCATION')).toBe(
        true,
      );
    }
  });

  it('lets only the system expire units, from any in-inventory status', () => {
    const expiring = UNIT_TRANSITIONS.filter((r) => r.to === 'EXPIRED');
    expect(expiring.every((r) => r.by === 'SYSTEM')).toBe(true);
    expect(expiring.map((r) => r.from).sort()).toEqual([
      'AVAILABLE',
      'COLLECTED',
      'RESERVED',
      'UNDER_TESTING',
    ]);
  });

  it('requires a reason for every discard and every override', () => {
    for (const rule of UNIT_TRANSITIONS) {
      if (rule.to === 'DISCARDED' || rule.by === 'OVERRIDE') expect(rule.requiresReason).toBe(true);
    }
  });

  it('has no way out of RECEIVED, and only an admin override out of DISCARDED', () => {
    expect(UNIT_TRANSITIONS.filter((r) => r.from === 'RECEIVED')).toHaveLength(0);
    expect(
      UNIT_TRANSITIONS.filter((r) => r.from === 'DISCARDED').every((r) => r.by === 'OVERRIDE'),
    ).toBe(true);
  });

  it('rejects transitions that are not in the table', () => {
    expect(findTransition('COLLECTED', 'AVAILABLE', 'STAFF')).toBeUndefined();
    expect(findTransition('EXPIRED', 'AVAILABLE', 'OVERRIDE')).toBeUndefined();
    expect(findTransition('AVAILABLE', 'EXPIRED', 'STAFF')).toBeUndefined();
  });

  it('offers staff actions per status, and the override only to admins', () => {
    expect(
      manualTransitionsFrom('COLLECTED', false)
        .map((r) => r.to)
        .sort(),
    ).toEqual(['DISCARDED', 'UNDER_TESTING']);
    expect(manualTransitionsFrom('DISCARDED', false)).toHaveLength(0);
    expect(manualTransitionsFrom('DISCARDED', true).map((r) => r.to)).toEqual(['UNDER_TESTING']);
    expect(manualTransitionsFrom('RESERVED', true)).toHaveLength(0);
  });

  it('only uses known statuses', () => {
    for (const rule of UNIT_TRANSITIONS) {
      expect(UNIT_STATUSES).toContain(rule.from);
      expect(UNIT_STATUSES).toContain(rule.to);
    }
  });
});

describe('expiry helpers', () => {
  const shelf = { WHOLE_BLOOD: 35, PRBC: 42, PLASMA: 365, PLATELETS: 5, CRYO: 365 };

  it('computes expiry from collection time and component shelf life', () => {
    const collected = new Date('2026-01-01T08:00:00Z');
    expect(computeExpiryDate(collected, 'PLATELETS', shelf).toISOString()).toBe(
      '2026-01-06T08:00:00.000Z',
    );
    expect(computeExpiryDate(collected, 'PRBC', shelf).toISOString()).toBe(
      '2026-02-12T08:00:00.000Z',
    );
  });

  it('reports days to expiry and expiry by date', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(daysToExpiry(new Date('2026-01-04T12:00:00Z'), now)).toBe(3);
    expect(isExpiredByDate(new Date('2026-01-01T00:00:00Z'), now)).toBe(true);
    expect(isExpiredByDate(new Date('2026-01-01T00:00:01Z'), now)).toBe(false);
  });
});
