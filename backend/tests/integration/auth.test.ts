import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AuditLogModel } from '../../src/modules/audit/auditLog.model.js';
import { AuthSessionModel } from '../../src/modules/auth/authSession.model.js';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model.js';
import { UserModel } from '../../src/modules/users/user.model.js';
import { useTestDatabase } from '../helpers/testDb.js';
import {
  PASSWORD,
  TEST_ORIGIN,
  createUser,
  donorPayload,
  hospitalPayload,
  login,
  refreshCookieFrom,
  tokenFromMail,
  useMailbox,
} from '../helpers/factories.js';

useTestDatabase();
const app = createApp();
let mailbox: ReturnType<typeof useMailbox>;

beforeEach(() => {
  mailbox = useMailbox();
});

const refresh = (cookie: string) =>
  request(app).post('/api/auth/refresh').set('Cookie', cookie).set('Origin', TEST_ORIGIN);

describe('registration', () => {
  it('registers a donor, signs them in and sends a verification email', async () => {
    const payload = donorPayload();
    const res = await request(app).post('/api/auth/register/donor').send(payload).expect(201);

    expect(res.body.data.user).toMatchObject({
      email: payload.email,
      role: 'DONOR',
      emailVerified: false,
      profile: { kind: 'DONOR', bloodGroup: 'O+', city: 'Pune', verificationStatus: 'PENDING' },
    });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion/);
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Strict/i);

    expect(mailbox.lastTo(payload.email, 'EMAIL_VERIFY')).toBeDefined();
    expect(await AuditLogModel.countDocuments({ action: 'USER_REGISTERED' })).toBe(1);
    // Registration signs the user in, so it counts as their first sign-in.
    expect((await UserModel.findOne({ email: payload.email }))!.lastLoginAt).toBeInstanceOf(Date);
  });

  it('ignores a client-supplied role (no self-registration as ADMIN)', async () => {
    const res = await request(app)
      .post('/api/auth/register/donor')
      .send(donorPayload({ role: 'ADMIN', accountStatus: 'ACTIVE', emailVerified: true }))
      .expect(201);
    expect(res.body.data.user.role).toBe('DONOR');
    expect(res.body.data.user.emailVerified).toBe(false);
  });

  it('rejects a duplicate email with 409', async () => {
    const payload = donorPayload();
    await request(app).post('/api/auth/register/donor').send(payload).expect(201);
    const res = await request(app)
      .post('/api/auth/register/donor')
      .send({ ...payload, email: payload.email.toUpperCase() })
      .expect(409);
    expect(res.body.errorCode).toBe('DUPLICATE_RESOURCE');
  });

  it('registers a hospital as pending verification', async () => {
    const res = await request(app)
      .post('/api/auth/register/hospital')
      .send(hospitalPayload())
      .expect(201);
    expect(res.body.data.user.profile).toMatchObject({
      kind: 'HOSPITAL',
      hospitalName: 'City General Hospital',
      verificationStatus: 'PENDING',
    });
  });

  it('rolls back the user when the hospital profile cannot be created (transaction)', async () => {
    const first = hospitalPayload();
    await request(app).post('/api/auth/register/hospital').send(first).expect(201);

    const second = hospitalPayload({ registrationNumber: first.registrationNumber });
    await request(app).post('/api/auth/register/hospital').send(second).expect(409);

    expect(await UserModel.exists({ email: second.email })).toBeNull();
    expect(await HospitalModel.countDocuments()).toBe(1);
  });

  it('returns field-level validation errors', async () => {
    const res = await request(app)
      .post('/api/auth/register/donor')
      .send(donorPayload({ email: 'not-an-email', password: 'short', bloodGroup: 'Z' }))
      .expect(400);
    const fields = res.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(['body.email', 'body.password', 'body.bloodGroup']),
    );
  });
});

describe('login', () => {
  it('signs in with correct credentials and records lastLoginAt', async () => {
    const user = await createUser('DONOR');
    const session = await login(app, user.email);
    expect(session.accessToken).toBeTruthy();
    expect((await UserModel.findById(user._id))!.lastLoginAt).toBeInstanceOf(Date);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const user = await createUser('DONOR');
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'nope-12345' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.test', password: 'nope-12345' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    expect(wrong.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('locks sign-in after 5 failures, even with the right password', async () => {
    const user = await createUser('DONOR');
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-pass-1' })
        .expect(401);
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.errorCode).toBe('ACCOUNT_LOCKED');
  });

  it('locks unknown emails too, so lockout does not reveal which accounts exist', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.test', password: 'x' });
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.test', password: 'x' });
    expect(res.body.errorCode).toBe('ACCOUNT_LOCKED');
  });

  it('refuses suspended accounts only after the password is proven', async () => {
    const user = await createUser('DONOR', { accountStatus: 'SUSPENDED' });
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'wrong-pass-1' });
    expect(wrong.body.errorCode).toBe('INVALID_CREDENTIALS');
    const right = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(right.status).toBe(403);
    expect(right.body.errorCode).toBe('ACCOUNT_SUSPENDED');
  });

  it('rejects NoSQL operator injection', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } })
      .expect(400);
    expect(res.body.success).toBe(false);
  });
});

