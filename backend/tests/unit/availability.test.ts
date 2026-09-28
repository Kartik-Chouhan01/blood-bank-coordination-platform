import { describe, expect, it } from 'vitest';
import {
  earliestContactDate,
  effectiveAvailability,
} from '../../src/domain/donors/availability.js';

const now = new Date('2026-06-01T12:00:00Z');

describe('effectiveAvailability', () => {
  it('returns to AVAILABLE once the return date has passed', () => {
    expect(effectiveAvailability('TEMPORARILY_UNAVAILABLE', new Date('2026-05-31'), now)).toBe(
      'AVAILABLE',
    );
  });

  it('stays temporarily unavailable before the return date', () => {
    expect(effectiveAvailability('TEMPORARILY_UNAVAILABLE', new Date('2026-06-10'), now)).toBe(
      'TEMPORARILY_UNAVAILABLE',
    );
  });

  it.each(['AVAILABLE', 'UNAVAILABLE', 'DO_NOT_CONTACT'] as const)(
    'leaves %s unchanged',
    (status) => {
      expect(effectiveAvailability(status, new Date('2020-01-01'), now)).toBe(status);
    },
  );
});

describe('earliestContactDate', () => {
  it('adds the configured interval to the last donation', () => {
    expect(earliestContactDate(new Date('2026-01-01T00:00:00Z'), 90)?.toISOString()).toBe(
      '2026-04-01T00:00:00.000Z',
    );
  });

  it('is null for donors with no recorded donation', () => {
    expect(earliestContactDate(null, 90)).toBeNull();
  });
});
