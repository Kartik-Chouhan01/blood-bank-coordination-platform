import { describe, expect, it } from 'vitest';
import {
  bucketFor,
  bucketKey,
  bucketKeys,
  localDate,
  median,
  rate,
  stockLevel,
} from '../../src/domain/analytics/analytics.js';

describe('buckets', () => {
  it('chooses the bucket size from the period length', () => {
    expect([7, 30, 90, 365].map(bucketFor)).toEqual(['day', 'day', 'week', 'month']);
  });

  it('uses the local calendar date of the platform time zone', () => {
    // 20:00 UTC on 30 Sep is already 1 Oct in India (UTC+5:30).
    const instant = new Date('2026-09-30T20:00:00Z');
    expect(localDate(instant, 'UTC')).toBe('2026-09-30');
    expect(localDate(instant, 'Asia/Kolkata')).toBe('2026-10-01');
  });

  it('maps dates to their day, Monday or first of month', () => {
    expect(bucketKey('2026-10-01', 'day')).toBe('2026-10-01'); // a Thursday
    expect(bucketKey('2026-10-01', 'week')).toBe('2026-09-28');
    expect(bucketKey('2026-09-28', 'week')).toBe('2026-09-28');
    expect(bucketKey('2026-10-04', 'week')).toBe('2026-09-28'); // Sunday
    expect(bucketKey('2026-10-17', 'month')).toBe('2026-10-01');
  });

  it('lists every bucket in the range, including empty ones', () => {
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-07T12:00:00Z');
    expect(bucketKeys(from, to, 'day', 'UTC')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ]);
    expect(bucketKeys(from, new Date('2026-11-15T00:00:00Z'), 'month', 'UTC')).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
  });
});

describe('statistics', () => {
  it('computes medians and rates', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(rate(1, 3)).toBe(0.333);
    expect(rate(1, 0)).toBeNull();
  });

  it('turns unit counts into coarse levels', () => {
    expect(stockLevel(0, 5, 15)).toBe('LOW');
    expect(stockLevel(4, 5, 15)).toBe('LOW');
    expect(stockLevel(5, 5, 15)).toBe('MODERATE');
    expect(stockLevel(15, 5, 15)).toBe('GOOD');
  });
});
