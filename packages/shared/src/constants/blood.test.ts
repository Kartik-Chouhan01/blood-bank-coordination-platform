import { describe, expect, it } from 'vitest';
import { BLOOD_GROUPS, isBloodGroup } from './blood.js';

describe('isBloodGroup', () => {
  it('accepts all eight ABO/Rh groups', () => {
    for (const group of BLOOD_GROUPS) expect(isBloodGroup(group)).toBe(true);
  });

  it.each(['A', 'O', 'ab+', 'Rh+', '', null, 42])('rejects %s', (value) => {
    expect(isBloodGroup(value)).toBe(false);
  });
});
