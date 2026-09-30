import { describe, expect, it } from 'vitest';
import { BLOOD_GROUPS, COMPONENT_TYPES, type BloodGroup, type ComponentType } from '@bbms/shared';
import { getCompatibleDonorGroups, isCompatible } from '../../src/domain/matching/compatibility.js';

const donorsFor = (recipient: BloodGroup, component: ComponentType) =>
  BLOOD_GROUPS.filter((donor) => isCompatible(donor, recipient, component)).sort();

describe('red-cell compatibility (PRBC)', () => {
  it.each([
    ['O-', ['O-']],
    ['O+', ['O+', 'O-']],
    ['A-', ['A-', 'O-']],
    ['A+', ['A+', 'A-', 'O+', 'O-']],
    ['B-', ['B-', 'O-']],
    ['B+', ['B+', 'B-', 'O+', 'O-']],
    ['AB-', ['A-', 'AB-', 'B-', 'O-']],
    ['AB+', [...BLOOD_GROUPS]],
  ] as const)('%s may receive red cells from %j', (recipient, donors) => {
    expect(donorsFor(recipient, 'PRBC')).toEqual([...donors].sort());
  });

  it('never gives Rh-positive red cells to an Rh-negative recipient', () => {
    for (const recipient of BLOOD_GROUPS.filter((g) => g.endsWith('-'))) {
      for (const donor of BLOOD_GROUPS.filter((g) => g.endsWith('+'))) {
        expect(isCompatible(donor, recipient, 'PRBC')).toBe(false);
      }
    }
  });
});

describe('plasma compatibility is inverted', () => {
  it.each([
    ['O+', [...BLOOD_GROUPS]],
    ['A-', ['A+', 'A-', 'AB+', 'AB-']],
    ['B+', ['AB+', 'AB-', 'B+', 'B-']],
    ['AB-', ['AB+', 'AB-']],
  ] as const)('%s may receive plasma from %j', (recipient, donors) => {
    expect(donorsFor(recipient, 'PLASMA')).toEqual([...donors].sort());
  });

  it('AB is the universal plasma donor, and O plasma only suits O recipients', () => {
    for (const recipient of BLOOD_GROUPS) {
      expect(isCompatible('AB-', recipient, 'PLASMA')).toBe(true);
      expect(isCompatible('O-', recipient, 'PLASMA')).toBe(recipient.startsWith('O'));
    }
  });

  it('gives the opposite answer to red cells between A and O', () => {
    expect(isCompatible('O+', 'A+', 'PRBC')).toBe(true);
    expect(isCompatible('O+', 'A+', 'PLASMA')).toBe(false);
    expect(isCompatible('A+', 'O+', 'PLASMA')).toBe(true);
    expect(isCompatible('A+', 'O+', 'PRBC')).toBe(false);
  });

  it('treats cryoprecipitate like plasma', () => {
    for (const recipient of BLOOD_GROUPS) {
      expect(donorsFor(recipient, 'CRYO')).toEqual(donorsFor(recipient, 'PLASMA'));
    }
  });
});

describe('whole blood and platelets', () => {
  it('accepts only the identical group for whole blood', () => {
    for (const recipient of BLOOD_GROUPS) {
      expect(donorsFor(recipient, 'WHOLE_BLOOD')).toEqual([recipient]);
    }
  });

  it('uses plasma ABO rules for platelets but keeps Rh-negative recipients on Rh-negative', () => {
    expect(donorsFor('O-', 'PLATELETS')).toEqual(['A-', 'AB-', 'B-', 'O-']);
    expect(donorsFor('A+', 'PLATELETS')).toEqual(['A+', 'A-', 'AB+', 'AB-']);
    expect(isCompatible('AB+', 'AB-', 'PLATELETS')).toBe(false);
  });
});

describe('getCompatibleDonorGroups', () => {
  it('lists the identical group first and exactly the compatible groups', () => {
    for (const component of COMPONENT_TYPES) {
      for (const recipient of BLOOD_GROUPS) {
        const groups = getCompatibleDonorGroups(recipient, component);
        expect(groups[0]).toBe(recipient);
        expect(new Set(groups).size).toBe(groups.length);
        expect([...groups].sort()).toEqual(donorsFor(recipient, component));
      }
    }
  });

  it('offers Rh-negative and universal donor groups last to conserve them', () => {
    expect(getCompatibleDonorGroups('AB+', 'PRBC').at(-1)).toBe('O-');
    expect(getCompatibleDonorGroups('A+', 'PRBC')).toEqual(['A+', 'O+', 'A-', 'O-']);
    expect(getCompatibleDonorGroups('O+', 'PLASMA').slice(-2)).toEqual(['AB+', 'AB-']);
  });
});
