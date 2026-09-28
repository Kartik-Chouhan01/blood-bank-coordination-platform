export const ROLES = ['DONOR', 'HOSPITAL', 'BLOOD_BANK_STAFF', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  DONOR: 'Donor',
  HOSPITAL: 'Hospital',
  BLOOD_BANK_STAFF: 'Blood bank staff',
  ADMIN: 'Administrator',
};

export const ACCOUNT_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
