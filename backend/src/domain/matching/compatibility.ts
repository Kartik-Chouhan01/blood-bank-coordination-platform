import type { BloodGroup, ComponentType } from '@bbms/shared';

/**
 * Administrative ABO/Rh compatibility, evaluated PER COMPONENT. These tables are version-controlled
 * and tested on purpose — they are not admin-editable (a mistaken edit would silently produce
 * unsafe suggestions). Every result is an aid for qualified staff, never a transfusion decision.
 *
 *  - Red cells (PRBC): the recipient must not carry antibodies against the donor's cells:
 *    donor ABO antigens ⊆ recipient ABO antigens, and an Rh-negative recipient receives
 *    Rh-negative cells only. O− is the universal red-cell donor.
 *  - Plasma and cryoprecipitate: INVERTED — the donor's plasma antibodies must not react with the
 *    recipient's cells: donor ABO antigens ⊇ recipient ABO antigens. AB is the universal plasma
 *    donor. Rh is not considered (plasma contains no red cells).
 *  - Whole blood: contains both cells and plasma, so only the identical ABO/Rh group qualifies.
 *  - Platelets: conservative table — ABO plasma-compatible (as for plasma), and an Rh-negative
 *    recipient receives Rh-negative platelets only (platelet products carry residual red cells).
 */

type Abo = 'O' | 'A' | 'B' | 'AB';

const abo = (group: BloodGroup) => group.slice(0, -1) as Abo;
const rhPositive = (group: BloodGroup) => group.endsWith('+');

/** The ABO antigens present on red cells. */
const ANTIGENS: Record<Abo, readonly ('A' | 'B')[]> = {
  O: [],
  A: ['A'],
  B: ['B'],
  AB: ['A', 'B'],
};

const isSubset = (a: readonly string[], b: readonly string[]) => a.every((x) => b.includes(x));

function redCellCompatible(donor: BloodGroup, recipient: BloodGroup): boolean {
  if (!isSubset(ANTIGENS[abo(donor)], ANTIGENS[abo(recipient)])) return false;
  return rhPositive(recipient) || !rhPositive(donor);
}

function plasmaAboCompatible(donor: BloodGroup, recipient: BloodGroup): boolean {
  return isSubset(ANTIGENS[abo(recipient)], ANTIGENS[abo(donor)]);
}

export function isCompatible(
  donor: BloodGroup,
  recipient: BloodGroup,
  component: ComponentType,
): boolean {
  switch (component) {
    case 'WHOLE_BLOOD':
      return donor === recipient;
    case 'PRBC':
      return redCellCompatible(donor, recipient);
    case 'PLASMA':
    case 'CRYO':
      return plasmaAboCompatible(donor, recipient);
    case 'PLATELETS':
      return plasmaAboCompatible(donor, recipient) && (rhPositive(recipient) || !rhPositive(donor));
  }
}

/**
 * Order in which substitutes are offered after the identical group. Rh-negative and universal donor
 * groups come last so they are conserved for patients who have no alternative (O− for red cells,
 * AB for plasma).
 */
const SUBSTITUTE_ORDER: Record<ComponentType, readonly BloodGroup[]> = {
  WHOLE_BLOOD: [],
  PRBC: ['A+', 'B+', 'AB+', 'O+', 'A-', 'B-', 'AB-', 'O-'],
  PLATELETS: ['A+', 'B+', 'O+', 'A-', 'B-', 'O-', 'AB+', 'AB-'],
  PLASMA: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
  CRYO: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
};

/**
 * Donor groups whose `component` may be offered to a `recipient`, identical group first, then
 * substitutes with universal donor groups last.
 */
export function getCompatibleDonorGroups(
  recipient: BloodGroup,
  component: ComponentType,
): BloodGroup[] {
  const substitutes = SUBSTITUTE_ORDER[component].filter(
    (donor) => donor !== recipient && isCompatible(donor, recipient, component),
  );
  return [recipient, ...substitutes];
}

/**
 * Groups that can serve (almost) every recipient of a component. Conserving them means not
 * suggesting them while other suitable units exist.
 */
export const UNIVERSAL_DONOR_GROUPS: Record<ComponentType, readonly BloodGroup[]> = {
  WHOLE_BLOOD: [],
  PRBC: ['O-'],
  PLASMA: ['AB+', 'AB-'],
  CRYO: ['AB+', 'AB-'],
  PLATELETS: ['AB-'],
};

/**
 * Donor groups offered for a request under the substitution policy: every compatible group
 * (identical first), or only the identical group when substitution is switched off.
 */
export function offeredDonorGroups(
  recipient: BloodGroup,
  component: ComponentType,
  allowSubstitutes: boolean,
): BloodGroup[] {
  return allowSubstitutes ? getCompatibleDonorGroups(recipient, component) : [recipient];
}

/**
 * Suggested selection of `shortfall` units from a ranked list: when conserving, universal-donor
 * units are only suggested if the others cannot cover the shortfall.
 */
export function preselect<T extends { bloodGroup: BloodGroup }>(
  ranked: readonly T[],
  shortfall: number,
  recipient: BloodGroup,
  component: ComponentType,
  conserveUniversal: boolean,
): T[] {
  if (!conserveUniversal) return ranked.slice(0, shortfall);
  const universal = (unit: T) =>
    unit.bloodGroup !== recipient && UNIVERSAL_DONOR_GROUPS[component].includes(unit.bloodGroup);
  const ordinary = ranked.filter((u) => !universal(u));
  return [...ordinary, ...ranked.filter(universal)].slice(0, shortfall);
}

/** Position of a donor group in the preference order (lower is preferred); -1 if incompatible. */
export function substitutionRank(
  donor: BloodGroup,
  recipient: BloodGroup,
  component: ComponentType,
): number {
  return getCompatibleDonorGroups(recipient, component).indexOf(donor);
}
