import request from 'supertest';
import type { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { runExpirySweep } from '../../src/jobs/expirySweep.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { BloodBankModel } from '../../src/modules/bloodBanks/bloodBank.model.js';
import { DonorProfileModel } from '../../src/modules/donors/donorProfile.model.js';
import { BloodUnitModel } from '../../src/modules/inventory/bloodUnit.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { createUser, donorPayload, login, useMailbox } from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

const bankAddress = { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' };

interface Ctx {
  bankId: string;
  staff: string;
  admin: string;
  donorId: string;
  donorAuth: string;
}
let ctx: Ctx;

async function authFor(role: 'ADMIN' | 'BLOOD_BANK_STAFF', bloodBankId?: Types.ObjectId) {
  const user = await createUser(role, bloodBankId ? { bloodBankId } : {});
  return `Bearer ${(await login(app, user.email)).accessToken}`;
}

beforeEach(async () => {
  const bank = await BloodBankModel.create({
    name: 'Central',
    code: 'CEN',
    address: bankAddress,
    contactPhone: '+91 20 1111 2222',
    contactEmail: 'c@bank.example',
  });
  const donorRes = await request(app)
    .post('/api/auth/register/donor')
    .send(donorPayload({ bloodGroup: 'O+' }))
    .expect(201);
  const donorAuth = `Bearer ${donorRes.body.data.accessToken}`;
  const me = await request(app).get('/api/donors/me').set('Authorization', donorAuth);
  ctx = {
    bankId: bank._id.toString(),
    staff: await authFor('BLOOD_BANK_STAFF', bank._id),
    admin: await authFor('ADMIN'),
    donorId: me.body.data.id,
    donorAuth,
  };
});

const donation = (overrides: Record<string, unknown> = {}) => ({
  donorId: ctx.donorId,
  collectedAt: new Date(Date.now() - 60_000).toISOString(),
  donationType: 'WHOLE_BLOOD',
  volumeMl: 450,
  components: ['PRBC', 'PLASMA'],
  storageLocation: 'Fridge 2',
  ...overrides,
});

async function recordDonation(auth = ctx.staff, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/donations')
    .set('Authorization', auth)
    .send(donation(overrides))
    .expect(201);
  return res.body.data as { id: string; units: { id: string; unitCode: string; status: string }[] };
}

async function releaseDonation(bloodGroup = 'O+') {
  const d = await recordDonation();
  await request(app)
    .post(`/api/donations/${d.id}/start-testing`)
    .set('Authorization', ctx.staff)
    .expect(200);
  await request(app)
    .post(`/api/donations/${d.id}/test-result`)
    .set('Authorization', ctx.staff)
    .send({ result: 'PASSED', bloodGroup })
    .expect(200);
  return d;
}

const transition = (unitId: string, body: object, auth = ctx.staff) =>
  request(app).post(`/api/blood-units/${unitId}/transitions`).set('Authorization', auth).send(body);

describe('recording donations', () => {
  it('creates one unit per component with readable codes, expiry per component and donor stats', async () => {
    const d = await recordDonation();
    expect(d.units).toHaveLength(2);
    expect(d.units.every((u) => u.status === 'COLLECTED')).toBe(true);
    expect(d.units[0]!.unitCode).toMatch(/^CEN-\d{6}-0001$/);

    const units = await BloodUnitModel.find({ donationId: d.id }).lean();
    const plasma = units.find((u) => u.componentType === 'PLASMA')!;
    const prbc = units.find((u) => u.componentType === 'PRBC')!;
    const days = (u: typeof plasma) =>
      Math.round((u.expiryDate.getTime() - u.collectedAt.getTime()) / 86_400_000);
    expect(days(prbc)).toBe(42);
    expect(days(plasma)).toBe(365);
    expect(prbc.volumeMl).toBeNull();

    const donor = await DonorProfileModel.findById(ctx.donorId).lean();
    expect(donor!.donationCount).toBe(1);
    expect(donor!.lastDonationAt).toBeInstanceOf(Date);
    expect(await AuditLogModel.countDocuments({ action: 'DONATION_RECORDED' })).toBe(1);
  });

  it('allocates unique unit codes when donations are recorded concurrently', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => recordDonation()));
    const codes = results.flatMap((r) => r.units.map((u) => u.unitCode));
    expect(new Set(codes).size).toBe(10);
  });

  it('validates components and collection time', async () => {
    const post = (body: Record<string, unknown>) =>
      request(app).post('/api/donations').set('Authorization', ctx.staff).send(donation(body));
    await post({ components: ['WHOLE_BLOOD', 'PLASMA'] }).expect(400);
    await post({ components: ['PRBC', 'PRBC'] }).expect(400);
    await post({ collectedAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(400);
    await post({ collectedAt: new Date(Date.now() - 10 * 86_400_000).toISOString() }).expect(400);
  });

  it('scopes staff to their own blood bank and requires admins to choose one', async () => {
    const other = await BloodBankModel.create({
      name: 'Other',
      code: 'OTH',
      address: bankAddress,
      contactPhone: '+91 20 3333 4444',
      contactEmail: 'o@bank.example',
    });
    await request(app)
      .post('/api/donations')
      .set('Authorization', ctx.staff)
      .send(donation({ bloodBankId: other._id.toString() }))
      .expect(403);
    await request(app)
      .post('/api/donations')
      .set('Authorization', ctx.admin)
      .send(donation())
      .expect(400);
    await recordDonation(ctx.admin, { bloodBankId: ctx.bankId });
  });

  it('refuses donations from rejected donors', async () => {
    await DonorProfileModel.updateOne(
      { _id: ctx.donorId },
      { $set: { verificationStatus: 'REJECTED' } },
    );
    await request(app)
      .post('/api/donations')
      .set('Authorization', ctx.staff)
      .send(donation())
      .expect(409);
  });

  it('is not available to donors or hospitals', async () => {
    await request(app)
      .post('/api/donations')
      .set('Authorization', ctx.donorAuth)
      .send(donation())
      .expect(403);
    await request(app).get('/api/blood-units').set('Authorization', ctx.donorAuth).expect(403);
  });
});

describe('testing', () => {
  it('requires units to be sent to testing before a result', async () => {
    const d = await recordDonation();
    await request(app)
      .post(`/api/donations/${d.id}/test-result`)
      .set('Authorization', ctx.staff)
      .send({ result: 'PASSED', bloodGroup: 'O+' })
      .expect(409);
  });

  it('releases units with the tested group and confirms the donor’s group', async () => {
    const d = await recordDonation();
    const started = await request(app)
      .post(`/api/donations/${d.id}/start-testing`)
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(
      started.body.data.units.every((u: { status: string }) => u.status === 'UNDER_TESTING'),
    ).toBe(true);

    const res = await request(app)
      .post(`/api/donations/${d.id}/test-result`)
      .set('Authorization', ctx.staff)
      .send({ result: 'PASSED', bloodGroup: 'O-' })
      .expect(200);
    expect(
      res.body.data.units.every(
        (u: { status: string; bloodGroup: string }) =>
          u.status === 'AVAILABLE' && u.bloodGroup === 'O-',
      ),
    ).toBe(true);
    const donor = await DonorProfileModel.findById(ctx.donorId).lean();
    expect(donor).toMatchObject({ bloodGroup: 'O-', bloodGroupConfirmed: true });

    const summary = await request(app)
      .get('/api/blood-units/summary')
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(summary.body.data.available).toEqual(
      expect.arrayContaining([
        { bloodGroup: 'O-', componentType: 'PRBC', units: 1 },
        { bloodGroup: 'O-', componentType: 'PLASMA', units: 1 },
      ]),
    );
  });

  it('holds units when the tested group contradicts a confirmed donor group', async () => {
    await DonorProfileModel.updateOne(
      { _id: ctx.donorId },
      { $set: { bloodGroupConfirmed: true } },
    );
    const d = await recordDonation();
    await request(app)
      .post(`/api/donations/${d.id}/start-testing`)
      .set('Authorization', ctx.staff)
      .expect(200);
    const res = await request(app)
      .post(`/api/donations/${d.id}/test-result`)
      .set('Authorization', ctx.staff)
      .send({ result: 'PASSED', bloodGroup: 'A+' })
      .expect(409);
    expect(res.body.message).toMatch(/Investigate/);
    expect(await BloodUnitModel.countDocuments({ donationId: d.id, status: 'UNDER_TESTING' })).toBe(
      2,
    );
  });

  it('discards units that fail testing, and donors never see results', async () => {
    const d = await recordDonation();
    await request(app)
      .post(`/api/donations/${d.id}/start-testing`)
      .set('Authorization', ctx.staff)
      .expect(200);
    await request(app)
      .post(`/api/donations/${d.id}/test-result`)
      .set('Authorization', ctx.staff)
      .send({ result: 'FAILED' })
      .expect(400);
    const res = await request(app)
      .post(`/api/donations/${d.id}/test-result`)
      .set('Authorization', ctx.staff)
      .send({ result: 'FAILED', note: 'Reactive screening result' })
      .expect(200);
    expect(res.body.data.units.every((u: { status: string }) => u.status === 'DISCARDED')).toBe(
      true,
    );

    const own = await request(app)
      .get('/api/donors/me/donations')
      .set('Authorization', ctx.donorAuth)
      .expect(200);
    expect(own.body.data).toHaveLength(1);
    expect(Object.keys(own.body.data[0]).sort()).toEqual([
      'bloodBankName',
      'city',
      'collectedAt',
      'donationType',
      'id',
    ]);
    expect(JSON.stringify(own.body)).not.toMatch(/FAILED|Reactive|DISCARDED|testing/i);
  });
});

describe('unit transitions', () => {
  it('requires a reason to discard and rejects moves outside the lifecycle', async () => {
    const d = await recordDonation();
    const unitId = d.units[0]!.id;
    await transition(unitId, { to: 'AVAILABLE' }).expect(409);
    await transition(unitId, { to: 'DISCARDED' }).expect(400);
    const res = await transition(unitId, {
      to: 'DISCARDED',
      reason: 'Bag damaged during transport',
    }).expect(200);
    expect(res.body.data.status).toBe('DISCARDED');
    expect(res.body.data.statusHistory[0]).toMatchObject({
      from: 'COLLECTED',
      to: 'DISCARDED',
      reason: 'Bag damaged during transport',
    });
  });

  it('lets exactly one of two concurrent changes to the same unit succeed', async () => {
    const d = await releaseDonation();
    const unitId = d.units[0]!.id;
    const results = await Promise.all([
      transition(unitId, { to: 'DISCARDED', reason: 'Seal broken found by nurse A' }),
      transition(unitId, { to: 'DISCARDED', reason: 'Seal broken found by nurse B' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const unit = await BloodUnitModel.findById(unitId).lean();
    expect(unit!.statusHistory.filter((h) => h.to === 'DISCARDED')).toHaveLength(1);
  });

  it('allows the admin-only override to return a unit discarded in error to testing', async () => {
    const d = await recordDonation();
    const unitId = d.units[0]!.id;
    await transition(unitId, { to: 'DISCARDED', reason: 'Recorded against the wrong unit' }).expect(
      200,
    );

    await transition(unitId, {
      to: 'UNDER_TESTING',
      override: true,
      reason: 'Wrong unit discarded',
    }).expect(403);
    await transition(unitId, { to: 'UNDER_TESTING', override: true }, ctx.admin).expect(400);
    const res = await transition(
      unitId,
      { to: 'UNDER_TESTING', override: true, reason: 'Wrong unit discarded' },
      ctx.admin,
    ).expect(200);
    expect(res.body.data).toMatchObject({ status: 'UNDER_TESTING', testingStatus: 'PENDING' });
    expect(await AuditLogModel.countDocuments({ action: 'WORKFLOW_OVERRIDE' })).toBe(1);

    // Overrides can never bypass testing.
    await transition(
      unitId,
      { to: 'AVAILABLE', override: true, reason: 'Skip testing please' },
      ctx.admin,
    ).expect(409);
  });

  it('lets other banks’ staff read but not change a unit', async () => {
    const d = await recordDonation();
    const other = await BloodBankModel.create({
      name: 'Other',
      code: 'OTH',
      address: bankAddress,
      contactPhone: '+91 20 3333 4444',
      contactEmail: 'o@bank.example',
    });
    const outsider = await authFor('BLOOD_BANK_STAFF', other._id);
    const unit = await request(app)
      .get(`/api/blood-units/${d.units[0]!.id}`)
      .set('Authorization', outsider)
      .expect(200);
    expect(unit.body.data.allowedTransitions).toEqual([]);
    await transition(
      d.units[0]!.id,
      { to: 'DISCARDED', reason: 'Not my bank but trying' },
      outsider,
    ).expect(403);
  });

  it('offers the right actions per role', async () => {
    const d = await recordDonation();
    const staffView = await request(app)
      .get(`/api/blood-units/${d.units[0]!.id}`)
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(staffView.body.data.allowedTransitions.map((t: { to: string }) => t.to).sort()).toEqual([
      'DISCARDED',
      'UNDER_TESTING',
    ]);
  });
});

describe('expiry', () => {
  it('excludes expired-by-date units from stock before the sweep, then expires them', async () => {
    const d = await releaseDonation();
    const unitId = d.units[0]!.id;
    await BloodUnitModel.updateOne(
      { _id: unitId },
      { $set: { expiryDate: new Date(Date.now() - 1000) } },
    );

    const summary = await request(app)
      .get('/api/blood-units/summary')
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(summary.body.data.expiredAwaitingSweep).toBe(1);
    const availableUnits = summary.body.data.available.reduce(
      (n: number, r: { units: number }) => n + r.units,
      0,
    );
    expect(availableUnits).toBe(1);

    const listed = await request(app)
      .get(`/api/blood-units/${unitId}`)
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(listed.body.data.expiredByDate).toBe(true);

    expect(await runExpirySweep()).toBe(1);
    expect(await runExpirySweep()).toBe(0);
    const expired = await BloodUnitModel.findById(unitId).lean();
    expect(expired!.status).toBe('EXPIRED');
    expect(
      await AuditLogModel.countDocuments({
        action: 'BLOOD_UNIT_STATUS_CHANGED',
        actorRole: 'SYSTEM',
      }),
    ).toBe(1);

    await transition(unitId, { to: 'DISCARDED', reason: 'Disposed as clinical waste' }).expect(200);
  });

  it('flags units expiring soon and filters by expiry window', async () => {
    const d = await releaseDonation();
    await BloodUnitModel.updateOne(
      { _id: d.units[0]!.id },
      { $set: { expiryDate: new Date(Date.now() + 2 * 86_400_000) } },
    );
    const summary = await request(app)
      .get('/api/blood-units/summary')
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(summary.body.data.expiringSoon).toBe(1);
    const list = await request(app)
      .get('/api/blood-units?expiringWithinDays=3')
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(list.body.data.map((u: { id: string }) => u.id)).toEqual([d.units[0]!.id]);
  });
});
