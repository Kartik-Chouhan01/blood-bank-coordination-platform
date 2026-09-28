/**
 * Every auditable action. Shared so the admin audit viewer can filter and label them; the backend
 * model validates against the same list.
 */
export const AUDIT_ACTIONS = [
  'USER_REGISTERED',
  'USER_CREATED',
  'USER_INVITED',
  'INVITE_ACCEPTED',
  'USER_STATUS_CHANGED',
  'EMAIL_VERIFIED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'SESSIONS_REVOKED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'ACCOUNT_UPDATED',
  'DONOR_PROFILE_UPDATED',
  'DONOR_VERIFICATION_CHANGED',
  'DONOR_BLOOD_GROUP_CONFIRMED',
  'HOSPITAL_PROFILE_UPDATED',
  'HOSPITAL_VERIFICATION_CHANGED',
  'BLOOD_BANK_CREATED',
  'BLOOD_BANK_UPDATED',
  'DONATION_RECORDED',
  'DONATION_TESTING_STARTED',
  'DONATION_TEST_RESULT_RECORDED',
  'BLOOD_UNIT_STATUS_CHANGED',
  'WORKFLOW_OVERRIDE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  'User',
  'DonorProfile',
  'Hospital',
  'BloodBank',
  'Donation',
  'BloodUnit',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  USER_REGISTERED: 'Account registered',
  USER_CREATED: 'Account created',
  USER_INVITED: 'Staff member invited',
  INVITE_ACCEPTED: 'Invitation accepted',
  USER_STATUS_CHANGED: 'Account status changed',
  EMAIL_VERIFIED: 'Email verified',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET: 'Password reset',
  SESSIONS_REVOKED: 'Signed out everywhere',
  REFRESH_TOKEN_REUSE_DETECTED: 'Suspicious session reuse blocked',
  ACCOUNT_UPDATED: 'Account details updated',
  DONOR_PROFILE_UPDATED: 'Donor profile updated',
  DONOR_VERIFICATION_CHANGED: 'Donor verification changed',
  DONOR_BLOOD_GROUP_CONFIRMED: 'Blood group confirmed',
  HOSPITAL_PROFILE_UPDATED: 'Hospital profile updated',
  HOSPITAL_VERIFICATION_CHANGED: 'Hospital verification changed',
  BLOOD_BANK_CREATED: 'Blood bank created',
  BLOOD_BANK_UPDATED: 'Blood bank updated',
  DONATION_RECORDED: 'Donation recorded',
  DONATION_TESTING_STARTED: 'Testing started',
  DONATION_TEST_RESULT_RECORDED: 'Test result recorded',
  BLOOD_UNIT_STATUS_CHANGED: 'Blood unit status changed',
  WORKFLOW_OVERRIDE: 'Administrator override',
};
