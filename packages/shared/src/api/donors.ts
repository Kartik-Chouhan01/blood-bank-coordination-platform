import type { BloodGroup } from '../constants/blood.js';
import type { VerificationStatus } from '../constants/roles.js';
import type { AvailabilityStatus } from '../constants/statuses.js';
import type { NotificationPreferences } from '../validation/donors.js';

export interface AvailabilityChange {
  status: AvailabilityStatus;
  changedAt: string;
  availableAgainAt: string | null;
}

/** What a donor sees about themselves. */
export interface DonorSelfView {
  id: string;
  bloodGroup: BloodGroup;
  bloodGroupConfirmed: boolean;
  dateOfBirth: string;
  location: { city: string; area: string; hasApproximateLocation: boolean };
  lastDonationAt: string | null;
  donationCount: number;
  availabilityStatus: AvailabilityStatus;
  /** Status after applying an elapsed "available again" date. */
  effectiveAvailability: AvailabilityStatus;
  availableAgainAt: string | null;
  availabilityHistory: AvailabilityChange[];
  verificationStatus: VerificationStatus;
  notificationPreferences: NotificationPreferences;
  /**
   * Earliest date the system may contact the donor about donating again, based on the configured
   * interval since their last recorded donation. This is NOT a statement of medical eligibility.
   */
  earliestContactDate: string | null;
  contactIntervalDays: number;
}

/** Staff-facing row: no phone, email, exact location or date of birth. */
export interface DonorStaffSummary {
  id: string;
  userId: string;
  name: string;
  bloodGroup: BloodGroup;
  bloodGroupConfirmed: boolean;
  city: string;
  area: string;
  age: number;
  effectiveAvailability: AvailabilityStatus;
  verificationStatus: VerificationStatus;
  donationCount: number;
  lastDonationAt: string | null;
  registeredAt: string;
}

export interface DonorStaffDetail extends DonorStaffSummary {
  availabilityHistory: AvailabilityChange[];
  earliestContactDate: string | null;
  accountStatus: string;
}
