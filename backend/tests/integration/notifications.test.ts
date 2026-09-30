import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BloodGroup } from '@bbms/shared';
import { createApp } from '../../src/app.js';
import { runRequestExpirySweep } from '../../src/jobs/requestExpirySweep.js';
import { runReservationHoldSweep } from '../../src/jobs/reservationHoldSweep.js';
import { setMailAdapter } from '../../src/infrastructure/mail/mailer.js';
import { BloodBankModel } from '../../src/modules/bloodBanks/bloodBank.model.js';
import { DonorProfileModel } from '../../src/modules/donors/donorProfile.model.js';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model.js';
import { BloodUnitModel } from '../../src/modules/inventory/bloodUnit.model.js';
import { NotificationModel } from '../../src/modules/notifications/notification.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import {
  createUser,
  donorPayload,
  hospitalPayload,
  login,
  useMailbox,
} from '../helpers/factories.js';

useTestDatabase();
let mailbox = useMailbox();
const app = createApp();

const HOUR = 3_600_000;
const PUNE: [number, number] = [73.86, 18.52];
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();
const bankAddress = { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' };

interface Party {
  auth: string;
  userId: string;
  email: string;
}
let ctx: {
  bankId: Types.ObjectId;
  staff: Party;
  otherBankStaff: Party;
  admin: Party;
  hospital: Party;
};

async function party(role: 'ADMIN' | 'BLOOD_BANK_STAFF', extra: Record<string, unknown> = {}) {
  const user = await createUser(role, extra);
  const session = await login(app, user.email);
  return { auth: `Bearer ${session.accessToken}`, userId: user._id.toString(), email: user.email };
}

async function bank(code: string) {
  return BloodBankModel.create({
    name: `Bank ${code}`,
    code,
    address: bankAddress,
    contactPhone: '+91 20 1111 2222',
    contactEmail: `${code.toLowerCase()}@bank.example`,
  });
}

beforeEach(async () => {
  mailbox = useMailbox();
  const [main, other] = await Promise.all([bank('CEN'), bank('OTH')]);
  const payload = hospitalPayload({ hospitalName: 'City General Hospital' });
  const res = await request(app).post('/api/auth/register/hospital').send(payload).expect(201);
  await HospitalModel.updateOne(
    { userId: res.body.data.user.id },
    { $set: { verificationStatus: 'VERIFIED', location: { type: 'Point', coordinates: PUNE } } },
  );
  ctx = {
    bankId: main._id,
    staff: await party('BLOOD_BANK_STAFF', { bloodBankId: main._id }),
    otherBankStaff: await party('BLOOD_BANK_STAFF', { bloodBankId: other._id }),
    admin: await party('ADMIN'),
    hospital: {
      auth: `Bearer ${res.body.data.accessToken}`,
      userId: res.body.data.user.id,
      email: payload.email as string,
    },
  };
});

async function raise(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/requests')
    .set('Authorization', ctx.hospital.auth)
    .send({
      bloodGroup: 'A+',
      componentType: 'PRBC',
      unitsRequested: 1,
      urgency: 'ROUTINE',
      requiredBy: inHours(24),
      reasonCategory: 'SCHEDULED_PROCEDURE',
      ...overrides,
    })
    .expect(201);
  return res.body.data.id as string;
}

const approve = (id: string) =>
  request(app)
    .post(`/api/requests/${id}/review`)
    .set('Authorization', ctx.staff.auth)
    .send({ decision: 'APPROVE' })
    .expect(200);

async function unit(bloodGroup: BloodGroup = 'A+') {
  const u = await BloodUnitModel.create({
    unitCode: `CEN-260101-${Math.floor(Math.random() * 9000 + 1000)}`,
    donationId: new Types.ObjectId(),
    donorId: new Types.ObjectId(),
    bloodBankId: ctx.bankId,
    bloodGroup,
    componentType: 'PRBC',
    collectedAt: new Date(Date.now() - HOUR),
    expiryDate: new Date(Date.now() + 20 * 24 * HOUR),
    status: 'AVAILABLE',
    testingStatus: 'PASSED',
  });
  return u._id.toString();
}

const notificationsOf = (userId: string) =>
  NotificationModel.find({ recipientId: userId }).sort({ createdAt: 1 }).lean();

describe('reading notifications', () => {
  it('lists, counts and marks the signed-in user’s own notifications only', async () => {
    const id = await raise();
    await approve(id);

    const list = await request(app)
      .get('/api/notifications')
      .set('Authorization', ctx.hospital.auth)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      type: 'REQUEST_APPROVED',
      link: `/hospital/requests/${id}`,
      readAt: null,
    });
    const count = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', ctx.hospital.auth)
      .expect(200);
    expect(count.body.data).toEqual({ unread: 1, critical: 0 });

    const notificationId = list.body.data[0].id;
    // Someone else cannot mark (or discover) it.
    await request(app)
      .post(`/api/notifications/${notificationId}/read`)
      .set('Authorization', ctx.staff.auth)
      .expect(404);
    const read = await request(app)
      .post(`/api/notifications/${notificationId}/read`)
      .set('Authorization', ctx.hospital.auth)
      .expect(200);
    expect(read.body.data.readAt).not.toBeNull();
    const again = await request(app)
      .post(`/api/notifications/${notificationId}/read`)
      .set('Authorization', ctx.hospital.auth)
      .expect(200);
    expect(again.body.data.readAt).toBe(read.body.data.readAt);

    const unread = await request(app)
      .get('/api/notifications?unread=true')
      .set('Authorization', ctx.hospital.auth)
      .expect(200);
    expect(unread.body.data).toEqual([]);
  });

  it('marks everything read at once', async () => {
    await approve(await raise());
    await approve(await raise());
    const res = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', ctx.hospital.auth)
      .expect(200);
    expect(res.body.data).toEqual({ marked: 2 });
    expect(
      await NotificationModel.countDocuments({ readAt: null, recipientId: ctx.hospital.userId }),
    ).toBe(0);
  });

  it('requires sign-in', async () => {
    await request(app).get('/api/notifications').expect(401);
  });
});

