import type { BloodGroup, ComponentType } from '../constants/blood.js';
import type {
  AllocationStatus,
  AvailabilityStatus,
  OutreachStatus,
  Urgency,
} from '../constants/statuses.js';

/** How a candidate unit's group relates to the requested group. */
export type GroupMatch = 'EXACT' | 'COMPATIBLE';

/** A usable unit that could be reserved for a request, in ranked order. */
export interface InventoryCandidate {
  unitId: string;
  unitCode: string;
  bloodGroup: BloodGroup;
  componentType: ComponentType;
  groupMatch: GroupMatch;
  expiryDate: string;
  daysToExpiry: number;
  collectedAt: string;
  storageLocation: string | null;
  bloodBank: { id: string; name: string; code: string };
  /** Staff may reserve only their own blood bank's units; administrators any. */
  canReserve: boolean;
}

export interface InventoryCandidates {
  requestId: string;
  /** Units still needed: requested minus already allocated. */
  shortfall: number;
  /** Donor groups considered compatible for this component, identical group first. */
  compatibleGroups: BloodGroup[];
  candidates: InventoryCandidate[];
  /** Suggested selection (never reserved until staff confirm). */
  preselectedUnitIds: string[];
  /** True when the list was cut off at the display limit. */
  truncated: boolean;
}

export interface AllocationView {
  id: string;
  status: AllocationStatus;
  unit: {
    id: string;
    unitCode: string;
    bloodGroup: BloodGroup;
    componentType: ComponentType;
    expiryDate: string;
  };
  bloodBank: { id: string; name: string; code: string };
  groupMatch: GroupMatch;
  reservedAt: string;
  reservedBy: { id: string; name: string } | null;
  /** Reservation is released automatically after this time unless issued. */
  holdUntil: string | null;
  issuedAt: string | null;
  issuedBy: { id: string; name: string } | null;
  receivedAt: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  /** Staff only: what the viewer may do with this allocation now. */
  canIssue: boolean;
  canRelease: boolean;
}

/**
 * A potential donor as blood-bank staff see them before contact: no name, phone, email or exact
 * location — only what coordination needs.
 */
export interface DonorCandidate {
  donorId: string;
  bloodGroup: BloodGroup;
  bloodGroupConfirmed: boolean;
  groupMatch: GroupMatch;
  city: string;
  area: string;
  /** Rounded distance from the hospital; null when the donor has no approximate location. */
  approxDistanceKm: number | null;
  availability: AvailabilityStatus;
  /** 0–100, higher first. An administrative ranking, not a statement of eligibility. */
  score: number;
}

export interface DonorCandidates {
  requestId: string;
  shortfall: number;
  /** How many donors the system suggests contacting (shortfall × multiplier, capped). */
  suggestedCount: number;
  radiusKm: number;
  /** Whether the hospital has a location (otherwise donors are matched by city). */
  searchedBy: 'DISTANCE' | 'CITY';
  candidates: DonorCandidate[];
  /** Always "Potential donor based on system criteria". */
  label: string;
}

export interface DonorOutreachStaffView {
  id: string;
  status: OutreachStatus;
  bloodGroup: BloodGroup;
  bloodGroupConfirmed: boolean;
  city: string;
  area: string;
  approxDistanceKm: number | null;
  score: number;
  notifiedAt: string;
  respondedAt: string | null;
  /** Revealed only after the donor responds INTERESTED. */
  contact: { name: string; phone: string; email: string } | null;
}

export interface RequestOutreachSummary {
  requestId: string;
  outreach: DonorOutreachStaffView[];
  counts: Partial<Record<OutreachStatus, number>>;
}

/** What a donor sees about a request they were contacted for: no hospital or patient details. */
export interface DonorOutreachSelfView {
  id: string;
  status: OutreachStatus;
  bloodGroupNeeded: BloodGroup;
  componentType: ComponentType;
  urgency: Urgency;
  requiredBy: string;
  city: string;
  approxDistanceKm: number | null;
  notifiedAt: string;
  respondedAt: string | null;
  /** The request is still open, so a response is still useful. */
  open: boolean;
  canRespond: boolean;
}
