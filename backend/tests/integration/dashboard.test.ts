import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BloodGroup, ComponentType } from '@bbms/shared';
import { createApp } from '../../src/app.js';
import { runExpirySweep } from '../../src/jobs/expirySweep.js';
import { BloodBankModel } from '../../src/modules/bloodBanks/bloodBank.model.js';
import { clearPublicStatsCache } from '../../src/modules/dashboard/dashboard.service.js';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model.js';
import { BloodUnitModel } from '../../src/modules/inventory/bloodUnit.model.js';
import { DonationModel } from '../../src/modules/inventory/donation.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { createUser, hospitalPayload, login, useMailbox } from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const bankAddress = { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' };

let ctx: {
  bankId: Types.ObjectId;
  otherBankId: Types.ObjectId;
  staff: string;
  admin: string;
  hospital: string;
};

async function bank(code: string) {
  return BloodBankModel.create({
    name: `Bank ${code}`,
    code,
    address: bankAddress,
    contactPhone: '+91 20 1111 2222',
    contactEmail: `${code.toLowerCase()}@bank.example`,
  });
}

async function auth(role: 'ADMIN' | 'BLOOD_BANK_STAFF', extra: Record<string, unknown> = {}) {
  const user = await createUser(role, extra);
  return `Bearer ${(await login(app, user.email)).accessToken}`;
}

beforeEach(async () => {
  clearPublicStatsCache();
  const [main, other] = await Promise.all([bank('CEN'), bank('OTH')]);
  const res = await request(app)
    .post('/api/auth/register/hospital')
    .send(hospitalPayload())
    .expect(201);
  await HospitalModel.updateOne(
    { userId: res.body.data.user.id },
    { $set: { verificationStatus: 'VERIFIED' } },
  );
  ctx = {
    bankId: main._id,
    otherBankId: other._id,
    staff: await auth('BLOOD_BANK_STAFF', { bloodBankId: main._id }),
    admin: await auth('ADMIN'),
    hospital: `Bearer ${res.body.data.accessToken}`,
  };
});

let seq = 0;
async function units(
  count: number,
  bloodGroup: BloodGroup,
  opts: { component?: ComponentType; expiresInDays?: number; bankId?: Types.ObjectId } = {},
) {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = await BloodUnitModel.create({
      unitCode: `CEN-260101-${String((seq += 1)).padStart(4, '0')}`,
      donationId: new Types.ObjectId(),
      donorId: new Types.ObjectId(),
      bloodBankId: opts.bankId ?? ctx.bankId,
      bloodGroup,
      componentType: opts.component ?? 'PRBC',
      collectedAt: new Date(Date.now() - DAY),
      expiryDate: new Date(Date.now() + (opts.expiresInDays ?? 20) * DAY),
      status: 'AVAILABLE',
      testingStatus: 'PASSED',
    });
    ids.push(u._id.toString());
  }
  return ids;
}

async function raise(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/requests')
    .set('Authorization', ctx.hospital)
    .send({
      bloodGroup: 'A+',
      componentType: 'PRBC',
      unitsRequested: 1,
      urgency: 'ROUTINE',
      requiredBy: new Date(Date.now() + 24 * HOUR).toISOString(),
      reasonCategory: 'SCHEDULED_PROCEDURE',
      ...overrides,
    })
    .expect(201);
  return res.body.data.id as string;
}

/** Approve (unless auto-approved), reserve the given unit and issue it. */
async function fulfil(requestId: string, unitId: string, approve = true) {
  if (approve) {
    await request(app)
      .post(`/api/requests/${requestId}/review`)
      .set('Authorization', ctx.staff)
      .send({ decision: 'APPROVE' })
      .expect(200);
  }
  const reserved = await request(app)
    .post(`/api/matching/requests/${requestId}/allocations`)
    .set('Authorization', ctx.staff)
    .send({ unitIds: [unitId] })
    .expect(201);
  await request(app)
    .post(`/api/matching/allocations/${reserved.body.data.allocations[0].id}/issue`)
    .set('Authorization', ctx.staff)
    .expect(200);
}

