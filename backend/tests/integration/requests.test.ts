import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { runRequestExpirySweep } from '../../src/jobs/requestExpirySweep.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model.js';
import { BloodRequestModel } from '../../src/modules/requests/bloodRequest.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { createUser, hospitalPayload, login, useMailbox } from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function hospitalAuth({ verified = true } = {}) {
  const res = await request(app)
    .post('/api/auth/register/hospital')
    .send(hospitalPayload())
    .expect(201);
  const auth = `Bearer ${res.body.data.accessToken}`;
  if (verified) {
    await HospitalModel.updateOne(
      { userId: res.body.data.user.id },
      { $set: { verificationStatus: 'VERIFIED' } },
    );
  }
  return auth;
}

async function staffAuth(role: 'BLOOD_BANK_STAFF' | 'ADMIN' = 'BLOOD_BANK_STAFF') {
  const user = await createUser(role);
  return `Bearer ${(await login(app, user.email)).accessToken}`;
}

const newRequest = (overrides: Record<string, unknown> = {}) => ({
  bloodGroup: 'O+',
  componentType: 'PRBC',
  unitsRequested: 2,
  urgency: 'ROUTINE',
  requiredBy: hoursFromNow(24),
  reasonCategory: 'SCHEDULED_PROCEDURE',
  hospitalReference: 'ORD-2026/001',
  ...overrides,
});

async function raise(auth: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/requests')
    .set('Authorization', auth)
    .send(newRequest(overrides))
    .expect(201);
  return res.body.data as {
    id: string;
    status: string;
    requestNumber: string;
    allowedActions: string[];
  };
}

let hospital: string;
let staff: string;
beforeEach(async () => {
  hospital = await hospitalAuth();
  staff = await staffAuth();
});

describe('raising requests', () => {
  it('creates a pending routine request with a readable number and full audit', async () => {
    const r = await raise(hospital);
    expect(r.status).toBe('PENDING');
    expect(r.requestNumber).toMatch(/^REQ-\d{6}-\d{4}$/);
    expect(r.allowedActions).toEqual(['EDIT', 'ESCALATE', 'CANCEL']);
    expect(await AuditLogModel.countDocuments({ action: 'REQUEST_CREATED' })).toBe(1);
  });

  it('auto-approves emergency requests as a recorded system step', async () => {
    const r = await raise(hospital, { urgency: 'EMERGENCY' });
    expect(r.status).toBe('APPROVED');
    const detail = await request(app)
      .get(`/api/requests/${r.id}`)
      .set('Authorization', hospital)
      .expect(200);
    expect(detail.body.data.statusHistory[0]).toMatchObject({
      from: 'PENDING',
      to: 'APPROVED',
      by: null,
      reason: expect.stringMatching(/automatically/),
    });
    const audit = await AuditLogModel.findOne({ action: 'REQUEST_STATUS_CHANGED' }).lean();
    expect(audit!.actorRole).toBe('SYSTEM');
  });

  it('refuses unverified or closed hospitals', async () => {
    const unverified = await hospitalAuth({ verified: false });
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', unverified)
      .send(newRequest())
      .expect(403);
    expect(res.body.message).toMatch(/verified/);

    await HospitalModel.updateMany(
      { verificationStatus: 'VERIFIED' },
      { $set: { operatingStatus: 'CLOSED' } },
    );
    await request(app)
      .post('/api/requests')
      .set('Authorization', hospital)
      .send(newRequest())
      .expect(409);
  });

  it('validates quantity, timing and references', async () => {
    const post = (o: Record<string, unknown>) =>
      request(app).post('/api/requests').set('Authorization', hospital).send(newRequest(o));
    await post({ unitsRequested: 0 }).expect(400);
    await post({ unitsRequested: 21 }).expect(400);
    await post({ requiredBy: hoursFromNow(-2) }).expect(400);
    await post({ requiredBy: hoursFromNow(24 * 31) }).expect(400);
    await post({ hospitalReference: 'Patient: John Smith' }).expect(400);
    await post({ bloodGroup: 'Z+' }).expect(400);
  });

  it('is not available to donors or staff', async () => {
    await request(app)
      .post('/api/requests')
      .set('Authorization', staff)
      .send(newRequest())
      .expect(403);
  });
});

