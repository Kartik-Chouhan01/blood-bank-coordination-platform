import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { createUser, hospitalPayload, login, useMailbox } from '../helpers/factories.js';

useTestDatabase();
const app = createApp();
let mailbox: ReturnType<typeof useMailbox>;
beforeEach(() => {
  mailbox = useMailbox();
});

async function registerHospital(overrides: Record<string, unknown> = {}) {
  const payload = hospitalPayload(overrides);
  const res = await request(app).post('/api/auth/register/hospital').send(payload).expect(201);
  const auth = `Bearer ${res.body.data.accessToken}`;
  const me = await request(app).get('/api/hospitals/me').set('Authorization', auth).expect(200);
  return { auth, payload, hospitalId: me.body.data.id as string };
}

async function signIn(role: 'ADMIN' | 'BLOOD_BANK_STAFF' | 'DONOR') {
  const user = await createUser(role);
  const session = await login(app, user.email);
  return { user, auth: `Bearer ${session.accessToken}` };
}

const verify = (auth: string, id: string, body: object) =>
  request(app).patch(`/api/hospitals/${id}/verification`).set('Authorization', auth).send(body);

describe('hospital self-service', () => {
  it('returns the hospital’s own profile', async () => {
    const { auth } = await registerHospital();
    const res = await request(app).get('/api/hospitals/me').set('Authorization', auth).expect(200);
    expect(res.body.data).toMatchObject({
      name: 'City General Hospital',
      verificationStatus: 'PENDING',
      canEditIdentity: true,
      statusReason: null,
    });
  });

  it('lets a pending hospital correct its name and registration number', async () => {
    const { auth } = await registerHospital();
    const res = await request(app)
      .patch('/api/hospitals/me')
      .set('Authorization', auth)
      .send({ name: 'City General Hospital & Research Centre', registrationNumber: 'mh-2026-001' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      registrationNumber: 'MH-2026-001',
      verificationStatus: 'PENDING',
    });
  });

  it('locks identity fields once verified, but still allows address and operating status', async () => {
    const hospital = await registerHospital();
    const admin = await signIn('ADMIN');
    await verify(admin.auth, hospital.hospitalId, { status: 'VERIFIED' }).expect(200);

    await request(app)
      .patch('/api/hospitals/me')
      .set('Authorization', hospital.auth)
      .send({ name: 'Renamed' })
      .expect(409);
    const res = await request(app)
      .patch('/api/hospitals/me')
      .set('Authorization', hospital.auth)
      .send({
        operatingStatus: 'CLOSED',
        address: { ...hospital.payload.address, line1: '2 New Road' },
      })
      .expect(200);
    expect(res.body.data).toMatchObject({ operatingStatus: 'CLOSED', canEditIdentity: false });
  });

  it('resubmits a rejected hospital for review when it corrects its details', async () => {
    const hospital = await registerHospital();
    const admin = await signIn('ADMIN');
    await verify(admin.auth, hospital.hospitalId, {
      status: 'REJECTED',
      reason: 'Registration number not found',
    }).expect(200);

    const me = await request(app)
      .get('/api/hospitals/me')
      .set('Authorization', hospital.auth)
      .expect(200);
    expect(me.body.data).toMatchObject({
      verificationStatus: 'REJECTED',
      statusReason: 'Registration number not found',
    });

    const res = await request(app)
      .patch('/api/hospitals/me')
      .set('Authorization', hospital.auth)
      .send({ registrationNumber: 'MH-CORRECTED-9' })
      .expect(200);
    expect(res.body.data.verificationStatus).toBe('PENDING');
    expect(
      (await HospitalModel.findById(hospital.hospitalId).lean())!.resubmittedAt,
    ).toBeInstanceOf(Date);
  });

  it('cannot self-verify through the profile endpoint', async () => {
    const hospital = await registerHospital();
    await request(app)
      .patch('/api/hospitals/me')
      .set('Authorization', hospital.auth)
      .send({ operatingStatus: 'OPERATIONAL', verificationStatus: 'VERIFIED' })
      .expect(200);
    expect((await HospitalModel.findById(hospital.hospitalId).lean())!.verificationStatus).toBe(
      'PENDING',
    );
    await verify(hospital.auth, hospital.hospitalId, { status: 'VERIFIED' }).expect(403);
  });

  it('rejects a registration number already used by another hospital', async () => {
    const first = await registerHospital();
    const second = await registerHospital();
    await request(app)
      .patch('/api/hospitals/me')
      .set('Authorization', second.auth)
      .send({ registrationNumber: first.payload.registrationNumber })
      .expect(409);
  });
});