describe('public stock levels', () => {
  it('publishes coarse red-cell levels per group without sign-in and without counts', async () => {
    await units(20, 'O+');
    await units(7, 'A+');
    await units(30, 'B+', { component: 'PLASMA' }); // plasma does not count
    await units(10, 'AB+', { expiresInDays: -1 }); // past expiry does not count

    const res = await request(app).get('/api/dashboard/public-stats').expect(200);
    expect(res.headers['cache-control']).toMatch(/max-age=300/);
    const levels = Object.fromEntries(
      res.body.data.stock.map((s: { bloodGroup: string; level: string }) => [
        s.bloodGroup,
        s.level,
      ]),
    );
    expect(levels).toMatchObject({ 'O+': 'GOOD', 'A+': 'MODERATE', 'B+': 'LOW', 'AB+': 'LOW' });
    expect(Object.keys(levels)).toHaveLength(8);
    expect(JSON.stringify(res.body.data)).not.toMatch(/"units"|\b20\b/);
  });

  it('serves cached levels for a few minutes', async () => {
    await request(app).get('/api/dashboard/public-stats').expect(200);
    await units(20, 'O-');
    const cached = await request(app).get('/api/dashboard/public-stats').expect(200);
    expect(
      cached.body.data.stock.find((s: { bloodGroup: string }) => s.bloodGroup === 'O-').level,
    ).toBe('LOW');
  });
});

describe('staff overview', () => {
  it("scopes stock to the staff member's bank and counts what needs attention", async () => {
    await units(3, 'O-');
    await units(5, 'O-', { bankId: ctx.otherBankId });
    await units(1, 'A+', { expiresInDays: 1 });
    await raise({ urgency: 'EMERGENCY' });
    await raise();

    const res = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', ctx.staff)
      .expect(200);
    const data = res.body.data;
    expect(data.bloodBank.name).toBe('Bank CEN');
    expect(data.stockByGroup.find((g: { bloodGroup: string }) => g.bloodGroup === 'O-').units).toBe(
      3,
    );
    expect(data.expiringSoon).toBe(1);
    expect(data.requests).toMatchObject({
      open: 2,
      pendingReview: 1,
      openByUrgency: { EMERGENCY: 1, URGENT: 0, ROUTINE: 1 },
    });
    // Staff cannot verify hospitals, so that count is not theirs.
    expect(data.verification.hospitalsPending).toBeNull();

    const network = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', ctx.admin)
      .expect(200);
    expect(network.body.data.bloodBank).toBeNull();
    expect(
      network.body.data.stockByGroup.find((g: { bloodGroup: string }) => g.bloodGroup === 'O-')
        .units,
    ).toBe(8);
    expect(network.body.data.verification.hospitalsPending).toBe(0);
  });

  it('is not available to hospitals', async () => {
    await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', ctx.hospital)
      .expect(403);
    await request(app)
      .get('/api/dashboard/analytics')
      .set('Authorization', ctx.hospital)
      .expect(403);
  });
});

