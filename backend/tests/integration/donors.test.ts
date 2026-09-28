import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { DonorProfileModel } from '../../src/modules/donors/donorProfile.model.js';
import { UserModel } from '../../src/modules/users/user.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { createUser, donorPayload, login, useMailbox } from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

async function registerDonor(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/auth/register/donor')
    .send(donorPayload(overrides))
    .expect(201);
  const auth = `Bearer ${res.body.data.accessToken}`;
  const me = await request(app).get('/api/donors/me').set('Authorization', auth).expect(200);
  return { auth, userId: res.body.data.user.id as string, donorId: me.body.data.id as string };
}

async function staff(role: 'BLOOD_BANK_STAFF' | 'ADMIN' = 'BLOOD_BANK_STAFF') {
  const user = await createUser(role);
  const session = await login(app, user.email);
  return { user, auth: `Bearer ${session.accessToken}` };
}

const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('donor self-service', () => {
  it('returns the donor’s own profile without internal fields or coordinates', async () => {
    const donor = await registerDonor({ bloodGroup: 'B-' });
    const res = await request(app)
      .get('/api/donors/me')
      .set('Authorization', donor.auth)
      .expect(200);

    expect(res.body.data).toMatchObject({
      bloodGroup: 'B-',
      bloodGroupConfirmed: false,
      effectiveAvailability: 'AVAILABLE',
      verificationStatus: 'PENDING',
      earliestContactDate: null,
      contactIntervalDays: 90,
      location: { city: 'Pune', area: 'Hinjawadi', hasApproximateLocation: false },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/cityKey|coordinates|userId/);
  });

  it('is reachable only by donors', async () => {
    const { auth } = await staff('ADMIN');
    await request(app).get('/api/donors/me').set('Authorization', auth).expect(403);
  });

  it('updates city/area and stores only coarsened coordinates', async () => {
    const donor = await registerDonor();
    const res = await request(app)
      .patch('/api/donors/me')
      .set('Authorization', donor.auth)
      .send({
        city: ' Mumbai ',
        area: 'Andheri',
        approximateLocation: { latitude: 19.123456, longitude: 72.876543 },
      })
      .expect(200);
    expect(res.body.data.location).toEqual({
      city: 'Mumbai',
      area: 'Andheri',
      hasApproximateLocation: true,
    });

    const stored = await DonorProfileModel.findById(donor.donorId).lean();
    expect(stored!.location.point!.coordinates).toEqual([72.88, 19.12]);
    expect(stored!.location.cityKey).toBe('mumbai');

    const audit = await AuditLogModel.findOne({ action: 'DONOR_PROFILE_UPDATED' }).lean();
    expect(JSON.stringify(audit)).not.toMatch(/19\.12|72\.88/);
  });

  it('clears the approximate location with null', async () => {
    const donor = await registerDonor();
    await request(app)
      .patch('/api/donors/me')
      .set('Authorization', donor.auth)
      .send({ approximateLocation: { latitude: 18.5, longitude: 73.8 } })
      .expect(200);
    const res = await request(app)
      .patch('/api/donors/me')
      .set('Authorization', donor.auth)
      .send({ approximateLocation: null })
      .expect(200);
    expect(res.body.data.location.hasApproximateLocation).toBe(false);
  });

  it('cannot touch staff-only fields through the profile endpoint (mass assignment)', async () => {
    const donor = await registerDonor();
    await request(app)
      .patch('/api/donors/me')
      .set('Authorization', donor.auth)
      .send({
        area: 'Baner',
        verificationStatus: 'VERIFIED',
        bloodGroupConfirmed: true,
        donationCount: 99,
      })
      .expect(200);
    const stored = await DonorProfileModel.findById(donor.donorId).lean();
    expect(stored).toMatchObject({
      verificationStatus: 'PENDING',
      bloodGroupConfirmed: false,
      donationCount: 0,
    });
  });

  it('lets donors fix their blood group only until staff confirm it', async () => {
    const donor = await registerDonor({ bloodGroup: 'A+' });
    await request(app)
      .patch('/api/donors/me')
      .set('Authorization', donor.auth)
      .send({ bloodGroup: 'A-' })
      .expect(200);

    const { auth } = await staff();
    await request(app)
      .patch(`/api/donors/${donor.donorId}/blood-group`)
      .set('Authorization', auth)
      .send({ bloodGroup: 'A-' })
      .expect(200);

    const res = await request(app)
      .patch('/api/donors/me')
      .set('Authorization', donor.auth)
      .send({ bloodGroup: 'O+' })
      .expect(409);
    expect(res.body.message).toMatch(/confirmed by blood-bank staff/);
  });

  it('records availability changes with a history, newest first', async () => {
    const donor = await registerDonor();
    await request(app)
      .put('/api/donors/me/availability')
      .set('Authorization', donor.auth)
      .send({ status: 'UNAVAILABLE' })
      .expect(200);
    const res = await request(app)
      .put('/api/donors/me/availability')
      .set('Authorization', donor.auth)
      .send({ status: 'TEMPORARILY_UNAVAILABLE', availableAgainAt: future(14) })
      .expect(200);

    expect(res.body.data.effectiveAvailability).toBe('TEMPORARILY_UNAVAILABLE');
    expect(res.body.data.availabilityHistory.map((h: { status: string }) => h.status)).toEqual([
      'TEMPORARILY_UNAVAILABLE',
      'UNAVAILABLE',
      'AVAILABLE',
    ]);
  });

  it('validates temporary-unavailability dates', async () => {
    const donor = await registerDonor();
    const send = (body: object) =>
      request(app).put('/api/donors/me/availability').set('Authorization', donor.auth).send(body);
    await send({ status: 'TEMPORARILY_UNAVAILABLE' }).expect(400);
    await send({ status: 'TEMPORARILY_UNAVAILABLE', availableAgainAt: '2020-01-01' }).expect(400);
    await send({ status: 'TEMPORARILY_UNAVAILABLE', availableAgainAt: future(400) }).expect(400);
    await send({ status: 'AVAILABLE', availableAgainAt: future(3) }).expect(400);
  });

  it('treats an elapsed return date as available again', async () => {
    const donor = await registerDonor();
    await DonorProfileModel.updateOne(
      { _id: donor.donorId },
      {
        $set: {
          availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
          availableAgainAt: new Date(Date.now() - 1000),
        },
      },
    );
    const res = await request(app)
      .get('/api/donors/me')
      .set('Authorization', donor.auth)
      .expect(200);
    expect(res.body.data.effectiveAvailability).toBe('AVAILABLE');
  });

  it('caps the stored availability history', async () => {
    const donor = await registerDonor();
    for (let i = 0; i < 55; i++) {
      await request(app)
        .put('/api/donors/me/availability')
        .set('Authorization', donor.auth)
        .send({ status: i % 2 ? 'AVAILABLE' : 'UNAVAILABLE' });
    }
    const stored = await DonorProfileModel.findById(donor.donorId).lean();
    expect(stored!.availabilityHistory).toHaveLength(50);
  });

  it('saves notification preferences with bounds', async () => {
    const donor = await registerDonor();
    const prefs = { inApp: true, email: false, emergencyOnly: true, maxContactsPerWeek: 2 };
    const res = await request(app)
      .put('/api/donors/me/notification-preferences')
      .set('Authorization', donor.auth)
      .send(prefs)
      .expect(200);
    expect(res.body.data.notificationPreferences).toEqual(prefs);
    await request(app)
      .put('/api/donors/me/notification-preferences')
      .set('Authorization', donor.auth)
      .send({ ...prefs, maxContactsPerWeek: 50 })
      .expect(400);
  });
});

describe('account self-service', () => {
  it('updates name and phone; a new phone must be re-verified', async () => {
    const donor = await registerDonor();
    await UserModel.updateOne({ _id: donor.userId }, { $set: { phoneVerified: true } });

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', donor.auth)
      .send({ name: 'Asha P', phone: '+91 91234 56789' })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'Asha P', phone: '+91 91234 56789' });
    expect((await UserModel.findById(donor.userId).lean())!.phoneVerified).toBe(false);

    const audit = await AuditLogModel.findOne({ action: 'ACCOUNT_UPDATED' }).lean();
    expect(audit!.after).toEqual({ changedFields: ['name', 'phone'] });
  });

  it('cannot change role or email through /users/me', async () => {
    const donor = await registerDonor();
    await request(app)
      .patch('/api/users/me')
      .set('Authorization', donor.auth)
      .send({ role: 'ADMIN', email: 'x@y.test' })
      .expect(400);
    expect((await UserModel.findById(donor.userId).lean())!.role).toBe('DONOR');
  });
});