describe('access tokens', () => {
  it('returns the current user for a valid token', async () => {
    const user = await createUser('DONOR');
    const { accessToken } = await login(app, user.email);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.id).toBe(user._id.toString());
  });

  it('rejects missing, tampered and expired tokens', async () => {
    await request(app).get('/api/auth/me').expect(401);

    const user = await createUser('DONOR');
    const { accessToken } = await login(app, user.email);
    const tampered = `${accessToken.slice(0, -2)}xx`;
    const bad = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
    expect(bad.body.errorCode).toBe('INVALID_TOKEN');

    const expired = jwt.sign({ role: 'DONOR', tv: 0 }, process.env.JWT_ACCESS_SECRET!, {
      subject: user._id.toString(),
      issuer: 'bbms-api',
      audience: 'bbms-web',
      expiresIn: -10,
    });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    expect(res.body.errorCode).toBe('TOKEN_EXPIRED');
  });

  it('does not trust the role inside the token (a forged ADMIN claim still gets 403)', async () => {
    const donor = await createUser('DONOR');
    const forged = jwt.sign({ role: 'ADMIN', tv: 0 }, process.env.JWT_ACCESS_SECRET!, {
      subject: donor._id.toString(),
      issuer: 'bbms-api',
      audience: 'bbms-web',
      expiresIn: 60,
    });
    await request(app).get('/api/users').set('Authorization', `Bearer ${forged}`).expect(403);
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token and access token', async () => {
    const user = await createUser('DONOR');
    const { refreshCookie } = await login(app, user.email);
    const res = await refresh(refreshCookie).expect(200);
    expect(refreshCookieFrom(res)).not.toBe(refreshCookie);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('lets exactly one of two concurrent refreshes win; the other is told to retry', async () => {
    const user = await createUser('DONOR');
    const { refreshCookie } = await login(app, user.email);
    const results = await Promise.all([refresh(refreshCookie), refresh(refreshCookie)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);
    expect(results.find((r) => r.status === 401)!.body.errorCode).toBe('SESSION_ROTATED');
  });

  it('treats reuse of an old token as theft and revokes the whole session family', async () => {
    const user = await createUser('DONOR');
    const { refreshCookie: original } = await login(app, user.email);
    const rotated = refreshCookieFrom(await refresh(original).expect(200));

    // Move the rotation outside the grace window.
    await AuthSessionModel.updateMany(
      { revokedReason: 'ROTATED' },
      { $set: { revokedAt: new Date(Date.now() - 60_000) } },
    );

    const reuse = await refresh(original).expect(401);
    expect(reuse.body.errorCode).toBe('SESSION_EXPIRED');
    // The legitimate-looking newer token is now dead too.
    await refresh(rotated).expect(401);
    expect(await AuditLogModel.countDocuments({ action: 'REFRESH_TOKEN_REUSE_DETECTED' })).toBe(1);
  });

  it('rejects refresh from a foreign origin (CSRF guard)', async () => {
    const user = await createUser('DONOR');
    const { refreshCookie } = await login(app, user.email);
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(res.body.errorCode).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('fails cleanly without a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh').expect(401);
    expect(res.body.errorCode).toBe('SESSION_EXPIRED');
  });
});

describe('logout', () => {
  it('revokes the current refresh token', async () => {
    const user = await createUser('DONOR');
    const { refreshCookie } = await login(app, user.email);
    await request(app).post('/api/auth/logout').set('Cookie', refreshCookie).expect(200);
    await refresh(refreshCookie).expect(401);
  });

  it('logout-all invalidates every session and outstanding access token', async () => {
    const user = await createUser('DONOR');
    const phone = await login(app, user.email);
    const laptop = await login(app, user.email);

    await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .expect(200);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${phone.accessToken}`)
      .expect(401);
    expect(res.body.errorCode).toBe('SESSION_EXPIRED');
    await refresh(phone.refreshCookie).expect(401);
  });
});

describe('email verification', () => {
  it('verifies with the emailed link and the link works only once', async () => {
    const payload = donorPayload();
    await request(app).post('/api/auth/register/donor').send(payload).expect(201);
    const token = tokenFromMail(mailbox.lastTo(payload.email, 'EMAIL_VERIFY')!.text);

    await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
    expect((await UserModel.findOne({ email: payload.email }))!.emailVerified).toBe(true);

    const again = await request(app).post('/api/auth/verify-email').send({ token }).expect(400);
    expect(again.body.errorCode).toBe('INVALID_TOKEN');
  });

  it('resending invalidates the previous link', async () => {
    const payload = donorPayload();
    const reg = await request(app).post('/api/auth/register/donor').send(payload).expect(201);
    const firstToken = tokenFromMail(mailbox.lastTo(payload.email, 'EMAIL_VERIFY')!.text);

    await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .expect(200);

    await request(app).post('/api/auth/verify-email').send({ token: firstToken }).expect(400);
    const secondToken = tokenFromMail(mailbox.lastTo(payload.email, 'EMAIL_VERIFY')!.text);
    await request(app).post('/api/auth/verify-email').send({ token: secondToken }).expect(200);
  });
});

describe('password reset & change', () => {
  it('does not reveal whether an email is registered', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@example.test' })
      .expect(202);
    expect(mailbox.sent).toHaveLength(0);
  });

  it('resets the password, signs out old sessions, and the link is single-use', async () => {
    const user = await createUser('DONOR');
    const oldSession = await login(app, user.email);

    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(202);
    const token = tokenFromMail(mailbox.lastTo(user.email, 'PASSWORD_RESET')!.text);

    const newPassword = 'brand-new-password-7';
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(401);
    await login(app, user.email, newPassword);
    await refresh(oldSession.refreshCookie).expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldSession.accessToken}`)
      .expect(401);
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'another-pass-8' })
      .expect(400);
    expect(mailbox.lastTo(user.email, 'PASSWORD_CHANGED')).toBeDefined();
  });

  it('changes the password with the current one and keeps this device signed in', async () => {
    const user = await createUser('DONOR');
    const session = await login(app, user.email);

    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'not-it-12345', newPassword: 'fresh-password-42' })
      .expect(400);
    expect(wrong.body.details[0].field).toBe('body.currentPassword');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'fresh-password-42' })
      .expect(200);

    // Old token is revoked; the new one returned in the response works.
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
  });
});