describe('analytics', () => {
  it('reports requests, fulfilment, issues, expiry and demand for the period', async () => {
    const [a1, a2] = await units(2, 'A+');
    await fulfil(await raise(), a1!);
    await fulfil(await raise({ urgency: 'EMERGENCY' }), a2!, false);
    await raise({ bloodGroup: 'B+', unitsRequested: 3 }); // still open
    const cancelled = await raise();
    await request(app)
      .post(`/api/requests/${cancelled}/cancel`)
      .set('Authorization', ctx.hospital)
      .send({ reason: 'No longer needed' })
      .expect(200);
    await units(1, 'O+', { expiresInDays: 0.5 });
    await runExpirySweep(new Date(Date.now() + DAY));
    await DonationModel.create({
      donorId: new Types.ObjectId(),
      bloodBankId: ctx.bankId,
      collectedAt: new Date(Date.now() - HOUR),
      collectedBy: new Types.ObjectId(),
      donationType: 'WHOLE_BLOOD',
      volumeMl: 450,
    });

    const res = await request(app)
      .get('/api/dashboard/analytics?days=30')
      .set('Authorization', ctx.staff)
      .expect(200);
    const { totals, series, byBloodGroup, range } = res.body.data;
    expect(range).toMatchObject({ days: 30, bucket: 'day', timeZone: 'Asia/Kolkata' });
    expect(totals).toMatchObject({
      requestsRaised: 4,
      emergencyRequests: 1,
      requestsFulfilled: 2,
      // Closed: 2 fulfilled + 1 cancelled.
      fulfilmentRate: 0.667,
      unitsIssued: 2,
      donations: 1,
      unitsDiscarded: 0,
      donorsContacted: 0,
    });
    // The sweep records the real time of expiry, which is inside the window.
    expect(totals.unitsExpired).toBe(1);
    expect(totals.expiryWastageRate).toBe(0.333);
    expect(totals.medianHoursToFulfil).toBeGreaterThanOrEqual(0);
    expect(totals.emergencyMedianHoursToFulfil).not.toBeNull();

    expect(series.length).toBeGreaterThanOrEqual(30);
    const sum = (key: string) =>
      series.reduce((a: number, p: Record<string, number>) => a + p[key]!, 0);
    expect(sum('requestsRaised')).toBe(4);
    expect(sum('requestsFulfilled')).toBe(2);
    expect(sum('unitsIssued')).toBe(2);
    expect(byBloodGroup.find((g: { bloodGroup: string }) => g.bloodGroup === 'B+')).toEqual({
      bloodGroup: 'B+',
      unitsRequested: 3,
      unitsIssued: 0,
    });
  });

  it('counts expiry as wastage and scopes units to a bank', async () => {
    const [issuedUnit] = await units(1, 'A+');
    await fulfil(await raise(), issuedUnit!);
    const [expiring] = await units(1, 'O+', { expiresInDays: -0.01 });
    await runExpirySweep();
    expect((await BloodUnitModel.findById(expiring).lean())!.status).toBe('EXPIRED');

    const own = await request(app)
      .get(`/api/dashboard/analytics?days=7&bloodBankId=${ctx.bankId.toString()}`)
      .set('Authorization', ctx.admin)
      .expect(200);
    expect(own.body.data.totals).toMatchObject({
      unitsIssued: 1,
      unitsExpired: 1,
      expiryWastageRate: 0.5,
    });
    const other = await request(app)
      .get(`/api/dashboard/analytics?days=7&bloodBankId=${ctx.otherBankId.toString()}`)
      .set('Authorization', ctx.admin)
      .expect(200);
    expect(other.body.data.bloodBank.name).toBe('Bank OTH');
    expect(other.body.data.totals).toMatchObject({ unitsIssued: 0, unitsExpired: 0 });
    // Requests stay network-wide.
    expect(other.body.data.totals.requestsRaised).toBe(1);
  });

  it('buckets by week and month for longer periods and validates the period', async () => {
    const quarter = await request(app)
      .get('/api/dashboard/analytics?days=90')
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(quarter.body.data.range.bucket).toBe('week');
    expect(quarter.body.data.series.length).toBeGreaterThanOrEqual(13);
    const year = await request(app)
      .get('/api/dashboard/analytics?days=365')
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(year.body.data.range.bucket).toBe('month');
    await request(app)
      .get('/api/dashboard/analytics?days=45')
      .set('Authorization', ctx.staff)
      .expect(400);
  });
});

describe('hospital dashboard', () => {
  it('shows the hospital its own recent figures only', async () => {
    const [u] = await units(1, 'A+');
    await fulfil(await raise(), u!);
    await raise();

    const res = await request(app)
      .get('/api/dashboard/hospital')
      .set('Authorization', ctx.hospital)
      .expect(200);
    expect(res.body.data).toMatchObject({
      days: 90,
      requestsRaised: 2,
      requestsFulfilled: 1,
      fulfilmentRate: 1,
      unitsReceived: 0,
      awaitingReceipt: 1,
    });

    const other = await request(app)
      .post('/api/auth/register/hospital')
      .send(hospitalPayload())
      .expect(201);
    const empty = await request(app)
      .get('/api/dashboard/hospital')
      .set('Authorization', `Bearer ${other.body.data.accessToken}`)
      .expect(200);
    expect(empty.body.data).toMatchObject({ requestsRaised: 0, awaitingReceipt: 0 });
    await request(app).get('/api/dashboard/hospital').set('Authorization', ctx.staff).expect(403);
  });
});