describe('request events', () => {
  it('tells the hospital about approval and rejection, in-app and by email', async () => {
    await approve(await raise());
    const rejected = await raise();
    await request(app)
      .post(`/api/requests/${rejected}/review`)
      .set('Authorization', ctx.staff.auth)
      .send({ decision: 'REJECT', reason: 'Duplicate of another request' })
      .expect(200);

    const notes = await notificationsOf(ctx.hospital.userId);
    expect(notes.map((n) => n.type)).toEqual(['REQUEST_APPROVED', 'REQUEST_REJECTED']);
    expect(notes[1]!.message).toMatch(/Duplicate of another request/);
    expect(notes[1]!.priority).toBe('HIGH');
    // Hospitals self-register without verifying email in tests: email is skipped, not sent.
    expect(notes[0]!.deliveries.map((d) => [d.channel, d.status])).toEqual([
      ['IN_APP', 'SENT'],
      ['EMAIL', 'SKIPPED'],
    ]);
    expect(mailbox.sent.filter((m) => m.template.startsWith('NOTIFY_'))).toEqual([]);
  });

  it('alerts every active staff member and admin about emergencies, critically and by email', async () => {
    const suspended = await createUser('BLOOD_BANK_STAFF', { accountStatus: 'SUSPENDED' });
    await raise({ urgency: 'EMERGENCY' });

    for (const p of [ctx.staff, ctx.otherBankStaff, ctx.admin]) {
      const [note] = await notificationsOf(p.userId);
      expect(note).toMatchObject({ type: 'URGENT_REQUEST', priority: 'CRITICAL' });
      expect(note!.message).toMatch(/City General Hospital/);
      expect(mailbox.lastTo(p.email, 'NOTIFY_URGENT_REQUEST')).toBeDefined();
    }
    expect(await notificationsOf(suspended._id.toString())).toEqual([]);
    const count = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', ctx.staff.auth)
      .expect(200);
    expect(count.body.data).toEqual({ unread: 1, critical: 1 });
  });

  it('flags urgent requests in-app only, and says nothing about routine ones', async () => {
    await raise({ urgency: 'URGENT' });
    await raise();
    const notes = await notificationsOf(ctx.staff.userId);
    expect(notes.map((n) => [n.type, n.priority])).toEqual([['URGENT_REQUEST', 'HIGH']]);
    expect(mailbox.sent.filter((m) => m.template.startsWith('NOTIFY_'))).toEqual([]);
  });

  it('announces escalations to staff', async () => {
    const id = await raise();
    await request(app)
      .post(`/api/requests/${id}/escalate`)
      .set('Authorization', ctx.hospital.auth)
      .send({ urgency: 'EMERGENCY', reason: 'Patient condition worsened' })
      .expect(200);
    const [note] = await notificationsOf(ctx.staff.userId);
    expect(note!.title).toMatch(/Emergency request .* \(escalated\)/);
  });

  it('routes cancellations to the other side, and ignores pending cancellations by hospitals', async () => {
    const pending = await raise();
    await request(app)
      .post(`/api/requests/${pending}/cancel`)
      .set('Authorization', ctx.hospital.auth)
      .send({ reason: 'No longer needed' })
      .expect(200);
    expect(await notificationsOf(ctx.staff.userId)).toEqual([]);

    const approved = await raise();
    await approve(approved);
    await request(app)
      .post(`/api/requests/${approved}/cancel`)
      .set('Authorization', ctx.hospital.auth)
      .send({ reason: 'Procedure postponed' })
      .expect(200);
    expect((await notificationsOf(ctx.staff.userId)).map((n) => n.type)).toEqual([
      'REQUEST_CANCELLED_BY_HOSPITAL',
    ]);

    const byStaff = await raise();
    await request(app)
      .post(`/api/requests/${byStaff}/cancel`)
      .set('Authorization', ctx.staff.auth)
      .send({ reason: 'Covered by another bank' })
      .expect(200);
    const hospitalNotes = await notificationsOf(ctx.hospital.userId);
    expect(hospitalNotes.at(-1)).toMatchObject({ type: 'REQUEST_CANCELLED_BY_STAFF' });
  });

  it('tells the hospital when a request expires', async () => {
    await raise({ requiredBy: inHours(1) });
    await runRequestExpirySweep(new Date(Date.now() + 10 * HOUR));
    expect((await notificationsOf(ctx.hospital.userId)).map((n) => n.type)).toEqual([
      'REQUEST_EXPIRED',
    ]);
  });
});

