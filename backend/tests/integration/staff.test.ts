import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { UserModel } from '../../src/modules/users/user.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { createUser, login, tokenFromMail, useMailbox } from '../helpers/factories.js';

useTestDatabase();
const app = createApp();
let mailbox: ReturnType<typeof useMailbox>;
beforeEach(() => {
  mailbox = useMailbox();
});

const bankInput = {
  name: 'Pune Central Blood Bank',
  code: 'pun-central',
  address: { line1: '5 Station Rd', city: 'Pune', state: 'Maharashtra', postalCode: '411001' },
  contactPhone: '+91 20 5555 0000',
  contactEmail: 'Central@Bank.example',
};

async function admin() {
  const user = await createUser('ADMIN');
  const session = await login(app, user.email);
  return { user, auth: `Bearer ${session.accessToken}` };
}

async function createBank(auth: string, overrides: object = {}) {
  const res = await request(app)
    .post('/api/blood-banks')
    .set('Authorization', auth)
    .send({ ...bankInput, ...overrides })
    .expect(201);
  return res.body.data as { id: string; code: string };
}

describe('blood banks', () => {
  it('lets an admin create, list and update blood banks, with audit', async () => {
    const { auth } = await admin();
    const bank = await createBank(auth);
    expect(bank.code).toBe('PUN-CENTRAL');

    await request(app)
      .post('/api/blood-banks')
      .set('Authorization', auth)
      .send(bankInput)
      .expect(409);

    const updated = await request(app)
      .patch(`/api/blood-banks/${bank.id}`)
      .set('Authorization', auth)
      .send({ isActive: false })
      .expect(200);
    expect(updated.body.data.isActive).toBe(false);

    const list = await request(app)
      .get('/api/blood-banks?active=false')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(await AuditLogModel.countDocuments({ entityType: 'BloodBank' })).toBe(2);
  });

  it('lets staff read but not manage blood banks', async () => {
    const { auth } = await admin();
    await createBank(auth);
    const staff = await createUser('BLOOD_BANK_STAFF');
    const staffAuth = `Bearer ${(await login(app, staff.email)).accessToken}`;
    await request(app).get('/api/blood-banks').set('Authorization', staffAuth).expect(200);
    await request(app)
      .post('/api/blood-banks')
      .set('Authorization', staffAuth)
      .send({ ...bankInput, code: 'X1' })
      .expect(403);
  });
});

