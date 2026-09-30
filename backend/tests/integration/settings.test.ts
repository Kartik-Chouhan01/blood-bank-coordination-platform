import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS, type BloodGroup } from '@bbms/shared';
import { createApp } from '../../src/app.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { BloodBankModel } from '../../src/modules/bloodBanks/bloodBank.model.js';
import { DonorOutreachModel } from '../../src/modules/matching/donorOutreach.model.js';
import { DonorProfileModel } from '../../src/modules/donors/donorProfile.model.js';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model.js';
import { BloodUnitModel } from '../../src/modules/inventory/bloodUnit.model.js';
import { NotificationModel } from '../../src/modules/notifications/notification.model.js';
import { UserModel } from '../../src/modules/users/user.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import {
  PASSWORD,
  createUser,
  donorPayload,
  hospitalPayload,
  login,
  useMailbox,
} from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

let admin: string;
let staff: string;
let hospital: string;
let bankId: Types.ObjectId;

beforeEach(async () => {
  const bank = await BloodBankModel.create({
    name: 'Central',
    code: 'CEN',
    address: { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' },
    contactPhone: '+91 20 1111 2222',
    contactEmail: 'c@bank.example',
  });
  bankId = bank._id;
  admin = `Bearer ${(await login(app, (await createUser('ADMIN')).email)).accessToken}`;
  staff = `Bearer ${(await login(app, (await createUser('BLOOD_BANK_STAFF', { bloodBankId: bankId })).email)).accessToken}`;
  const h = await request(app)
    .post('/api/auth/register/hospital')
    .send(hospitalPayload())
    .expect(201);
  await HospitalModel.updateOne(
    { userId: h.body.data.user.id },
    { $set: { verificationStatus: 'VERIFIED' } },
  );
  hospital = `Bearer ${h.body.data.accessToken}`;
});

const patch = (body: object, auth = admin) =>
  request(app).patch('/api/settings').set('Authorization', auth).send(body);

let seq = 0;
async function unit(bloodGroup: BloodGroup) {
  const u = await BloodUnitModel.create({
    unitCode: `CEN-260101-${String((seq += 1)).padStart(4, '0')}`,
    donationId: new Types.ObjectId(),
    donorId: new Types.ObjectId(),
    bloodBankId: bankId,
    bloodGroup,
    componentType: 'PRBC',
    collectedAt: new Date(Date.now() - 86_400_000),
    expiryDate: new Date(Date.now() + 20 * 86_400_000),
    status: 'AVAILABLE',
    testingStatus: 'PASSED',
  });
  return u._id.toString();
}

async function approvedRequest(bloodGroup: BloodGroup, unitsRequested: number) {
  const res = await request(app)
    .post('/api/requests')
    .set('Authorization', hospital)
    .send({
      bloodGroup,
      componentType: 'PRBC',
      unitsRequested,
      urgency: 'URGENT',
      requiredBy: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      reasonCategory: 'SCHEDULED_PROCEDURE',
    })
    .expect(201);
  await request(app)
    .post(`/api/requests/${res.body.data.id}/review`)
    .set('Authorization', staff)
    .send({ decision: 'APPROVE' })
    .expect(200);
  return res.body.data.id as string;
}

describe('system settings', () => {
  it('lists every setting with its default, for administrators only', async () => {
    const res = await request(app).get('/api/settings').set('Authorization', admin).expect(200);
    expect(res.body.data.map((s: { key: string }) => s.key)).toEqual(SETTING_KEYS);
    expect(
      res.body.data.find((s: { key: string }) => s.key === 'donorContactIntervalDays'),
    ).toMatchObject({
      value: 90,
      defaultValue: 90,
      updatedBy: null,
    });
    await request(app).get('/api/settings').set('Authorization', staff).expect(403);
    await patch({ changes: { reservationHoldHours: 4 }, reason: 'Short holds' }, staff).expect(403);
  });

  it('requires a reason, validates values and rejects unknown keys', async () => {
    await patch({ changes: { reservationHoldHours: 4 } }).expect(400);
    await patch({ changes: { reservationHoldHours: 0 }, reason: 'Testing limits' }).expect(400);
    await patch({ changes: { reservationHoldHours: 4.5 }, reason: 'Testing limits' }).expect(400);
    await patch({ changes: { compatibilityTable: 'anything' }, reason: 'Testing limits' }).expect(
      400,
    );
    await patch({ changes: {}, reason: 'Testing limits' }).expect(400);
    const res = await patch({
      changes: { publicStockLowBelow: 20, publicStockGoodFrom: 10 },
      reason: 'Testing limits',
    }).expect(400);
    expect(res.body.details[0].message).toMatch(/above the "Low" threshold/);
  });

  it('applies a change immediately and audits each setting with the reason', async () => {
    const res = await patch({
      changes: { donorContactIntervalDays: 120, reservationHoldHours: 6 },
      reason: 'New regional guidance',
    }).expect(200);
    expect(
      res.body.data.find((s: { key: string }) => s.key === 'donorContactIntervalDays'),
    ).toMatchObject({
      value: 120,
      defaultValue: 90,
      updatedBy: { name: 'Test ADMIN' },
    });

    const donor = await request(app)
      .post('/api/auth/register/donor')
      .send(donorPayload())
      .expect(201);
    const me = await request(app)
      .get('/api/donors/me')
      .set('Authorization', `Bearer ${donor.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.contactIntervalDays).toBe(120);

    const audits = await AuditLogModel.find({ action: 'SETTINGS_UPDATED' }).lean();
    expect(audits).toHaveLength(2);
    expect(audits.map((a) => a.reason)).toEqual(['New regional guidance', 'New regional guidance']);
    expect(audits.find((a) => 'reservationHoldHours' in (a.after ?? {}))).toMatchObject({
      before: { reservationHoldHours: 24 },
      after: { reservationHoldHours: 6 },
    });
    // Re-saving the same value is not a change.
    await patch({ changes: { reservationHoldHours: 6 }, reason: 'Again' }).expect(200);
    expect(await AuditLogModel.countDocuments({ action: 'SETTINGS_UPDATED' })).toBe(2);
  });

  it('can switch off substitutes: only the exact group is offered or reservable', async () => {
    const exact = await unit('A+');
    const substitute = await unit('O+');
    const id = await approvedRequest('A+', 2);
    await patch({ changes: { allowCompatibleSubstitutes: false }, reason: 'Local policy' }).expect(
      200,
    );

    const res = await request(app)
      .get(`/api/matching/requests/${id}/inventory`)
      .set('Authorization', staff)
      .expect(200);
    expect(res.body.data.compatibleGroups).toEqual(['A+']);
    expect(res.body.data.candidates.map((c: { unitId: string }) => c.unitId)).toEqual([exact]);
    await request(app)
      .post(`/api/matching/requests/${id}/allocations`)
      .set('Authorization', staff)
      .send({ unitIds: [substitute] })
      .expect(409);
  });

  it('conserves universal donor units in the suggested selection unless nothing else fits', async () => {
    await unit('O-');
    const oPos = await unit('O+');
    const id = await approvedRequest('A+', 1);
    const inventory = () =>
      request(app).get(`/api/matching/requests/${id}/inventory`).set('Authorization', staff);

    expect((await inventory().expect(200)).body.data.preselectedUnitIds).toEqual([oPos]);
    await patch({ changes: { conserveUniversalDonors: false }, reason: 'Surplus of O-' }).expect(
      200,
    );
    // Ranking alone still puts O− last, so O+ remains the first suggestion.
    expect((await inventory().expect(200)).body.data.preselectedUnitIds).toEqual([oPos]);

    await BloodUnitModel.deleteOne({ _id: oPos });
    await patch({ changes: { conserveUniversalDonors: true }, reason: 'Back to default' }).expect(
      200,
    );
    // With nothing else available, the O− unit is suggested after all.
    expect((await inventory().expect(200)).body.data.preselectedUnitIds).toHaveLength(1);
  });
});

describe('account deletion', () => {
  async function donor() {
    const payload = donorPayload();
    const res = await request(app).post('/api/auth/register/donor').send(payload).expect(201);
    return {
      auth: `Bearer ${res.body.data.accessToken}`,
      userId: res.body.data.user.id as string,
      email: payload.email as string,
    };
  }
  const remove = (auth: string, body: object) =>
    request(app).post('/api/users/me/delete').set('Authorization', auth).send(body);

  it('anonymises the donor, ends every session and stops all contact', async () => {
    const d = await donor();
    const profile = await DonorProfileModel.findOneAndUpdate(
      { userId: d.userId },
      { $set: { 'location.point': { type: 'Point', coordinates: [73.86, 18.52] } } },
      { returnDocument: 'after' },
    ).lean();
    await DonorOutreachModel.create({
      requestId: new Types.ObjectId(),
      donorId: profile!._id,
      score: 50,
      status: 'NOTIFIED',
      notifiedAt: new Date(),
    });
    await NotificationModel.create({
      recipientId: d.userId,
      type: 'DONOR_OUTREACH',
      title: 'x',
      message: 'y',
    });

    await remove(d.auth, { password: 'wrong-password-1', confirm: 'DELETE' }).expect(400);
    await remove(d.auth, { password: PASSWORD, confirm: 'delete' }).expect(400);
    await remove(d.auth, { password: PASSWORD, confirm: 'DELETE' }).expect(200);

    const user = await UserModel.findById(d.userId).lean();
    expect(user).toMatchObject({
      name: 'Deleted donor',
      accountStatus: 'DEACTIVATED',
      phone: 'Removed',
    });
    expect(user!.email).not.toBe(d.email);
    const after = await DonorProfileModel.findById(profile!._id).lean();
    expect(after!.location).toMatchObject({ city: 'Removed', area: 'Removed' });
    expect(after!.location.point).toBeUndefined();
    expect(after!.dateOfBirth.toISOString()).toBe('1990-01-01T00:00:00.000Z');
    expect(after!.availabilityStatus).toBe('DO_NOT_CONTACT');
    expect(after!.bloodGroup).toBe('O+');
    expect((await DonorOutreachModel.findOne({ donorId: profile!._id }).lean())!.status).toBe(
      'DECLINED',
    );
    expect(await NotificationModel.countDocuments({ recipientId: d.userId })).toBe(0);

    // The old session and the old credentials are both dead.
    await request(app).get('/api/auth/me').set('Authorization', d.auth).expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: d.email, password: PASSWORD })
      .expect(401);

    const audit = await AuditLogModel.findOne({ action: 'ACCOUNT_DELETED' }).lean();
    expect(JSON.stringify(audit)).not.toContain(d.email);
  });

  it('is for donors only', async () => {
    await remove(hospital, { password: PASSWORD, confirm: 'DELETE' }).expect(403);
    await remove(staff, { password: PASSWORD, confirm: 'DELETE' }).expect(403);
  });
});