describe('allocation events', () => {
  it('tells the hospital about reservations and issued units', async () => {
    const id = await raise();
    await approve(id);
    const unitId = await unit();
    const reserved = await request(app)
      .post(`/api/matching/requests/${id}/allocations`)
      .set('Authorization', ctx.staff.auth)
      .send({ unitIds: [unitId] })
      .expect(201);
    await request(app)
      .post(`/api/matching/allocations/${reserved.body.data.allocations[0].id}/issue`)
      .set('Authorization', ctx.staff.auth)
      .expect(200);

    const notes = await notificationsOf(ctx.hospital.userId);
    expect(notes.map((n) => n.type)).toEqual([
      'REQUEST_APPROVED',
      'UNITS_RESERVED',
      'UNITS_ISSUED',
    ]);
    expect(notes[2]!.title).toMatch(/All units issued/);
    expect(notes[2]!.message).toMatch(/confirm receipt/);
  });

  it("alerts only the unit's own bank when a hold expires", async () => {
    const id = await raise();
    await approve(id);
    await request(app)
      .post(`/api/matching/requests/${id}/allocations`)
      .set('Authorization', ctx.staff.auth)
      .send({ unitIds: [await unit()] })
      .expect(201);
    await runReservationHoldSweep(new Date(Date.now() + 48 * HOUR));

    expect((await notificationsOf(ctx.staff.userId)).map((n) => n.type)).toEqual([
      'RESERVATION_RELEASED',
    ]);
    expect(await notificationsOf(ctx.otherBankStaff.userId)).toEqual([]);
    expect(await notificationsOf(ctx.admin.userId)).toEqual([]);
  });
});

