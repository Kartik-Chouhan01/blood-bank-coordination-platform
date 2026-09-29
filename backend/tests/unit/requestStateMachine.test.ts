import { describe, expect, it } from 'vitest';
import {
  REQUEST_TRANSITIONS,
  canTransition,
} from '../../src/domain/requests/requestStateMachine.js';

describe('request state machine', () => {
  it('lets only staff review a pending request, and the system auto-approve it', () => {
    expect(canTransition('PENDING', 'APPROVED', 'STAFF')).toBe(true);
    expect(canTransition('PENDING', 'APPROVED', 'SYSTEM')).toBe(true);
    expect(canTransition('PENDING', 'APPROVED', 'HOSPITAL')).toBe(false);
    expect(canTransition('PENDING', 'REJECTED', 'HOSPITAL')).toBe(false);
  });

  it('only reaches allocation states and FULFILLED through allocation', () => {
    for (const to of ['PARTIALLY_ALLOCATED', 'ALLOCATED', 'FULFILLED'] as const) {
      expect(
        REQUEST_TRANSITIONS.filter((r) => r.to === to).every((r) => r.by === 'ALLOCATION'),
      ).toBe(true);
    }
  });

  it('lets only the hospital confirm receipt', () => {
    expect(REQUEST_TRANSITIONS.filter((r) => r.to === 'COMPLETED').map((r) => r.by)).toEqual([
      'HOSPITAL',
    ]);
  });

  it('allows cancellation by hospital or staff until fulfilled, always with a reason', () => {
    for (const from of ['PENDING', 'APPROVED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'] as const) {
      expect(canTransition(from, 'CANCELLED', 'HOSPITAL')).toBe(true);
      expect(canTransition(from, 'CANCELLED', 'STAFF')).toBe(true);
    }
    expect(canTransition('FULFILLED', 'CANCELLED', 'HOSPITAL')).toBe(false);
    expect(
      REQUEST_TRANSITIONS.filter((r) => r.to === 'CANCELLED').every((r) => r.requiresReason),
    ).toBe(true);
  });

  it('never leaves a closed status', () => {
    for (const from of ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(REQUEST_TRANSITIONS.filter((r) => r.from === from)).toHaveLength(0);
    }
  });

  it('expires only through the system', () => {
    expect(
      REQUEST_TRANSITIONS.filter((r) => r.to === 'EXPIRED').every((r) => r.by === 'SYSTEM'),
    ).toBe(true);
  });
});
