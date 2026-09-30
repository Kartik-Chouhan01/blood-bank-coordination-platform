import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BloodGroup, ComponentType } from '@bbms/shared';
import { createApp } from '../../src/app.js';
import { runExpirySweep } from '../../src/jobs/expirySweep.js';
import { runOutreachExpirySweep } from '../../src/jobs/outreachExpirySweep.js';
import { runRequestExpirySweep } from '../../src/jobs/requestExpirySweep.js';
import { runReservationHoldSweep } from '../../src/jobs/reservationHoldSweep.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { BloodBankModel } from '../../src/modules/bloodBanks/bloodBank.model.js';
import { DonorProfileModel } from '../../src/modules/donors/donorProfile.model.js';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model.js';
import { BloodUnitModel } from '../../src/modules/inventory/bloodUnit.model.js';
import { AllocationModel } from '../../src/modules/matching/allocation.model.js';
import { DonorOutreachModel } from '../../src/modules/matching/donorOutreach.model.js';
import { BloodRequestModel } from '../../src/modules/requests/bloodRequest.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import {
  createUser,
  donorPayload,
  hospitalPayload,
  login,
  useMailbox,
} from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const hoursFromNow = (h: number) => new Date(Date.now() + h * HOUR);
const bankAddress = { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' };
/** Hospital location (Pune centre); donors are placed relative to it. */
const PUNE: [number, number] = [73.86, 18.52];

interface Ctx {
  bankId: Types.ObjectId;
  otherBankId: Types.ObjectId;
  staff: string;
  otherStaff: string;
  admin: string;
  hospital: string;
  hospitalId: Types.ObjectId;
}
let ctx: Ctx;

async function bank(code: string) {
  return BloodBankModel.create({
    name: `Bank ${code}`,
    code,
    address: bankAddress,
    contactPhone: '+91 20 1111 2222',
    contactEmail: `${code.toLowerCase()}@bank.example`,
  });
}

async function staffAuth(role: 'ADMIN' | 'BLOOD_BANK_STAFF', bloodBankId?: Types.ObjectId) {
  const user = await createUser(role, bloodBankId ? { bloodBankId } : {});
  return `Bearer ${(await login(app, user.email)).accessToken}`;
}

async function hospitalAuth() {
  const res = await request(app)
    .post('/api/auth/register/hospital')
    .send(hospitalPayload())
    .expect(201);
  const hospital = await HospitalModel.findOneAndUpdate(
    { userId: res.body.data.user.id },
    { $set: { verificationStatus: 'VERIFIED', location: { type: 'Point', coordinates: PUNE } } },
    { returnDocument: 'after' },
  ).lean();
  return { auth: `Bearer ${res.body.data.accessToken}`, hospitalId: hospital!._id };
}

beforeEach(async () => {
  const [main, other] = await Promise.all([bank('CEN'), bank('OTH')]);
  const h = await hospitalAuth();
  ctx = {
    bankId: main._id,
    otherBankId: other._id,
    staff: await staffAuth('BLOOD_BANK_STAFF', main._id),
    otherStaff: await staffAuth('BLOOD_BANK_STAFF', other._id),
    admin: await staffAuth('ADMIN'),
    hospital: h.auth,
    hospitalId: h.hospitalId,
  };
});

let unitSeq = 0;
/** Inserts a usable (tested, available) unit directly — donation workflows are tested elsewhere. */
async function unit(
  bloodGroup: BloodGroup,
  opts: {
    component?: ComponentType;
    expiresInDays?: number;
    bankId?: Types.ObjectId;
    status?: 'AVAILABLE' | 'UNDER_TESTING';
  } = {},
) {
  unitSeq += 1;
  const created = await BloodUnitModel.create({
    unitCode: `CEN-260101-${String(unitSeq).padStart(4, '0')}`,
    donationId: new Types.ObjectId(),
    donorId: new Types.ObjectId(),
    bloodBankId: opts.bankId ?? ctx.bankId,
    bloodGroup,
    componentType: opts.component ?? 'PRBC',
    collectedAt: new Date(Date.now() - DAY),
    expiryDate: new Date(Date.now() + (opts.expiresInDays ?? 20) * DAY),
    status: opts.status ?? 'AVAILABLE',
    testingStatus: opts.status === 'UNDER_TESTING' ? 'PENDING' : 'PASSED',
  });
  return created._id.toString();
}

async function raise(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/requests')
    .set('Authorization', ctx.hospital)
    .send({
      bloodGroup: 'A+',
      componentType: 'PRBC',
      unitsRequested: 2,
      urgency: 'ROUTINE',
      requiredBy: hoursFromNow(24).toISOString(),
      reasonCategory: 'SCHEDULED_PROCEDURE',
      ...overrides,
    })
    .expect(201);
  return res.body.data.id as string;
}

async function approved(overrides: Record<string, unknown> = {}) {
  const id = await raise(overrides);
  await request(app)
    .post(`/api/requests/${id}/review`)
    .set('Authorization', ctx.staff)
    .send({ decision: 'APPROVE' })
    .expect(200);
  return id;
}

const reserve = (requestId: string, unitIds: string[], auth = ctx.staff) =>
  request(app)
    .post(`/api/matching/requests/${requestId}/allocations`)
    .set('Authorization', auth)
    .send({ unitIds });

const allocationsOf = async (requestId: string) =>
  AllocationModel.find({ requestId }).sort({ createdAt: 1 }).lean();

// ─── Inventory candidates ────────────────────────────────────────────────────

describe('inventory candidates', () => {
  it('ranks exact group first, conserves O− and pre-selects only the shortfall', async () => {
    const oNeg = await unit('O-', { expiresInDays: 3 });
    const aLate = await unit('A+', { expiresInDays: 30 });
    const aSoon = await unit('A+', { expiresInDays: 5 });
    const oPos = await unit('O+', { expiresInDays: 2 });
    await unit('B+'); // incompatible
    await unit('A+', { component: 'PLASMA' }); // wrong component
    await unit('A+', { status: 'UNDER_TESTING' }); // not released
    await unit('A+', { expiresInDays: 0.5 }); // expires before required-by
    const id = await approved();

    const res = await request(app)
      .get(`/api/matching/requests/${id}/inventory`)
      .set('Authorization', ctx.staff)
      .expect(200);
    const data = res.body.data;
    expect(data.shortfall).toBe(2);
    expect(data.compatibleGroups).toEqual(['A+', 'O+', 'A-', 'O-']);
    expect(data.candidates.map((c: { unitId: string }) => c.unitId)).toEqual([
      aSoon,
      aLate,
      oPos,
      oNeg,
    ]);
    expect(data.candidates[2].groupMatch).toBe('COMPATIBLE');
    expect(data.preselectedUnitIds).toEqual([aSoon, aLate]);
    // Nothing is reserved just by looking.
    expect(await AllocationModel.countDocuments()).toBe(0);
  });

  it("shows other banks' units but only pre-selects the staff member's own", async () => {
    const other = await unit('A+', { bankId: ctx.otherBankId, expiresInDays: 2 });
    const own = await unit('A+', { expiresInDays: 9 });
    const id = await approved({ unitsRequested: 1 });
    const res = await request(app)
      .get(`/api/matching/requests/${id}/inventory`)
      .set('Authorization', ctx.staff)
      .expect(200);
    const byId = Object.fromEntries(
      res.body.data.candidates.map((c: { unitId: string; canReserve: boolean }) => [
        c.unitId,
        c.canReserve,
      ]),
    );
    expect(byId).toEqual({ [other]: false, [own]: true });
    expect(res.body.data.preselectedUnitIds).toEqual([own]);
  });

  it('is staff-only', async () => {
    const id = await approved();
    await request(app)
      .get(`/api/matching/requests/${id}/inventory`)
      .set('Authorization', ctx.hospital)
      .expect(403);
  });
});

// ─── Reserve / release / issue / receive ─────────────────────────────────────

describe('reserving units', () => {
  it('reserves in steps, moving the request through partial to full allocation', async () => {
    const [u1, u2] = [await unit('A+'), await unit('O+')];
    const id = await approved();

    const first = await reserve(id, [u1]).expect(201);
    expect(first.body.data).toMatchObject({ status: 'PARTIALLY_ALLOCATED', unitsAllocated: 1 });
    const second = await reserve(id, [u2]).expect(201);
    expect(second.body.data).toMatchObject({ status: 'ALLOCATED', unitsAllocated: 2 });
    expect(second.body.data.allowedActions).not.toContain('ALLOCATE');
    expect(second.body.data.allocations).toHaveLength(2);
    expect(second.body.data.allocations[0]).toMatchObject({
      status: 'RESERVED',
      canIssue: true,
      canRelease: true,
    });

    const units = await BloodUnitModel.find({ _id: { $in: [u1, u2] } }).lean();
    expect(units.every((u) => u.status === 'RESERVED' && u.currentAllocationId)).toBe(true);
    expect(await AuditLogModel.countDocuments({ action: 'UNITS_RESERVED' })).toBe(2);
  });

  it('refuses more units than needed, incompatible or unusable units', async () => {
    const id = await approved({ unitsRequested: 1 });
    const [a, b] = [await unit('A+'), await unit('A+')];
    await reserve(id, [a, b]).expect(409);

    const incompatible = await reserve(id, [await unit('B+')]).expect(409);
    expect(incompatible.body.errorCode).toBe('UNIT_NOT_AVAILABLE');
    await reserve(id, [await unit('A+', { status: 'UNDER_TESTING' })]).expect(409);
    await reserve(id, [await unit('A+', { expiresInDays: 0.5 })]).expect(409);
    await reserve(id, [new Types.ObjectId().toString()]).expect(409);
    expect(await AllocationModel.countDocuments()).toBe(0);
    expect((await BloodUnitModel.findById(a).lean())!.status).toBe('AVAILABLE');
  });

  it('refuses requests that are not approved, and other banks’ units', async () => {
    const pending = await raise();
    await reserve(pending, [await unit('A+')]).expect(409);

    const id = await approved();
    await reserve(id, [await unit('A+', { bankId: ctx.otherBankId })]).expect(403);
    // Administrators may reserve from any bank.
    await reserve(id, [await unit('A+', { bankId: ctx.otherBankId })], ctx.admin).expect(201);
  });

  it('never double-books a unit reserved concurrently for two requests', async () => {
    const shared = await unit('A+');
    const [r1, r2] = [await approved(), await approved()];
    const results = await Promise.all([reserve(r1, [shared]), reserve(r2, [shared])]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await AllocationModel.countDocuments({ unitId: shared, status: 'RESERVED' })).toBe(1);
    const requests = await BloodRequestModel.find({ _id: { $in: [r1, r2] } }).lean();
    expect(requests.map((r) => r.unitsAllocated).sort()).toEqual([0, 1]);
  });

  it('never over-allocates a request when staff reserve different units at once', async () => {
    const id = await approved({ unitsRequested: 1 });
    const [a, b] = [await unit('A+'), await unit('A+')];
    const results = await Promise.all([reserve(id, [a]), reserve(id, [b], ctx.admin)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const req = await BloodRequestModel.findById(id).lean();
    expect(req).toMatchObject({ unitsAllocated: 1, status: 'ALLOCATED' });
    expect(await BloodUnitModel.countDocuments({ status: 'RESERVED' })).toBe(1);
  });

  it('is blocked for hospitals and donors', async () => {
    const id = await approved();
    await reserve(id, [await unit('A+')], ctx.hospital).expect(403);
  });
});

describe('releasing and issuing', () => {
  it('releases with a reason, returning the unit to stock and the request to approved', async () => {
    const u = await unit('A+');
    const id = await approved({ unitsRequested: 1 });
    await reserve(id, [u]).expect(201);
    const [allocation] = await allocationsOf(id);

    await request(app)
      .post(`/api/matching/allocations/${allocation!._id}/release`)
      .set('Authorization', ctx.staff)
      .send({})
      .expect(400);
    const res = await request(app)
      .post(`/api/matching/allocations/${allocation!._id}/release`)
      .set('Authorization', ctx.staff)
      .send({ reason: 'Selected the wrong unit' })
      .expect(200);
    expect(res.body.data).toMatchObject({ status: 'APPROVED', unitsAllocated: 0 });
    expect(res.body.data.allowedActions).toContain('ALLOCATE');
    expect(await BloodUnitModel.findById(u).lean()).toMatchObject({
      status: 'AVAILABLE',
      currentAllocationId: null,
    });
    expect((await AllocationModel.findById(allocation!._id).lean())!.status).toBe('RELEASED');
    // The unit can be reserved again (the unique guard covers live allocations only).
    await reserve(id, [u]).expect(201);
  });

  it("stops staff releasing or issuing another bank's reservation", async () => {
    const id = await approved({ unitsRequested: 1 });
    await reserve(id, [await unit('A+')]).expect(201);
    const [allocation] = await allocationsOf(id);
    await request(app)
      .post(`/api/matching/allocations/${allocation!._id}/issue`)
      .set('Authorization', ctx.otherStaff)
      .expect(403);
  });

  it('issues units, fulfils the request, and completes it when the hospital confirms receipt', async () => {
    const [u1, u2] = [await unit('A+'), await unit('A+')];
    const id = await approved();
    await reserve(id, [u1, u2]).expect(201);
    const allocations = await allocationsOf(id);
    const issue = (allocationId: Types.ObjectId) =>
      request(app)
        .post(`/api/matching/allocations/${allocationId}/issue`)
        .set('Authorization', ctx.staff);

    const partly = await issue(allocations[0]!._id).expect(200);
    expect(partly.body.data).toMatchObject({ status: 'ALLOCATED', unitsIssued: 1 });
    await issue(allocations[0]!._id).expect(409); // already issued
    const full = await issue(allocations[1]!._id).expect(200);
    expect(full.body.data).toMatchObject({ status: 'FULFILLED', unitsIssued: 2 });

    const hospitalView = await request(app)
      .get(`/api/requests/${id}`)
      .set('Authorization', ctx.hospital)
      .expect(200);
    expect(hospitalView.body.data.allowedActions).toContain('CONFIRM_RECEIPT');
    expect(hospitalView.body.data.stock).toBeNull();
    expect(hospitalView.body.data.allocations[0]).toMatchObject({
      status: 'ISSUED',
      reservedBy: null,
      canIssue: false,
    });

    await request(app)
      .post(`/api/requests/${id}/confirm-receipt`)
      .set('Authorization', ctx.staff)
      .expect(403);
    const done = await request(app)
      .post(`/api/requests/${id}/confirm-receipt`)
      .set('Authorization', ctx.hospital)
      .expect(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(await BloodUnitModel.countDocuments({ status: 'RECEIVED' })).toBe(2);
    await request(app)
      .post(`/api/requests/${id}/confirm-receipt`)
      .set('Authorization', ctx.hospital)
      .expect(409);
  });

  it('refuses to issue a unit that has reached its expiry date', async () => {
    const u = await unit('A+');
    const id = await approved({ unitsRequested: 1 });
    await reserve(id, [u]).expect(201);
    await BloodUnitModel.updateOne({ _id: u }, { $set: { expiryDate: new Date(Date.now() - 1) } });
    const [allocation] = await allocationsOf(id);
    const res = await request(app)
      .post(`/api/matching/allocations/${allocation!._id}/issue`)
      .set('Authorization', ctx.staff)
      .expect(409);
    expect(res.body.errorCode).toBe('UNIT_NOT_AVAILABLE');
  });

  it("does not let another hospital see or confirm a request's units", async () => {
    const id = await approved({ unitsRequested: 1 });
    const other = await hospitalAuth();
    await request(app)
      .post(`/api/requests/${id}/confirm-receipt`)
      .set('Authorization', other.auth)
      .expect(404);
  });
});

describe('closing requests and jobs release reservations', () => {
  it('cancelling a request returns its reserved units to stock', async () => {
    const u = await unit('A+');
    const id = await approved();
    await reserve(id, [u]).expect(201);
    const res = await request(app)
      .post(`/api/requests/${id}/cancel`)
      .set('Authorization', ctx.hospital)
      .send({ reason: 'Procedure postponed' })
      .expect(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED', unitsAllocated: 0 });
    expect((await BloodUnitModel.findById(u).lean())!.status).toBe('AVAILABLE');
    expect((await allocationsOf(id))[0]!.releaseReason).toMatch(/cancelled/);
  });

  it('releases reservations whose hold expired', async () => {
    const u = await unit('A+');
    const id = await approved({ unitsRequested: 1 });
    await reserve(id, [u]).expect(201);
    expect(await runReservationHoldSweep()).toBe(0);
    expect(await runReservationHoldSweep(hoursFromNow(25))).toBe(1);
    expect((await BloodUnitModel.findById(u).lean())!.status).toBe('AVAILABLE');
    expect((await BloodRequestModel.findById(id).lean())!.status).toBe('APPROVED');
    const audit = await AuditLogModel.findOne({ action: 'ALLOCATION_RELEASED' }).lean();
    expect(audit!.actorRole).toBe('SYSTEM');
  });

  it('expires a reserved unit and releases it from its request in one step', async () => {
    const u = await unit('A+', { expiresInDays: 2 });
    const id = await approved({ unitsRequested: 1 });
    await reserve(id, [u]).expect(201);
    expect(await runExpirySweep(hoursFromNow(72))).toBe(1);
    expect(await BloodUnitModel.findById(u).lean()).toMatchObject({
      status: 'EXPIRED',
      currentAllocationId: null,
    });
    expect(await BloodRequestModel.findById(id).lean()).toMatchObject({
      status: 'APPROVED',
      unitsAllocated: 0,
    });
  });

  it('expiring a request releases its reservations', async () => {
    const u = await unit('A+');
    const id = await approved({ requiredBy: hoursFromNow(1).toISOString() });
    await reserve(id, [u]).expect(201);
    expect(await runRequestExpirySweep(hoursFromNow(10))).toBe(1);
    expect((await BloodRequestModel.findById(id).lean())!.status).toBe('EXPIRED');
    expect((await BloodUnitModel.findById(u).lean())!.status).toBe('AVAILABLE');
  });
});

// ─── Donor outreach ──────────────────────────────────────────────────────────

/** Registers a donor and sets matching-relevant fields directly. */
async function donor(
  bloodGroup: BloodGroup,
  overrides: {
    kmNorth?: number | null;
    verified?: boolean;
    availabilityStatus?: string;
    lastDonationDaysAgo?: number;
    emergencyOnly?: boolean;
    city?: string;
  } = {},
) {
  const res = await request(app)
    .post('/api/auth/register/donor')
    .send(donorPayload({ bloodGroup, city: overrides.city ?? 'Pune' }))
    .expect(201);
  const km = overrides.kmNorth === undefined ? 2 : overrides.kmNorth;
  const set: Record<string, unknown> = {
    verificationStatus: overrides.verified === false ? 'PENDING' : 'VERIFIED',
    availabilityStatus: overrides.availabilityStatus ?? 'AVAILABLE',
    'notificationPreferences.emergencyOnly': overrides.emergencyOnly ?? false,
    ...(overrides.lastDonationDaysAgo !== undefined && {
      lastDonationAt: new Date(Date.now() - overrides.lastDonationDaysAgo * DAY),
    }),
    ...(km !== null && {
      'location.point': { type: 'Point', coordinates: [PUNE[0], PUNE[1] + km / 111] },
    }),
  };
  const profile = await DonorProfileModel.findOneAndUpdate(
    { userId: res.body.data.user.id },
    { $set: set },
    { returnDocument: 'after' },
  ).lean();
  return {
    id: profile!._id.toString(),
    auth: `Bearer ${res.body.data.accessToken}`,
    email: res.body.data.user.email as string,
  };
}

const findDonors = (requestId: string) =>
  request(app).get(`/api/matching/requests/${requestId}/donors`).set('Authorization', ctx.staff);

describe('donor search', () => {
  it('applies every hard filter and never exposes identity before contact', async () => {
    const near = await donor('A+', { kmNorth: 1 });
    const substitute = await donor('O-', { kmNorth: 3 });
    const noLocation = await donor('A+', { kmNorth: null });
    await donor('B+'); // incompatible
    await donor('A+', { verified: false });
    await donor('A+', { availabilityStatus: 'DO_NOT_CONTACT' });
    await donor('A+', { lastDonationDaysAgo: 10 }); // contact interval not elapsed
    await donor('A+', { emergencyOnly: true }); // routine request
    await donor('A+', { kmNorth: 200 }); // outside the radius
    await donor('A+', { kmNorth: null, city: 'Mumbai' }); // other city, no location
    const id = await approved();

    const res = await findDonors(id).expect(200);
    const data = res.body.data;
    expect(data).toMatchObject({
      shortfall: 2,
      suggestedCount: 6,
      radiusKm: 25,
      searchedBy: 'DISTANCE',
      label: 'Potential donor based on system criteria',
    });
    const ids = data.candidates.map((c: { donorId: string }) => c.donorId);
    expect(ids.sort()).toEqual([near.id, substitute.id, noLocation.id].sort());
    expect(data.candidates[0].donorId).toBe(near.id);
    for (const candidate of data.candidates) {
      expect(Object.keys(candidate).sort()).toEqual(
        [
          'approxDistanceKm',
          'area',
          'availability',
          'bloodGroup',
          'bloodGroupConfirmed',
          'city',
          'donorId',
          'groupMatch',
          'score',
        ].sort(),
      );
    }
  });

  it('includes emergency-only donors and searches wider for emergencies', async () => {
    const emergencyOnly = await donor('A+', { emergencyOnly: true, kmNorth: 40 });
    const id = await raise({ urgency: 'EMERGENCY', unitsRequested: 1 });
    // Auto-outreach already contacted them because there is no stock.
    const outreach = await DonorOutreachModel.find({ requestId: id }).lean();
    expect(outreach.map((o) => o.donorId.toString())).toEqual([emergencyOnly.id]);
    expect(outreach[0]!.notifiedBy).toBeNull();
    expect((await BloodRequestModel.findById(id).lean())!.outreachStatus).toBe('ACTIVE');
  });

  it('does not contact donors automatically when stock covers an emergency', async () => {
    await donor('A+');
    await unit('A+');
    const id = await raise({ urgency: 'EMERGENCY', unitsRequested: 1 });
    expect(await DonorOutreachModel.countDocuments({ requestId: id })).toBe(0);
  });

  it('respects the weekly contact cap', async () => {
    const d = await donor('A+');
    await DonorProfileModel.updateOne(
      { _id: d.id },
      { $set: { 'notificationPreferences.maxContactsPerWeek': 1 } },
    );
    await DonorOutreachModel.create({
      requestId: new Types.ObjectId(),
      donorId: d.id,
      score: 50,
      status: 'DECLINED',
      notifiedAt: new Date(Date.now() - DAY),
    });
    const id = await approved();
    expect((await findDonors(id).expect(200)).body.data.candidates).toEqual([]);
  });

  it('refuses searches for pending or fully allocated requests', async () => {
    await findDonors(await raise()).expect(409);
    const id = await approved({ unitsRequested: 1 });
    await reserve(id, [await unit('A+')]).expect(201);
    await findDonors(id).expect(409);
  });
});

describe('outreach and donor responses', () => {
  it('contacts chosen donors once, and reveals contact only after an interested reply', async () => {
    const d1 = await donor('A+');
    const d2 = await donor('A+');
    const id = await approved();
    const contact = (donorIds: string[]) =>
      request(app)
        .post(`/api/matching/requests/${id}/outreach`)
        .set('Authorization', ctx.staff)
        .send({ donorIds });

    const started = await contact([d1.id, d2.id]).expect(201);
    expect(started.body.data.outreach).toHaveLength(2);
    expect(started.body.data.outreach.every((o: { contact: unknown }) => o.contact === null)).toBe(
      true,
    );
    await contact([d1.id]).expect(409); // already contacted
    expect(await AuditLogModel.countDocuments({ action: 'DONOR_OUTREACH_STARTED' })).toBe(1);

    // The donor sees their own request for help, without hospital details.
    const mine = await request(app)
      .get('/api/donor-outreach/mine')
      .set('Authorization', d1.auth)
      .expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({
      status: 'NOTIFIED',
      bloodGroupNeeded: 'A+',
      city: 'Pune',
      canRespond: true,
    });
    expect(JSON.stringify(mine.body.data)).not.toMatch(/hospital|Hospital/);

    const outreachId = mine.body.data[0].id;
    // Another donor cannot answer it.
    await request(app)
      .post(`/api/donor-outreach/${outreachId}/respond`)
      .set('Authorization', d2.auth)
      .send({ response: 'INTERESTED' })
      .expect(404);
    const answered = await request(app)
      .post(`/api/donor-outreach/${outreachId}/respond`)
      .set('Authorization', d1.auth)
      .send({ response: 'INTERESTED' })
      .expect(200);
    expect(answered.body.data[0].status).toBe('INTERESTED');

    const staffView = await request(app)
      .get(`/api/matching/requests/${id}/outreach`)
      .set('Authorization', ctx.staff)
      .expect(200);
    expect(staffView.body.data.counts).toEqual({ INTERESTED: 1, NOTIFIED: 1 });
    const interested = staffView.body.data.outreach.find(
      (o: { status: string }) => o.status === 'INTERESTED',
    );
    expect(interested.contact).toMatchObject({ email: d1.email });
    expect(
      staffView.body.data.outreach.find((o: { status: string }) => o.status === 'NOTIFIED').contact,
    ).toBeNull();
  });

  it('refuses donors that no longer match and staff-only access', async () => {
    const d = await donor('A+');
    const id = await approved();
    await DonorProfileModel.updateOne({ _id: d.id }, { $set: { verificationStatus: 'SUSPENDED' } });
    await request(app)
      .post(`/api/matching/requests/${id}/outreach`)
      .set('Authorization', ctx.staff)
      .send({ donorIds: [d.id] })
      .expect(409);
    await request(app)
      .get(`/api/matching/requests/${id}/outreach`)
      .set('Authorization', d.auth)
      .expect(403);
    await request(app).get('/api/donor-outreach/mine').set('Authorization', ctx.staff).expect(403);
  });

  it('closes unanswered outreach when the request closes, and stops responses', async () => {
    const d = await donor('A+');
    const id = await approved();
    await request(app)
      .post(`/api/matching/requests/${id}/outreach`)
      .set('Authorization', ctx.staff)
      .send({ donorIds: [d.id] })
      .expect(201);
    await request(app)
      .post(`/api/requests/${id}/cancel`)
      .set('Authorization', ctx.staff)
      .send({ reason: 'Covered by another bank' })
      .expect(200);

    const mine = await request(app)
      .get('/api/donor-outreach/mine')
      .set('Authorization', d.auth)
      .expect(200);
    expect(mine.body.data[0]).toMatchObject({ open: false, canRespond: false });
    await request(app)
      .post(`/api/donor-outreach/${mine.body.data[0].id}/respond`)
      .set('Authorization', d.auth)
      .send({ response: 'INTERESTED' })
      .expect(409);

    expect(await runOutreachExpirySweep()).toBe(1);
    expect((await DonorOutreachModel.findOne().lean())!.status).toBe('NO_RESPONSE');
    expect((await BloodRequestModel.findById(id).lean())!.outreachStatus).toBe('CLOSED');
  });
});