describe('hospital verification (admin)', () => {
  it('verifies a hospital, audits it and emails the contact', async () => {
    const hospital = await registerHospital();
    const admin = await signIn('ADMIN');
    const res = await verify(admin.auth, hospital.hospitalId, { status: 'VERIFIED' }).expect(200);
    expect(res.body.data).toMatchObject({
      verificationStatus: 'VERIFIED',
      verifiedAt: expect.any(String),
    });

    expect(mailbox.lastTo(hospital.payload.email, 'HOSPITAL_VERIFIED')).toBeDefined();
    const audit = await AuditLogModel.findOne({ action: 'HOSPITAL_VERIFICATION_CHANGED' }).lean();
    expect(audit).toMatchObject({
      before: { verificationStatus: 'PENDING' },
      after: { verificationStatus: 'VERIFIED' },
    });
  });

  it('requires a reason to reject or suspend', async () => {
    const hospital = await registerHospital();
    const admin = await signIn('ADMIN');
    await verify(admin.auth, hospital.hospitalId, { status: 'REJECTED' }).expect(400);
    await verify(admin.auth, hospital.hospitalId, { status: 'SUSPENDED' }).expect(400);
  });

  it('refuses a no-op status change', async () => {
    const hospital = await registerHospital();
    const admin = await signIn('ADMIN');
    await verify(admin.auth, hospital.hospitalId, { status: 'VERIFIED' }).expect(200);
    await verify(admin.auth, hospital.hospitalId, { status: 'VERIFIED' }).expect(409);
  });

  it('lets staff read hospitals but only admins verify them', async () => {
    const hospital = await registerHospital();
    const staff = await signIn('BLOOD_BANK_STAFF');
    await request(app)
      .get(`/api/hospitals/${hospital.hospitalId}`)
      .set('Authorization', staff.auth)
      .expect(200);
    await verify(staff.auth, hospital.hospitalId, { status: 'VERIFIED' }).expect(403);
  });

  it('keeps donors and other hospitals out of the directory', async () => {
    const a = await registerHospital();
    const b = await registerHospital();
    await request(app).get('/api/hospitals').set('Authorization', a.auth).expect(403);
    await request(app)
      .get(`/api/hospitals/${b.hospitalId}`)
      .set('Authorization', a.auth)
      .expect(403);
    const donor = await signIn('DONOR');
    await request(app).get('/api/hospitals').set('Authorization', donor.auth).expect(403);
  });

  it('lists pending hospitals first and filters by status, city and search', async () => {
    const verified = await registerHospital({ hospitalName: 'Alpha Care' });
    await registerHospital({
      hospitalName: 'Beta Clinic',
      address: { line1: '1 Rd', city: 'Mumbai', state: 'MH', postalCode: '400001' },
    });
    const admin = await signIn('ADMIN');
    await verify(admin.auth, verified.hospitalId, { status: 'VERIFIED' }).expect(200);

    const all = await request(app)
      .get('/api/hospitals')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(all.body.data.map((h: { name: string }) => h.name)).toEqual([
      'Beta Clinic',
      'Alpha Care',
    ]);
    expect(all.body.data[0].contact.email).toMatch(/@example\.test$/);

    const pending = await request(app)
      .get('/api/hospitals?verificationStatus=PENDING')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(pending.body.data).toHaveLength(1);
    const mumbai = await request(app)
      .get('/api/hospitals?city=mumbai')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(mumbai.body.data[0].name).toBe('Beta Clinic');
    const search = await request(app)
      .get('/api/hospitals?search=alpha')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(search.body.data[0].name).toBe('Alpha Care');
  });
});
