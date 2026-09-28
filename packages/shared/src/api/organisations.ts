import type { AuditAction, AuditEntityType } from '../constants/audit.js';
import type { Role, VerificationStatus } from '../constants/roles.js';
import type { OperatingStatus } from '../validation/organisations.js';

export interface Address {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
}

/** What a hospital account sees about its own hospital. */
export interface HospitalSelfView {
  id: string;
  name: string;
  registrationNumber: string;
  address: Address;
  operatingStatus: OperatingStatus;
  verificationStatus: VerificationStatus;
  /** Admin's reason, shown when rejected or suspended. */
  statusReason: string | null;
  verifiedAt: string | null;
  /** Name and registration number can be edited only while not verified. */
  canEditIdentity: boolean;
}

/** Staff/admin view. Hospital contact details are institutional, so they are visible for verification. */
export interface HospitalSummary {
  id: string;
  name: string;
  registrationNumber: string;
  city: string;
  state: string;
  verificationStatus: VerificationStatus;
  operatingStatus: OperatingStatus;
  contact: { name: string; email: string; phone: string };
  registeredAt: string;
}

export interface HospitalDetail extends HospitalSummary {
  address: Address;
  statusReason: string | null;
  verifiedAt: string | null;
  resubmittedAt: string | null;
}

export interface BloodBankView {
  id: string;
  name: string;
  code: string;
  address: Address;
  contactPhone: string;
  contactEmail: string;
  isActive: boolean;
  staffCount: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  /** null for system actions (jobs, CLI scripts). */
  actor: { id: string; name: string; role: Role } | null;
  actorRole: Role | 'SYSTEM';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  requestId: string | null;
  ipTruncated: string | null;
  createdAt: string;
}
