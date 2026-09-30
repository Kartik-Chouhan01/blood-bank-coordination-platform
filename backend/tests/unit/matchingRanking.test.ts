import { describe, expect, it } from 'vitest';
import type { BloodGroup } from '@bbms/shared';
import { rankUnits, scoreDonor } from '../../src/domain/matching/ranking.js';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
const unit = (unitCode: string, bloodGroup: BloodGroup, expiry: number) => ({
  unitCode,
  bloodGroup,
  expiryDate: day(expiry),
  collectedAt: day(0),
});

describe('rankUnits', () => {
  it('puts the identical group first, then substitutes with O− last, then earliest expiry', () => {
    const ranked = rankUnits(
      [
        unit('O-NEG', 'O-', 1),
        unit('A-LATE', 'A+', 30),
        unit('O-POS', 'O+', 2),
        unit('A-SOON', 'A+', 5),
        unit('A-NEG', 'A-', 3),
      ],
      'A+',
      'PRBC',
    );
    expect(ranked.map((u) => u.unitCode)).toEqual(['A-SOON', 'A-LATE', 'O-POS', 'A-NEG', 'O-NEG']);
  });

  it('does not mutate its input', () => {
    const units = [unit('B', 'A+', 9), unit('A', 'A+', 1)];
    rankUnits(units, 'A+', 'PRBC');
    expect(units.map((u) => u.unitCode)).toEqual(['B', 'A']);
  });
});

describe('scoreDonor', () => {
  const base = {
    exactGroup: true,
    bloodGroupConfirmed: true,
    distanceKm: 0,
    radiusKm: 25,
    daysSinceContactAllowed: 60,
    history: { positive: 1, answered: 1 },
  };

  it('scores a perfect candidate 100 and never goes below 0', () => {
    expect(scoreDonor(base)).toBe(100);
    expect(
      scoreDonor({
        ...base,
        exactGroup: false,
        bloodGroupConfirmed: false,
        distanceKm: 99,
        daysSinceContactAllowed: -5,
        history: { positive: 0, answered: 4 },
      }),
    ).toBeGreaterThanOrEqual(0);
  });

  it('prefers nearer, exact-group, confirmed donors', () => {
    expect(scoreDonor({ ...base, distanceKm: 20 })).toBeLessThan(scoreDonor(base));
    expect(scoreDonor({ ...base, exactGroup: false })).toBeLessThan(scoreDonor(base));
    expect(scoreDonor({ ...base, bloodGroupConfirmed: false })).toBeLessThan(scoreDonor(base));
  });

  it('treats no response history as neutral', () => {
    const none = scoreDonor({ ...base, history: { positive: 0, answered: 0 } });
    expect(none).toBeLessThan(scoreDonor(base));
    expect(none).toBeGreaterThan(scoreDonor({ ...base, history: { positive: 0, answered: 3 } }));
  });
});
