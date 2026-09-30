import { describe, expect, it } from 'vitest';
import { PERMISSIONS, hasPermission, permissionsFor } from '../constants/permissions.js';
import { ROLES } from '../constants/roles.js';
import { SETTING_DEFINITIONS, SETTING_KEYS } from '../constants/settings.js';
import { analyticsQuerySchema } from './dashboard.js';
import {
  coarsenCoordinate,
  confirmBloodGroupSchema,
  updateAvailabilitySchema,
  updateDonorVerificationSchema,
} from './donors.js';
import { recordDonationSchema, recordTestResultSchema } from './inventory.js';
import { reserveUnitsSchema, respondOutreachSchema, startOutreachSchema } from './matching.js';
import { createBloodBankSchema, updateHospitalVerificationSchema } from './organisations.js';
import {
  createRequestSchema,
  escalateRequestSchema,
  reviewRequestSchema,
  updateRequestSchema,
} from './requests.js';
import { deleteAccountSchema, updateSettingsSchema } from './settings.js';
import { inviteStaffSchema } from './staff.js';

const id = (n: number) => n.toString(16).padStart(24, '0');
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('permissions', () => {
  it('grants every permission to at least one role and to real roles only', () => {
    for (const roles of Object.values(PERMISSIONS)) {
      expect(roles.length).toBeGreaterThan(0);
      for (const role of roles) expect(ROLES).toContain(role);
    }
  });

  it('keeps administration and clinical-adjacent actions away from donors and hospitals', () => {
    for (const p of [
      'settings:manage',
      'audit:read',
      'users:manage',
      'matching:allocate',
    ] as const) {
      expect(hasPermission('DONOR', p)).toBe(false);
      expect(hasPermission('HOSPITAL', p)).toBe(false);
    }
    expect(hasPermission('BLOOD_BANK_STAFF', 'settings:manage')).toBe(false);
    expect(hasPermission(undefined, 'account:self')).toBe(false);
    expect(permissionsFor('DONOR')).toEqual(['account:self', 'donor:self']);
  });
});

describe('requests', () => {
  const base = {
    bloodGroup: 'O+',
    componentType: 'PRBC',
    unitsRequested: 2,
    urgency: 'URGENT',
    requiredBy: inHours(12),
    reasonCategory: 'MATERNITY',
  };

  it('accepts a normal request and rejects impossible timing or quantities', () => {
    expect(ok(createRequestSchema, base)).toBe(true);
    expect(ok(createRequestSchema, { ...base, requiredBy: inHours(-2) })).toBe(false);
    expect(ok(createRequestSchema, { ...base, requiredBy: inHours(24 * 31) })).toBe(false);
    expect(ok(createRequestSchema, { ...base, unitsRequested: 0 })).toBe(false);
    expect(ok(createRequestSchema, { ...base, unitsRequested: 1.5 })).toBe(false);
  });

  it('keeps patient names out of the hospital reference', () => {
    expect(ok(createRequestSchema, { ...base, hospitalReference: 'ORD-2026/001' })).toBe(true);
    expect(ok(createRequestSchema, { ...base, hospitalReference: 'Ravi Kumar' })).toBe(false);
  });

  it('only raises urgency, needs reasons for rejection, and needs something to edit', () => {
    expect(ok(escalateRequestSchema, { urgency: 'ROUTINE', reason: 'Lower it please' })).toBe(
      false,
    );
    expect(ok(escalateRequestSchema, { urgency: 'EMERGENCY', reason: 'Worse' })).toBe(true);
    expect(ok(reviewRequestSchema, { decision: 'APPROVE' })).toBe(true);
    expect(ok(reviewRequestSchema, { decision: 'REJECT' })).toBe(false);
    expect(ok(updateRequestSchema, {})).toBe(false);
  });
});

describe('matching', () => {
  it('reserves between 1 and 20 distinct units', () => {
    expect(ok(reserveUnitsSchema, { unitIds: [id(1)] })).toBe(true);
    expect(ok(reserveUnitsSchema, { unitIds: [] })).toBe(false);
    expect(ok(reserveUnitsSchema, { unitIds: [id(1), id(1)] })).toBe(false);
    expect(
      ok(reserveUnitsSchema, { unitIds: Array.from({ length: 21 }, (_, i) => id(i + 1)) }),
    ).toBe(false);
    expect(ok(reserveUnitsSchema, { unitIds: ['not-an-id'] })).toBe(false);
  });

  it('limits outreach batches and accepts only real answers', () => {
    expect(
      ok(startOutreachSchema, { donorIds: Array.from({ length: 51 }, (_, i) => id(i + 1)) }),
    ).toBe(false);
    expect(ok(respondOutreachSchema, { response: 'INTERESTED' })).toBe(true);
    expect(ok(respondOutreachSchema, { response: 'DONATED' })).toBe(false);
  });
});