describe('staff invitations', () => {
  it('invites staff who activate their own account and are signed in', async () => {
    const { auth } = await admin();
    const bank = await createBank(auth);

    const invite = await request(app)
      .post('/api/users/staff')
      .set('Authorization', auth)
      .send({
        name: 'Nurse Joy',
        email: 'joy@bank.example',
        phone: '+91 90000 11111',
        role: 'BLOOD_BANK_STAFF',
        bloodBankId: bank.id,
      })
      .expect(201);
    expect(invite.body.data).toMatchObject({
      accountStatus: 'PENDING',
      bloodBank: { id: bank.id, name: bankInput.name },
    });

    // Cannot sign in before accepting (nobody knows the placeholder password).
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'joy@bank.example', password: 'guess-12345' })
      .expect(401);

    const token = tokenFromMail(mailbox.lastTo('joy@bank.example', 'ACCOUNT_INVITE')!.text);
    const accepted = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, password: 'staff-password-1' })
      .expect(200);
    expect(accepted.body.data.user).toMatchObject({
      role: 'BLOOD_BANK_STAFF',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      profile: { kind: 'STAFF', bloodBankName: bankInput.name },
    });

    await login(app, 'joy@bank.example', 'staff-password-1');
    await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, password: 'another-pass-2' })
      .expect(400);
    expect(
      await AuditLogModel.countDocuments({ action: { $in: ['USER_INVITED', 'INVITE_ACCEPTED'] } }),
    ).toBe(2);
  });

  it('requires an active blood bank for staff', async () => {
    const { auth } = await admin();
    const base = {
      name: 'Staff Member',
      email: 'sm@bank.example',
      phone: '+91 90000 22222',
      role: 'BLOOD_BANK_STAFF',
    };
    const missing = await request(app)
      .post('/api/users/staff')
      .set('Authorization', auth)
      .send(base)
      .expect(400);
    expect(missing.body.details[0].field).toBe('body.bloodBankId');

    const bank = await createBank(auth);
    await request(app)
      .patch(`/api/blood-banks/${bank.id}`)
      .set('Authorization', auth)
      .send({ isActive: false });
    await request(app)
      .post('/api/users/staff')
      .set('Authorization', auth)
      .send({ ...base, bloodBankId: bank.id })
      .expect(400);
  });

  it('cannot activate a pending invite directly; resend works instead', async () => {
    const { auth } = await admin();
    const res = await request(app)
      .post('/api/users/staff')
      .set('Authorization', auth)
      .send({
        name: 'New Admin',
        email: 'na@bank.example',
        phone: '+91 90000 33333',
        role: 'ADMIN',
      })
      .expect(201);
    const id = res.body.data.id;

    await request(app)
      .patch(`/api/users/${id}/status`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE', reason: 'Skip invitation please' })
      .expect(409);
    await request(app)
      .post(`/api/users/${id}/resend-invite`)
      .set('Authorization', auth)
      .expect(202);
    expect(mailbox.sent.filter((m) => m.template === 'ACCOUNT_INVITE')).toHaveLength(2);
  });

  it('re-sends the invitation when an invitee uses "forgot password"', async () => {
    const { auth } = await admin();
    await request(app)
      .post('/api/users/staff')
      .set('Authorization', auth)
      .send({ name: 'Forgetful', email: 'f@bank.example', phone: '+91 90000 44444', role: 'ADMIN' })
      .expect(201);
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'f@bank.example' })
      .expect(202);
    expect(mailbox.sent.filter((m) => m.to === 'f@bank.example').map((m) => m.template)).toEqual([
      'ACCOUNT_INVITE',
      'ACCOUNT_INVITE',
    ]);
  });

  it('only admins can invite', async () => {
    const staff = await createUser('BLOOD_BANK_STAFF');
    const staffAuth = `Bearer ${(await login(app, staff.email)).accessToken}`;
    await request(app)
      .post('/api/users/staff')
      .set('Authorization', staffAuth)
      .send({ name: 'Sneaky', email: 's@bank.example', phone: '+91 90000 55555', role: 'ADMIN' })
      .expect(403);
    expect(await UserModel.exists({ email: 's@bank.example' })).toBeNull();
  });
});

describe('audit log API', () => {
  it('is admin-only and returns actor names with filters', async () => {
    const { auth, user } = await admin();
    await createBank(auth);

    const all = await request(app).get('/api/audit-logs').set('Authorization', auth).expect(200);
    const created = all.body.data.find(
      (e: { action: string }) => e.action === 'BLOOD_BANK_CREATED',
    );
    expect(created.actor).toEqual({ id: user._id.toString(), name: user.name, role: 'ADMIN' });

    const filtered = await request(app)
      .get('/api/audit-logs?entityType=BloodBank')
      .set('Authorization', auth)
      .expect(200);
    expect(
      filtered.body.data.every((e: { entityType: string }) => e.entityType === 'BloodBank'),
    ).toBe(true);

    const today = new Date().toISOString().slice(0, 10);
    const dated = await request(app)
      .get(`/api/audit-logs?from=${today}&to=${today}`)
      .set('Authorization', auth)
      .expect(200);
    expect(dated.body.meta.total).toBe(all.body.meta.total);

    const staff = await createUser('BLOOD_BANK_STAFF');
    const staffAuth = `Bearer ${(await login(app, staff.email)).accessToken}`;
    await request(app).get('/api/audit-logs').set('Authorization', staffAuth).expect(403);
  });

  it('offers no way to modify audit entries', async () => {
    const { auth } = await admin();
    await request(app).delete('/api/audit-logs').set('Authorization', auth).expect(404);
    await request(app).patch('/api/audit-logs').set('Authorization', auth).send({}).expect(404);
  });
});
