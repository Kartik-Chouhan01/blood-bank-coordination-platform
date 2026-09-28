import type { ComponentType } from './blood.js';
import type { UnitStatus } from './statuses.js';

export const DONATION_TYPES = ['WHOLE_BLOOD', 'APHERESIS'] as const;
export type DonationType = (typeof DONATION_TYPES)[number];

/**
 * Default shelf life per component, in days from collection. These are common reference values
 * only; each deployment configures its own (SHELF_LIFE_DAYS) to match local regulations and
 * storage conditions.
 */
export const DEFAULT_SHELF_LIFE_DAYS: Record<ComponentType, number> = {
  WHOLE_BLOOD: 35,
  PRBC: 42,
  PLASMA: 365,
  PLATELETS: 5,
  CRYO: 365,
};

/** Statuses in which a unit still physically sits in inventory and can expire. */
export const EXPIRABLE_UNIT_STATUSES = [
  'COLLECTED',
  'UNDER_TESTING',
  'AVAILABLE',
  'RESERVED',
] as const satisfies readonly UnitStatus[];

/** No further transitions are possible from these. */
export const TERMINAL_UNIT_STATUSES = [
  'DISCARDED',
  'RECEIVED',
] as const satisfies readonly UnitStatus[];

export const TESTING_RESULTS = ['PASSED', 'FAILED'] as const;
export type TestingResult = (typeof TESTING_RESULTS)[number];
