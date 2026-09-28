import type { BloodGroup, ComponentType } from '../constants/blood.js';
import type { DonationType } from '../constants/inventory.js';
import type { TestingStatus, UnitStatus } from '../constants/statuses.js';

export interface UnitStatusChange {
  from: UnitStatus | null;
  to: UnitStatus;
  at: string;
  by: { id: string; name: string } | null;
  reason: string | null;
  override: boolean;
}

/** A transition the current user may perform on a unit right now. */
export interface AvailableUnitTransition {
  to: UnitStatus;
  requiresReason: boolean;
  override: boolean;
  label: string;
}

export interface BloodUnitSummary {
  id: string;
  unitCode: string;
  bloodGroup: BloodGroup;
  componentType: ComponentType;
  volumeMl: number | null;
  status: UnitStatus;
  testingStatus: TestingStatus;
  collectedAt: string;
  expiryDate: string;
  /** Past expiry but not yet swept to EXPIRED — never usable. */
  expiredByDate: boolean;
  daysToExpiry: number;
  storageLocation: string | null;
  bloodBank: { id: string; name: string; code: string };
}

export interface BloodUnitDetail extends BloodUnitSummary {
  donationId: string;
  /** Traceability for staff; donors are never shown which units came from them. */
  donor: { id: string; name: string } | null;
  statusHistory: UnitStatusChange[];
  allowedTransitions: AvailableUnitTransition[];
}

export interface DonationSummary {
  id: string;
  donor: { id: string; name: string };
  bloodBank: { id: string; name: string; code: string };
  collectedAt: string;
  donationType: DonationType;
  volumeMl: number;
  testingStatus: TestingStatus;
  unitCount: number;
  recordedBy: { id: string; name: string } | null;
}

export interface DonationDetail extends DonationSummary {
  units: BloodUnitSummary[];
  testedAt: string | null;
  testedBy: { id: string; name: string } | null;
  testedBloodGroup: BloodGroup | null;
  testNote: string | null;
  notes: string | null;
  /** Units exist in COLLECTED status. */
  canStartTesting: boolean;
  /** Units are UNDER_TESTING and awaiting a result. */
  canRecordResult: boolean;
  canManage: boolean;
}

/** A donor's own view of a donation: deliberately no test results or unit details. */
export interface DonorDonationView {
  id: string;
  collectedAt: string;
  donationType: DonationType;
  bloodBankName: string;
  city: string;
}

export interface InventorySummary {
  /** Usable stock: AVAILABLE and not past expiry, per blood group and component. */
  available: { bloodGroup: BloodGroup; componentType: ComponentType; units: number }[];
  byStatus: Partial<Record<UnitStatus, number>>;
  expiringSoon: number;
  expiredAwaitingSweep: number;
  expiryWarningDays: number;
}
