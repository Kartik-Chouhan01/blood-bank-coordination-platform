import type { AvailabilityStatus } from '@bbms/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A temporarily unavailable donor becomes available again once their chosen return date passes.
 * Computed on read (and in queries) so no background job is needed and nothing can drift.
 */
export function effectiveAvailability(
  status: AvailabilityStatus,
  availableAgainAt: Date | null | undefined,
  now = new Date(),
): AvailabilityStatus {
  if (status === 'TEMPORARILY_UNAVAILABLE' && availableAgainAt && availableAgainAt <= now) {
    return 'AVAILABLE';
  }
  return status;
}

/** MongoDB filter matching donors whose *effective* availability equals `status`. */
export function effectiveAvailabilityFilter(status: AvailabilityStatus, now = new Date()) {
  switch (status) {
    case 'AVAILABLE':
      return {
        $or: [
          { availabilityStatus: 'AVAILABLE' },
          { availabilityStatus: 'TEMPORARILY_UNAVAILABLE', availableAgainAt: { $lte: now } },
        ],
      };
    case 'TEMPORARILY_UNAVAILABLE':
      return { availabilityStatus: 'TEMPORARILY_UNAVAILABLE', availableAgainAt: { $gt: now } };
    default:
      return { availabilityStatus: status };
  }
}

/**
 * Earliest date the system may contact a donor about donating again: an administrative interval
 * after their last recorded donation. Never presented as medical eligibility.
 */
export function earliestContactDate(
  lastDonationAt: Date | null | undefined,
  intervalDays: number,
): Date | null {
  return lastDonationAt ? new Date(lastDonationAt.getTime() + intervalDays * DAY_MS) : null;
}
