import { describe, expect, it } from 'vitest';
import { niceScale } from './chartTheme';

describe('niceScale', () => {
  it.each([
    [0, 4, [0, 1, 2, 3, 4]],
    [3, 3, [0, 1, 2, 3]],
    [7, 8, [0, 2, 4, 6, 8]],
    [22, 25, [0, 5, 10, 15, 20, 25]],
    [30, 30, [0, 10, 20, 30]],
    [140, 150, [0, 50, 100, 150]],
  ])('covers %d with round ticks up to %d', (value, max, ticks) => {
    expect(niceScale(value)).toEqual({ max, ticks });
  });

  it('never uses fractional steps for counts', () => {
    for (let v = 1; v <= 60; v += 1) {
      const { ticks, max } = niceScale(v);
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(max).toBeGreaterThanOrEqual(v);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });
});
