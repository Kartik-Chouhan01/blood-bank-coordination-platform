import type { Role } from './roles.js';

/**
 * The single authorization map. Routes and UI ask "does this role have permission X?",
 * never "is this user an ADMIN?", so roles can be reshaped without touching feature code.
 * The backend is the only enforcement point; the frontend uses this to hide unusable UI.
 */
export const PERMISSIONS = {
  'account:self': ['DONOR', 'HOSPITAL', 'BLOOD_BANK_STAFF', 'ADMIN'],
  'donor:self': ['DONOR'],
  'hospital:self': ['HOSPITAL'],
  'users:read': ['ADMIN'],
  'users:manage': ['ADMIN'],
  'donors:read': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'donors:verify': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'hospitals:read': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'hospitals:verify': ['ADMIN'],
  'bloodBanks:read': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'bloodBanks:manage': ['ADMIN'],
  'inventory:read': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'inventory:manage': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'requests:create': ['HOSPITAL'],
  'requests:read': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'requests:review': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'matching:allocate': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'analytics:read': ['BLOOD_BANK_STAFF', 'ADMIN'],
  'audit:read': ['ADMIN'],
  'settings:manage': ['ADMIN'],
  'workflow:override': ['ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p));
}