describe('donors', () => {
  it('coarsens coordinates to about 1 km before storage', () => {
    expect(coarsenCoordinate(18.520439)).toBe(18.52);
    expect(coarsenCoordinate(-73.856744)).toBe(-73.86);
  });

  it('requires a future return date only for temporary unavailability', () => {
    expect(ok(updateAvailabilitySchema, { status: 'AVAILABLE' })).toBe(true);
    expect(ok(updateAvailabilitySchema, { status: 'AVAILABLE', availableAgainAt: inDays(3) })).toBe(
      false,
    );
    expect(ok(updateAvailabilitySchema, { status: 'TEMPORARILY_UNAVAILABLE' })).toBe(false);
    expect(
      ok(updateAvailabilitySchema, {
        status: 'TEMPORARILY_UNAVAILABLE',
        availableAgainAt: inDays(-1),
      }),
    ).toBe(false);
    expect(
      ok(updateAvailabilitySchema, {
        status: 'TEMPORARILY_UNAVAILABLE',
        availableAgainAt: inDays(400),
      }),
    ).toBe(false);
    expect(
      ok(updateAvailabilitySchema, {
        status: 'TEMPORARILY_UNAVAILABLE',
        availableAgainAt: inDays(10),
      }),
    ).toBe(true);
  });

  it('requires reasons for negative verification decisions', () => {
    expect(ok(updateDonorVerificationSchema, { status: 'VERIFIED' })).toBe(true);
    expect(ok(updateDonorVerificationSchema, { status: 'SUSPENDED' })).toBe(false);
    expect(ok(updateHospitalVerificationSchema, { status: 'REJECTED' })).toBe(false);
    expect(
      ok(updateHospitalVerificationSchema, {
        status: 'REJECTED',
        reason: 'Registration not found',
      }),
    ).toBe(true);
    expect(ok(confirmBloodGroupSchema, { bloodGroup: 'AB-' })).toBe(true);
  });
});

describe('inventory', () => {
  const donation = {
    donorId: id(1),
    collectedAt: new Date().toISOString(),
    donationType: 'WHOLE_BLOOD',
    volumeMl: 450,
    components: ['PRBC', 'PLASMA'],
  };

  it('keeps component lists and collection times sensible', () => {
    expect(ok(recordDonationSchema, donation)).toBe(true);
    expect(ok(recordDonationSchema, { ...donation, components: ['WHOLE_BLOOD', 'PRBC'] })).toBe(
      false,
    );
    expect(ok(recordDonationSchema, { ...donation, components: ['PRBC', 'PRBC'] })).toBe(false);
    expect(ok(recordDonationSchema, { ...donation, collectedAt: inHours(2) })).toBe(false);
    expect(ok(recordDonationSchema, { ...donation, collectedAt: inHours(-24 * 8) })).toBe(false);
  });

  it('needs the tested group for a pass and a note for a failure', () => {
    expect(ok(recordTestResultSchema, { result: 'PASSED' })).toBe(false);
    expect(ok(recordTestResultSchema, { result: 'PASSED', bloodGroup: 'O-' })).toBe(true);
    expect(ok(recordTestResultSchema, { result: 'FAILED' })).toBe(false);
    expect(ok(recordTestResultSchema, { result: 'FAILED', note: 'Reactive screen' })).toBe(true);
  });
});

describe('organisations and staff', () => {
  it('requires a bank for staff invitations but not for administrators', () => {
    const invite = { name: 'New Person', email: 'new@example.org', phone: '+91 98765 43210' };
    expect(ok(inviteStaffSchema, { ...invite, role: 'BLOOD_BANK_STAFF' })).toBe(false);
    expect(ok(inviteStaffSchema, { ...invite, role: 'BLOOD_BANK_STAFF', bloodBankId: id(1) })).toBe(
      true,
    );
    expect(ok(inviteStaffSchema, { ...invite, role: 'ADMIN' })).toBe(true);
  });

  it('validates blood bank codes', () => {
    const bank = {
      name: 'Central',
      code: 'CEN',
      address: { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' },
      contactPhone: '+91 20 1111 2222',
      contactEmail: 'c@bank.example',
    };
    expect(ok(createBloodBankSchema, bank)).toBe(true);
    expect(ok(createBloodBankSchema, { ...bank, code: 'has space' })).toBe(false);
  });
});

describe('settings, analytics and account deletion', () => {
  it('defines sane ranges for every integer setting', () => {
    for (const key of SETTING_KEYS) {
      const def = SETTING_DEFINITIONS[key];
      if (def.type === 'integer') expect(def.min).toBeLessThan(def.max);
      expect(def.label.length).toBeGreaterThan(3);
    }
  });

  it('accepts known settings in range, with a reason, and nothing else', () => {
    const valid = {
      changes: { reservationHoldHours: 6, allowCompatibleSubstitutes: false },
      reason: 'Local policy',
    };
    expect(ok(updateSettingsSchema, valid)).toBe(true);
    expect(ok(updateSettingsSchema, { ...valid, reason: 'no' })).toBe(false);
    expect(
      ok(updateSettingsSchema, { changes: { reservationHoldHours: 999 }, reason: 'Too long' }),
    ).toBe(false);
    expect(
      ok(updateSettingsSchema, {
        changes: { allowCompatibleSubstitutes: 'yes' },
        reason: 'Wrong type',
      }),
    ).toBe(false);
    expect(ok(updateSettingsSchema, { changes: { bloodTable: 1 }, reason: 'Unknown key' })).toBe(
      false,
    );
    expect(ok(updateSettingsSchema, { changes: {}, reason: 'Nothing at all' })).toBe(false);
  });

  it('allows only the supported analytics periods', () => {
    expect(analyticsQuerySchema.parse({}).days).toBe(30);
    expect(analyticsQuerySchema.parse({ days: '90' }).days).toBe(90);
    expect(ok(analyticsQuerySchema, { days: '45' })).toBe(false);
  });

  it('demands the exact confirmation word to delete an account', () => {
    expect(ok(deleteAccountSchema, { password: 'x', confirm: 'DELETE' })).toBe(true);
    expect(ok(deleteAccountSchema, { password: 'x', confirm: 'delete' })).toBe(false);
    expect(ok(deleteAccountSchema, { password: '', confirm: 'DELETE' })).toBe(false);
  });
});
