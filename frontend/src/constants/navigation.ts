import type { Role } from '@bbms/shared';

/** Where each role lands after signing in. */
export function homePathFor(role: Role): string {
  switch (role) {
    case 'DONOR':
      return '/donor';
    case 'HOSPITAL':
      return '/hospital';
    case 'BLOOD_BANK_STAFF':
    case 'ADMIN':
      return '/admin';
  }
}
