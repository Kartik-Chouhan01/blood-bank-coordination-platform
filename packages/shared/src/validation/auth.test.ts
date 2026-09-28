import { describe, expect, it } from 'vitest';
import { ageInYears, loginSchema, registerDonorSchema } from './auth.js';
import { passwordSchema } from './common.js';
import { hasPermission } from '../constants/permissions.js';

const validDonor = {
  name: 'Test Donor',
  email: '  Donor@Example.TEST ',
  phone: '+91 98765 43210',
  password: 'correct-horse-9',
  consent: true,
  bloodGroup: 'O+',
  dateOfBirth: '1990-05-17',
  city: 'Pune',
  area: 'Hinjawadi',
};

describe('registerDonorSchema', () => {
  it('normalises email to trimmed lowercase', () => {
    expect(registerDonorSchema.parse(validDonor).email).toBe('donor@example.test');
  });

  it('requires explicit consent', () => {
    expect(registerDonorSchema.safeParse({ ...validDonor, consent: false }).success).toBe(false);
  });

  it('rejects under-age accounts', () => {
    const dob = new Date();
    dob.setUTCFullYear(dob.getUTCFullYear() - 17);
    const result = registerDonorSchema.safeParse({
      ...validDonor,
      dateOfBirth: dob.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown blood group', () => {
    expect(registerDonorSchema.safeParse({ ...validDonor, bloodGroup: 'C+' }).success).toBe(false);
  });

  it('strips fields the client may not set', () => {
    const parsed = registerDonorSchema.parse({ ...validDonor, role: 'ADMIN' });
    expect(parsed).not.toHaveProperty('role');
  });
});

describe('passwordSchema', () => {
  it.each([
    ['short1', false],
    ['onlyletterslong', false],
    ['1234567890', false],
    ['letters-and-1-digit', true],
    ['é'.repeat(36) + '1', false], // 73 bytes: over the bcrypt limit
  ])('%s → %s', (password, ok) => {
    expect(passwordSchema.safeParse(password).success).toBe(ok);
  });
});

describe('ageInYears', () => {
  it('counts birthdays correctly', () => {
    expect(ageInYears(new Date('2000-06-15'), new Date('2018-06-14'))).toBe(17);
    expect(ageInYears(new Date('2000-06-15'), new Date('2018-06-15'))).toBe(18);
  });
});

describe('loginSchema', () => {
  it('does not apply password policy at login (legacy passwords must still work)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
  });
});

describe('hasPermission', () => {
  it('grants and denies by role', () => {
    expect(hasPermission('ADMIN', 'users:manage')).toBe(true);
    expect(hasPermission('DONOR', 'users:manage')).toBe(false);
    expect(hasPermission(undefined, 'account:self')).toBe(false);
  });
});
