import request from 'supertest';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { listRoutes, type HttpMethod } from '../../src/utils/routeTable.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { BloodBankModel } from '../../src/modules/bloodBanks/bloodBank.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { PASSWORD, createUser, donorPayload, login, useMailbox } from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

interface Route {
  method: HttpMethod;
  path: string;
}

/** Every route registered on every feature router (the shared route table), ids filled in. */
function allRoutes(): Route[] {
  const id = new Types.ObjectId().toString();
  return listRoutes().map((r) => ({
    method: r.method,
    path: `/api${r.path}`.replace(/:[a-zA-Z]+/g, id),
  }));
}

const key = (r: Route) => `${r.method.toUpperCase()} ${r.path.replace(/[a-f0-9]{24}/g, ':id')}`;

/** Routes anyone may call without signing in. Anything not listed here must require a session. */
const PUBLIC = new Set([
  'GET /api/health',
  'POST /api/auth/register/donor',
  'POST /api/auth/register/hospital',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/verify-email',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/auth/accept-invite',
  'GET /api/dashboard/public-stats',
]);

/** Everything a donor may reach once signed in; every other protected route must refuse them. */
const DONOR_ALLOWED = [
  /^(GET|POST) \/api\/auth\//,
  /^(PATCH|POST) \/api\/users\/me/,
  /^(GET|PATCH|PUT) \/api\/donors\/me/,
  /^(GET|POST) \/api\/donor-outreach\//,
  /^(GET|POST) \/api\/notifications/,
];

const call = (r: Route, auth?: string) => {
  const req = request(app)[r.method](r.path).set('Origin', 'http://localhost:5173');
  return auth ? req.set('Authorization', auth).send({}) : req.send({});
};

describe('route protection', () => {
  it('finds the whole API surface', () => {
    const routes = allRoutes();
    expect(routes.length).toBeGreaterThan(60);
    // Sanity: every public route actually exists, so the allowlist cannot silently go stale.
    const keys = new Set(routes.map(key));
    for (const publicRoute of PUBLIC) expect(keys, publicRoute).toContain(publicRoute);
  });

  it('rejects every non-public route without a session', async () => {
    const failures: string[] = [];
    for (const route of allRoutes()) {
      if (PUBLIC.has(key(route))) continue;
      const res = await call(route);
      if (res.status !== 401) failures.push(`${key(route)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it("refuses a donor on every route outside the donor's own area", async () => {
    const res = await request(app)
      .post('/api/auth/register/donor')
      .send(donorPayload())
      .expect(201);
    const donor = `Bearer ${res.body.data.accessToken}`;
    const failures: string[] = [];
    for (const route of allRoutes()) {
      const k = key(route);
      if (PUBLIC.has(k) || DONOR_ALLOWED.some((re) => re.test(k))) continue;
      const r = await call(route, donor);
      if (r.status !== 403) failures.push(`${k} → ${r.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('keeps settings and the audit log for administrators only', async () => {
    const bank = await BloodBankModel.create({
      name: 'Central',
      code: 'CEN',
      address: { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' },
      contactPhone: '+91 20 1111 2222',
      contactEmail: 'c@bank.example',
    });
    const staff = await createUser('BLOOD_BANK_STAFF', { bloodBankId: bank._id });
    const auth = `Bearer ${(await login(app, staff.email)).accessToken}`;
    await request(app).get('/api/settings').set('Authorization', auth).expect(403);
    await request(app).get('/api/audit-logs').set('Authorization', auth).expect(403);
  });
});

describe('deactivated blood banks', () => {
  let bankId: Types.ObjectId;
  let staffEmail: string;
  let staffAuth: string;
  let admin: string;

  beforeEach(async () => {
    const bank = await BloodBankModel.create({
      name: 'Central',
      code: 'CEN',
      address: { line1: '1 Rd', city: 'Pune', state: 'MH', postalCode: '411001' },
      contactPhone: '+91 20 1111 2222',
      contactEmail: 'c@bank.example',
    });
    bankId = bank._id;
    const staff = await createUser('BLOOD_BANK_STAFF', { bloodBankId: bankId });
    staffEmail = staff.email;
    staffAuth = `Bearer ${(await login(app, staff.email)).accessToken}`;
    admin = `Bearer ${(await login(app, (await createUser('ADMIN')).email)).accessToken}`;
  });

  it('stops staff immediately, at sign-in and on existing sessions', async () => {
    await request(app).get('/api/blood-units').set('Authorization', staffAuth).expect(200);
    await BloodBankModel.updateOne({ _id: bankId }, { $set: { isActive: false } });

    const blocked = await request(app)
      .get('/api/blood-units')
      .set('Authorization', staffAuth)
      .expect(403);
    expect(blocked.body.message).toMatch(/blood bank is not active/);
    await request(app)
      .post('/api/auth/login')
      .send({ email: staffEmail, password: PASSWORD })
      .expect(403);
    // Administrators are not tied to a bank.
    await request(app).get('/api/blood-units').set('Authorization', admin).expect(200);

    await BloodBankModel.updateOne({ _id: bankId }, { $set: { isActive: true } });
    await request(app).get('/api/blood-units').set('Authorization', staffAuth).expect(200);
  });
});

describe('security audit trail', () => {
  it('records a lockout against the real account only', async () => {
    const user = await createUser('ADMIN');
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-password-1' })
        .expect(401);
    }
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.test', password: 'wrong-password-1' })
        .expect(401);
    }
    const locks = await AuditLogModel.find({ action: 'ACCOUNT_LOCKED' }).lean();
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({ actorRole: 'SYSTEM', entityId: user._id });
    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(429);
  });

  it("audits a donor's consent choices: availability and contact preferences", async () => {
    const res = await request(app)
      .post('/api/auth/register/donor')
      .send(donorPayload())
      .expect(201);
    const donor = `Bearer ${res.body.data.accessToken}`;
    await request(app)
      .put('/api/donors/me/availability')
      .set('Authorization', donor)
      .send({ status: 'DO_NOT_CONTACT' })
      .expect(200);
    await request(app)
      .put('/api/donors/me/notification-preferences')
      .set('Authorization', donor)
      .send({ inApp: true, email: false, emergencyOnly: true, maxContactsPerWeek: 1 })
      .expect(200);

    const availability = await AuditLogModel.findOne({
      action: 'DONOR_AVAILABILITY_CHANGED',
    }).lean();
    expect(availability).toMatchObject({
      before: { availabilityStatus: 'AVAILABLE' },
      after: { availabilityStatus: 'DO_NOT_CONTACT' },
    });
    const prefs = await AuditLogModel.findOne({
      action: 'DONOR_CONTACT_PREFERENCES_CHANGED',
    }).lean();
    expect(prefs!.before).toMatchObject({ email: true, emergencyOnly: false });
    expect(prefs!.after).toMatchObject({ email: false, emergencyOnly: true });
  });
});