describe('hospital isolation', () => {
  it('never shows or changes another hospital’s request (IDOR)', async () => {
    const mine = await raise(hospital);
    const other = await hospitalAuth();

    await request(app).get(`/api/requests/${mine.id}`).set('Authorization', other).expect(404);
    await request(app)
      .patch(`/api/requests/${mine.id}`)
      .set('Authorization', other)
      .send({ unitsRequested: 5 })
      .expect(404);
    await request(app)
      .post(`/api/requests/${mine.id}/cancel`)
      .set('Authorization', other)
      .send({ reason: 'Not mine but trying' })
      .expect(404);
    await request(app)
      .post(`/api/requests/${mine.id}/escalate`)
      .set('Authorization', other)
      .send({ urgency: 'EMERGENCY', reason: 'Trying to escalate' })
      .expect(404);

    const list = await request(app)
      .get('/api/requests/mine')
      .set('Authorization', other)
      .expect(200);
    expect(list.body.meta.total).toBe(0);
  });

  it('ignores a hospitalId filter on the hospital’s own list', async () => {
    await raise(hospital);
    const other = await hospitalAuth();
    const otherHospital = await HospitalModel.findOne({ verificationStatus: 'VERIFIED' }).lean();
    const res = await request(app)
      .get(`/api/requests/mine?hospitalId=${otherHospital!._id}`)
      .set('Authorization', other)
      .expect(200);
    expect(res.body.meta.total).toBe(0);
  });

  it('keeps hospitals out of the staff queue and review', async () => {
    const r = await raise(hospital);
    await request(app).get('/api/requests').set('Authorization', hospital).expect(403);
    await request(app)
      .post(`/api/requests/${r.id}/review`)
      .set('Authorization', hospital)
      .send({ decision: 'APPROVE' })
      .expect(403);
  });
});

describe('editing and escalation', () => {
  it('allows edits only while pending', async () => {
    const r = await raise(hospital);
    const edited = await request(app)
      .patch(`/api/requests/${r.id}`)
      .set('Authorization', hospital)
      .send({ unitsRequested: 4, role: 'ADMIN' })
      .expect(200);
    expect(edited.body.data.unitsRequested).toBe(4);

    await request(app)
      .post(`/api/requests/${r.id}/review`)
      .set('Authorization', staff)
      .send({ decision: 'APPROVE' })
      .expect(200);
    await request(app)
      .patch(`/api/requests/${r.id}`)
      .set('Authorization', hospital)
      .send({ unitsRequested: 6 })
      .expect(409);
  });

  it('only raises urgency, and escalating a pending request to emergency approves it', async () => {
    const r = await raise(hospital, { urgency: 'URGENT' });
    await request(app)
      .post(`/api/requests/${r.id}/escalate`)
      .set('Authorization', hospital)
      .send({ urgency: 'URGENT', reason: 'Still urgent here' })
      .expect(409);
    const res = await request(app)
      .post(`/api/requests/${r.id}/escalate`)
      .set('Authorization', hospital)
      .send({ urgency: 'EMERGENCY', reason: 'Patient deteriorated' })
      .expect(200);
    expect(res.body.data).toMatchObject({ urgency: 'EMERGENCY', status: 'APPROVED' });
    expect(await AuditLogModel.countDocuments({ action: 'REQUEST_ESCALATED' })).toBe(1);
  });
});

