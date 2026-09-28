import {
  ageInYears,
  type AvailabilityChange,
  type DonorSelfView,
  type DonorStaffDetail,
  type DonorStaffSummary,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import { earliestContactDate, effectiveAvailability } from '../../domain/donors/availability.js';
import type { User } from '../users/user.model.js';
import type { AvailabilityHistoryEntry, DonorProfile } from './donorProfile.model.js';

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

/** Newest first; only the most recent entries are sent to clients. */
function presentHistory(history: AvailabilityHistoryEntry[], limit = 20): AvailabilityChange[] {
  return [...history]
    .reverse()
    .slice(0, limit)
    .map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt.toISOString(),
      availableAgainAt: iso(entry.availableAgainAt),
    }));
}

export function toDonorSelfView(donor: DonorProfile): DonorSelfView {
  return {
    id: donor._id.toString(),
    bloodGroup: donor.bloodGroup,
    bloodGroupConfirmed: donor.bloodGroupConfirmed,
    dateOfBirth: donor.dateOfBirth.toISOString().slice(0, 10),
    location: {
      city: donor.location.city,
      area: donor.location.area,
      // The donor sees only that a location is set; coordinates are never sent back out.
      hasApproximateLocation: !!donor.location.point?.coordinates?.length,
    },
    lastDonationAt: iso(donor.lastDonationAt),
    donationCount: donor.donationCount,
    availabilityStatus: donor.availabilityStatus,
    effectiveAvailability: effectiveAvailability(donor.availabilityStatus, donor.availableAgainAt),
    availableAgainAt: iso(donor.availableAgainAt),
    availabilityHistory: presentHistory(donor.availabilityHistory),
    verificationStatus: donor.verificationStatus,
    notificationPreferences: donor.notificationPreferences,
    earliestContactDate: iso(
      earliestContactDate(donor.lastDonationAt, env.DONOR_CONTACT_INTERVAL_DAYS),
    ),
    contactIntervalDays: env.DONOR_CONTACT_INTERVAL_DAYS,
  };
}

type OwnerFields = Pick<User, '_id' | 'name' | 'accountStatus'>;

/** Staff views deliberately omit phone, email, date of birth and coordinates. */
export function toDonorStaffSummary(
  donor: DonorProfile,
  owner: OwnerFields | undefined,
): DonorStaffSummary {
  return {
    id: donor._id.toString(),
    userId: donor.userId.toString(),
    name: owner?.name ?? 'Unknown donor',
    bloodGroup: donor.bloodGroup,
    bloodGroupConfirmed: donor.bloodGroupConfirmed,
    city: donor.location.city,
    area: donor.location.area,
    age: ageInYears(donor.dateOfBirth),
    effectiveAvailability: effectiveAvailability(donor.availabilityStatus, donor.availableAgainAt),
    verificationStatus: donor.verificationStatus,
    donationCount: donor.donationCount,
    lastDonationAt: iso(donor.lastDonationAt),
    registeredAt: donor.createdAt.toISOString(),
  };
}

export function toDonorStaffDetail(
  donor: DonorProfile,
  owner: OwnerFields | undefined,
): DonorStaffDetail {
  return {
    ...toDonorStaffSummary(donor, owner),
    availabilityHistory: presentHistory(donor.availabilityHistory),
    earliestContactDate: iso(
      earliestContactDate(donor.lastDonationAt, env.DONOR_CONTACT_INTERVAL_DAYS),
    ),
    accountStatus: owner?.accountStatus ?? 'DEACTIVATED',
  };
}
