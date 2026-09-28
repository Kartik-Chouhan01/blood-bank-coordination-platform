import type { BloodGroup } from '../constants/blood.js';
import type { AccountStatus, Role, VerificationStatus } from '../constants/roles.js';

export interface DonorProfileSummary {
  kind: 'DONOR';
  bloodGroup: BloodGroup;
  city: string;
  area: string;
  verificationStatus: VerificationStatus;
}

export interface HospitalProfileSummary {
  kind: 'HOSPITAL';
  hospitalName: string;
  verificationStatus: VerificationStatus;
}

/** The signed-in user as the client sees it. Never contains secrets or other people's data. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
  profile: DonorProfileSummary | HospitalProfileSummary | null;
}

export interface AuthSessionResponse {
  user: AuthUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/** Admin-facing user row. */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