describe('staff review and cancellation', () => {
  it('approves, or rejects with a reason the hospital can see', async () => {
    const a = await raise(hospital);
    const approved = await request(app)
      .post(`/api/requests/${a.id}/review`)
      .set('Authorization', staff)
      .send({ decision: 'APPROVE' })
      .expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'APPROVED',
      reviewedBy: { name: expect.any(String) },
    });

    const b = await raise(hospital);
    await request(app)
      .post(`/api/requests/${b.id}/review`)
      .set('Authorization', staff)
      .send({ decision: 'REJECT' })
      .expect(400);
    await request(app)
      .post(`/api/requests/${b.id}/review`)
      .set('Authorization', staff)
      .send({ decision: 'REJECT', reason: 'Duplicate of REQ raised earlier' })
      .expect(200);
    const seen = await request(app)
      .get(`/api/requests/${b.id}`)
      .set('Authorization', hospital)
      .expect(200);
    expect(seen.body.data).toMatchObject({
      status: 'REJECTED',
      statusReason: 'Duplicate of REQ raised earlier',
      allowedActions: [],
    });
  });

  it('lets exactly one of two concurrent reviews win', async () => {
    const r = await raise(hospital);
    const other = await staffAuth();
    const results = await Promise.all([
      request(app)
        .post(`/api/requests/${r.id}/review`)
        .set('Authorization', staff)
        .send({ decision: 'APPROVE' }),
      request(app)
        .post(`/api/requests/${r.id}/review`)
        .set('Authorization', other)
        .send({ decision: 'REJECT', reason: 'Conflicting decision' }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
  });

  it('cancels with a reason by hospital or staff, and never re-opens', async () => {
    const r = await raise(hospital);
    await request(app)
      .post(`/api/requests/${r.id}/cancel`)
      .set('Authorization', hospital)
      .send({})
      .expect(400);
    await request(app)
      .post(`/api/requests/${r.id}/cancel`)
      .set('Authorization', hospital)
      .send({ reason: 'Procedure postponed' })
      .expect(200);
    await request(app)
      .post(`/api/requests/${r.id}/cancel`)
      .set('Authorization', staff)
      .send({ reason: 'Cancel again please' })
      .expect(409);
    await request(app)
      .post(`/api/requests/${r.id}/review`)
      .set('Authorization', staff)
      .send({ decision: 'APPROVE' })
      .expect(409);
  });
});

describe('queue, stats and expiry', () => {
  it('orders the staff queue by urgency, then earliest required-by, and flags overdue', async () => {
    const routineSoon = await raise(hospital, { requiredBy: hoursFromNow(2) });
    const emergencyLater = await raise(hospital, {
      urgency: 'EMERGENCY',
      requiredBy: hoursFromNow(10),
    });
    const urgent = await raise(hospital, { urgency: 'URGENT', requiredBy: hoursFromNow(5) });
    await BloodRequestModel.updateOne(
      { _id: routineSoon.id },
      { $set: { requiredBy: new Date(Date.now() - 60_000) } },
    );

    const queue = await request(app)
      .get('/api/requests?state=open')
      .set('Authorization', staff)
      .expect(200);
    expect(queue.body.data.map((r: { id: string }) => r.id)).toEqual([
      emergencyLater.id,
      urgent.id,
      routineSoon.id,
    ]);
    expect(queue.body.data[2].overdue).toBe(true);

    const stats = await request(app)
      .get('/api/requests/stats')
      .set('Authorization', staff)
      .expect(200);
    expect(stats.body.data).toEqual({
      open: 3,
      pendingReview: 2,
      openEmergency: 1,
      openUrgent: 1,
      overdue: 1,
    });
  });

  it('expires open requests only after the grace period, with nothing issued', async () => {
    const recent = await raise(hospital);
    const old = await raise(hospital);
    await BloodRequestModel.updateOne(
      { _id: recent.id },
      { $set: { requiredBy: new Date(Date.now() - 60 * 60_000) } },
    );
    await BloodRequestModel.updateOne(
      { _id: old.id },
      { $set: { requiredBy: new Date(Date.now() - 3 * 3_600_000) } },
    );

    expect(await runRequestExpirySweep()).toBe(1);
    const expired = await request(app)
      .get(`/api/requests/${old.id}`)
      .set('Authorization', hospital)
      .expect(200);
    expect(expired.body.data).toMatchObject({
      status: 'EXPIRED',
      statusReason: expect.stringMatching(/Required-by/),
    });
    const stillOpen = await request(app)
      .get(`/api/requests/${recent.id}`)
      .set('Authorization', hospital)
      .expect(200);
    expect(stillOpen.body.data).toMatchObject({ status: 'PENDING', overdue: true });
  });

  it('shows staff the compatible stock, and hides it from hospitals', async () => {
    const r = await raise(hospital);
    const detail = await request(app)
      .get(`/api/requests/${r.id}`)
      .set('Authorization', staff)
      .expect(200);
    expect(detail.body.data.stock).toEqual({ exact: 0, compatibleSubstitutes: 0 });
    const own = await request(app)
      .get(`/api/requests/${r.id}`)
      .set('Authorization', hospital)
      .expect(200);
    expect(own.body.data.stock).toBeNull();
  });
});
