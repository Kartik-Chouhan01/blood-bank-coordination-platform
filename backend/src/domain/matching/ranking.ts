import type { BloodGroup, ComponentType } from '@bbms/shared';
import { substitutionRank } from './compatibility.js';

export interface RankableUnit {
  bloodGroup: BloodGroup;
  expiryDate: Date;
  collectedAt: Date;
  unitCode: string;
}

/**
 * Orders usable units for a request: identical group first, then compatible substitutes in
 * preference order (universal donor groups last, to conserve them), then earliest expiry (use
 * stock before it is wasted), then oldest collection, then unit code for a stable order.
 */
export function rankUnits<T extends RankableUnit>(
  units: readonly T[],
  recipient: BloodGroup,
  component: ComponentType,
): T[] {
  const rank = (unit: T) => substitutionRank(unit.bloodGroup, recipient, component);
  return [...units].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.expiryDate.getTime() - b.expiryDate.getTime() ||
      a.collectedAt.getTime() - b.collectedAt.getTime() ||
      a.unitCode.localeCompare(b.unitCode),
  );
}

export interface DonorScoreInput {
  exactGroup: boolean;
  bloodGroupConfirmed: boolean;
  /** null when the donor has no approximate location (matched by city instead). */
  distanceKm: number | null;
  radiusKm: number;
  /** Days since the donor's contact interval ended (or since registration if never donated). */
  daysSinceContactAllowed: number;
  /** Past outreach responses: how many were INTERESTED/DONATED out of all answered. */
  history: { positive: number; answered: number };
}

/** Points per factor; they add up to 100. */
export const DONOR_SCORE_WEIGHTS = {
  proximity: 40,
  exactGroup: 20,
  confirmedGroup: 10,
  rested: 15,
  responsiveness: 15,
} as const;

/** Donors who can be contacted again for this long get the full "rested" points. */
const RESTED_FULL_DAYS = 60;
/** Donors matched only by city get part of the proximity points. */
const UNKNOWN_DISTANCE_SHARE = 0.4;

/**
 * An administrative ranking of donors who already passed every hard filter. It orders who to
 * contact first; it says nothing about medical eligibility.
 */
export function scoreDonor(input: DonorScoreInput): number {
  const w = DONOR_SCORE_WEIGHTS;
  const proximity =
    input.distanceKm === null
      ? UNKNOWN_DISTANCE_SHARE
      : Math.max(0, 1 - input.distanceKm / Math.max(input.radiusKm, 1));
  const rested = Math.min(1, Math.max(0, input.daysSinceContactAllowed) / RESTED_FULL_DAYS);
  // No history is neutral, not a penalty.
  const responsiveness = input.history.answered
    ? input.history.positive / input.history.answered
    : 0.5;

  const score =
    w.proximity * proximity +
    (input.exactGroup ? w.exactGroup : w.exactGroup / 4) +
    (input.bloodGroupConfirmed ? w.confirmedGroup : 0) +
    w.rested * rested +
    w.responsiveness * responsiveness;
  return Math.round(score);
}
