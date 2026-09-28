import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import { createUser, login, useMailbox } from '../helpers/factories.js';

useTestDatabase();
useMailbox();
const app = createApp();

async function signedIn(role: Parameters<typeof createUser>[0], overrides = {}) {
  const user = await createUser(role, overrides);
  const session = await login(app, user.email);
  return { user, auth: `Bearer ${session.accessToken}`, session };
}

describe('role-based access to /api/users', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/users').expect(401);
  });

  it.each(['DONOR', 'HOSPITAL', 'BLOOD_BANK_STAFF'] as const)('forbids %s', async (role) => {
    const { auth } = await signedIn(role);
    const res = await request(app).get('/api/users').set('Authorization', auth).expect(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });

  it('lets an admin list, filter and search users with pagination', async () => {
    const { auth } = await signedIn('ADMIN');
    await createUser('DONOR', { name: 'Asha Patil' });
    await createUser('DONOR', { name: 'Ravi Kumar' });
    await createUser('HOSPITAL');

    const page = await request(app)
      .get('/api/users?limit=2&page=1')
      .set('Authorization', auth)
      .expect(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(JSON.stringify(page.body)).not.toMatch(/passwordHash/);

    const donors = await request(app)
      .get('/api/users?role=DONOR')
      .set('Authorization', auth)
      .expect(200);
    expect(donors.body.data.every((u: { role: string }) => u.role === 'DONOR')).toBe(true);

    const search = await request(app)
      .get('/api/users?search=asha')
      .set('Authorization', auth)
      .expect(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].name).toBe('Asha Patil');
  });

  it('treats regex characters in search as plain text', async () => {
    const { auth } = await signedIn('ADMIN');
    await request(app)
      .get('/api/users?search=.*')
      .set('Authorization', auth)
      .expect(200)
      .then((res) => expect(res.body.data).toHaveLength(0));
  });

  it('validates query parameters', async () => {
    const { auth } = await signedIn('ADMIN');
    await request(app).get('/api/users?limit=1000').set('Authorization', auth).expect(400);
    await request(app).get('/api/users?role=SUPERUSER').set('Authorization', auth).expect(400);
  });
});

describe('PATCH /api/users/:id/status', () => {
  it('suspends a user, cuts off their sessions immediately and audits the reason', async () => {
    const admin = await signedIn('ADMIN');
    const donor = await signedIn('DONOR');

    const res = await request(app)
      .patch(`/api/users/${donor.user._id}/status`)
      .set('Authorization', admin.auth)
      .send({ status: 'SUSPENDED', reason: 'Reported misuse of contact details' })
      .expect(200);
    expect(res.body.data.accountStatus).toBe('SUSPENDED');

    await request(app).get('/api/auth/me').set('Authorization', donor.auth).expect(401);
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', donor.session.refreshCookie)
      .expect(401);

    const audit = await AuditLogModel.findOne({ action: 'USER_STATUS_CHANGED' }).lean();
    expect(audit).toMatchObject({
      actorRole: 'ADMIN',
      before: { accountStatus: 'ACTIVE' },
      after: { accountStatus: 'SUSPENDED' },
      reason: 'Reported misuse of contact details',
    });
    expect(audit!.actorId!.toString()).toBe(admin.user._id.toString());
  });

  it('requires a reason', async () => {
    const admin = await signedIn('ADMIN');
    const donor = await createUser('DONOR');
    await request(app)
      .patch(`/api/users/${donor._id}/status`)
      .set('Authorization', admin.auth)
      .send({ status: 'SUSPENDED' })
      .expect(400);
  });

  it('prevents admins from suspending themselves', async () => {
    const admin = await signedIn('ADMIN');
    await request(app)
      .patch(`/api/users/${admin.user._id}/status`)
      .set('Authorization', admin.auth)
      .send({ status: 'SUSPENDED', reason: 'testing self suspension' })
      .expect(409);
  });

  it('returns 400 for malformed ids and 404 for unknown ones', async () => {
    const admin = await signedIn('ADMIN');
    await request(app).get('/api/users/not-an-id').set('Authorization', admin.auth).expect(400);
    await request(app)
      .get('/api/users/64b7f0000000000000000000')
      .set('Authorization', admin.auth)
      .expect(404);
  });

  it('forbids non-admins from changing status', async () => {
    const donor = await signedIn('DONOR');
    const other = await createUser('DONOR');
    await request(app)
      .patch(`/api/users/${other._id}/status`)
      .set('Authorization', donor.auth)
      .send({ status: 'SUSPENDED', reason: 'I do not like them' })
      .expect(403);
  });
});