describe('staff donor management', () => {
  it('forbids donors and hospitals from listing donors', async () => {
    const donor = await registerDonor();
    await request(app).get('/api/donors').set('Authorization', donor.auth).expect(403);
    const hospital = await createUser('HOSPITAL');
    const session = await login(app, hospital.email);
    await request(app)
      .get('/api/donors')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('prevents a donor reading another donor by id (IDOR)', async () => {
    const alice = await registerDonor();
    const bob = await registerDonor();
    await request(app)
      .get(`/api/donors/${bob.donorId}`)
      .set('Authorization', alice.auth)
      .expect(403);
  });

  it('lists donors with filters and without contact details', async () => {
    await registerDonor({ name: 'Asha Patil', bloodGroup: 'O-', city: 'Pune' });
    await registerDonor({ name: 'Ravi Kumar', bloodGroup: 'O-', city: 'Mumbai' });
    await registerDonor({ name: 'Meera Joshi', bloodGroup: 'A+', city: 'pune' });
    const { auth } = await staff();

    const all = await request(app).get('/api/donors').set('Authorization', auth).expect(200);
    expect(all.body.meta.total).toBe(3);
    expect(JSON.stringify(all.body)).not.toMatch(/phone|email|dateOfBirth|coordinates|@example/);
    expect(all.body.data[0]).toHaveProperty('age');

    const oneg = await request(app)
      .get('/api/donors?bloodGroup=O-')
      .set('Authorization', auth)
      .expect(200);
    expect(oneg.body.data).toHaveLength(2);

    const pune = await request(app)
      .get('/api/donors?city=PUNE')
      .set('Authorization', auth)
      .expect(200);
    expect(pune.body.data.map((d: { name: string }) => d.name).sort()).toEqual([
      'Asha Patil',
      'Meera Joshi',
    ]);

    const search = await request(app)
      .get('/api/donors?search=ravi')
      .set('Authorization', auth)
      .expect(200);
    expect(search.body.data).toHaveLength(1);
  });

  it('filters by effective availability', async () => {
    const lapsed = await registerDonor({ name: 'Lapsed Temp' });
    const away = await registerDonor({ name: 'Still Away' });
    await registerDonor({ name: 'Plain Available' });
    await DonorProfileModel.updateOne(
      { _id: lapsed.donorId },
      {
        $set: {
          availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
          availableAgainAt: new Date(Date.now() - 1000),
        },
      },
    );
    await request(app)
      .put('/api/donors/me/availability')
      .set('Authorization', away.auth)
      .send({ status: 'TEMPORARILY_UNAVAILABLE', availableAgainAt: future(10) });

    const { auth } = await staff();
    const available = await request(app)
      .get('/api/donors?availability=AVAILABLE')
      .set('Authorization', auth)
      .expect(200);
    expect(available.body.data.map((d: { name: string }) => d.name).sort()).toEqual([
      'Lapsed Temp',
      'Plain Available',
    ]);

    const temp = await request(app)
      .get('/api/donors?availability=TEMPORARILY_UNAVAILABLE')
      .set('Authorization', auth)
      .expect(200);
    expect(temp.body.data.map((d: { name: string }) => d.name)).toEqual(['Still Away']);
  });

  it('verifies donors, requiring a reason to reject, and audits the change', async () => {
    const donor = await registerDonor();
    const { auth, user } = await staff();

    await request(app)
      .patch(`/api/donors/${donor.donorId}/verification`)
      .set('Authorization', auth)
      .send({ status: 'REJECTED' })
      .expect(400);
    const res = await request(app)
      .patch(`/api/donors/${donor.donorId}/verification`)
      .set('Authorization', auth)
      .send({ status: 'VERIFIED' })
      .expect(200);
    expect(res.body.data.verificationStatus).toBe('VERIFIED');

    const audit = await AuditLogModel.findOne({ action: 'DONOR_VERIFICATION_CHANGED' }).lean();
    expect(audit).toMatchObject({
      before: { verificationStatus: 'PENDING' },
      after: { verificationStatus: 'VERIFIED' },
    });
    expect(audit!.actorId!.toString()).toBe(user._id.toString());
  });

  it('requires a note when staff correct a declared blood group', async () => {
    const donor = await registerDonor({ bloodGroup: 'B+' });
    const { auth } = await staff();
    const url = `/api/donors/${donor.donorId}/blood-group`;

    const noNote = await request(app)
      .patch(url)
      .set('Authorization', auth)
      .send({ bloodGroup: 'AB+' })
      .expect(400);
    expect(noNote.body.details[0].field).toBe('body.note');

    const res = await request(app)
      .patch(url)
      .set('Authorization', auth)
      .send({ bloodGroup: 'AB+', note: 'Lab typing result 2026-09-20' })
      .expect(200);
    expect(res.body.data).toMatchObject({ bloodGroup: 'AB+', bloodGroupConfirmed: true });

    const audit = await AuditLogModel.findOne({ action: 'DONOR_BLOOD_GROUP_CONFIRMED' }).lean();
    expect(audit).toMatchObject({
      before: { bloodGroup: 'B+' },
      after: { bloodGroup: 'AB+' },
      reason: 'Lab typing result 2026-09-20',
    });
  });

  it('confirms a matching blood group without a note', async () => {
    const donor = await registerDonor({ bloodGroup: 'O+' });
    const { auth } = await staff();
    await request(app)
      .patch(`/api/donors/${donor.donorId}/blood-group`)
      .set('Authorization', auth)
      .send({ bloodGroup: 'O+' })
      .expect(200);
  });

  it('returns 404 for unknown donors and 400 for bad ids', async () => {
    const { auth } = await staff();
    await request(app)
      .get('/api/donors/64b7f0000000000000000000')
      .set('Authorization', auth)
      .expect(404);
    await request(app).get('/api/donors/nope').set('Authorization', auth).expect(400);
  });
});