describe('donor outreach events', () => {
  async function donor(prefs: { inApp: boolean; email: boolean }) {
    const res = await request(app)
      .post('/api/auth/register/donor')
      .send(donorPayload({ bloodGroup: 'A+' }))
      .expect(201);
    const profile = await DonorProfileModel.findOneAndUpdate(
      { userId: res.body.data.user.id },
      {
        $set: {
          verificationStatus: 'VERIFIED',
          'location.point': { type: 'Point', coordinates: [PUNE[0], PUNE[1] + 0.02] },
          'notificationPreferences.inApp': prefs.inApp,
          'notificationPreferences.email': prefs.email,
        },
      },
      { returnDocument: 'after' },
    ).lean();
    // Registration signs in with an unverified email; verify it so email delivery is possible.
    const { UserModel } = await import('../../src/modules/users/user.model.js');
    await UserModel.updateOne({ _id: res.body.data.user.id }, { $set: { emailVerified: true } });
    return {
      id: profile!._id.toString(),
      userId: res.body.data.user.id as string,
      email: res.body.data.user.email as string,
      auth: `Bearer ${res.body.data.accessToken}`,
    };
  }

  it('contacts donors on their chosen channels without naming the hospital', async () => {
    const both = await donor({ inApp: true, email: true });
    const appOnly = await donor({ inApp: true, email: false });
    const emailOnly = await donor({ inApp: false, email: true });
    const id = await raise();
    await approve(id);
    await request(app)
      .post(`/api/matching/requests/${id}/outreach`)
      .set('Authorization', ctx.staff.auth)
      .send({ donorIds: [both.id, appOnly.id, emailOnly.id] })
      .expect(201);

    const [note] = await notificationsOf(both.userId);
    expect(note).toMatchObject({ type: 'DONOR_OUTREACH', link: '/donor/requests' });
    expect(note!.message).not.toMatch(/City General/);
    expect(mailbox.lastTo(both.email, 'NOTIFY_DONOR_OUTREACH')!.text).not.toMatch(/City General/);

    expect(await notificationsOf(appOnly.userId)).toHaveLength(1);
    expect(mailbox.lastTo(appOnly.email, 'NOTIFY_DONOR_OUTREACH')).toBeUndefined();
    expect(await notificationsOf(emailOnly.userId)).toEqual([]);
    expect(mailbox.lastTo(emailOnly.email, 'NOTIFY_DONOR_OUTREACH')).toBeDefined();
  });

  it('tells the staff member who reached out when a donor can help', async () => {
    const d = await donor({ inApp: true, email: false });
    const id = await raise();
    await approve(id);
    await request(app)
      .post(`/api/matching/requests/${id}/outreach`)
      .set('Authorization', ctx.staff.auth)
      .send({ donorIds: [d.id] })
      .expect(201);
    const mine = await request(app)
      .get('/api/donor-outreach/mine')
      .set('Authorization', d.auth)
      .expect(200);
    await request(app)
      .post(`/api/donor-outreach/${mine.body.data[0].id}/respond`)
      .set('Authorization', d.auth)
      .send({ response: 'INTERESTED' })
      .expect(200);

    expect((await notificationsOf(ctx.staff.userId)).map((n) => n.type)).toEqual([
      'DONOR_INTERESTED',
    ]);
    expect(await notificationsOf(ctx.admin.userId)).toEqual([]);
  });
});

describe('delivery failures', () => {
  it('never fails the action, and records the failed email', async () => {
    setMailAdapter({
      send: () => Promise.reject(new Error('SMTP down')),
    });
    await raise({ urgency: 'EMERGENCY' });
    const [note] = await notificationsOf(ctx.staff.userId);
    expect(note!.deliveries.map((d) => [d.channel, d.status])).toEqual([
      ['IN_APP', 'SENT'],
      ['EMAIL', 'FAILED'],
    ]);
  });
});
