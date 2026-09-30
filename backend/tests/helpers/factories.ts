import request from 'supertest';
import type { Express } from 'express';
import type { Role } from '@bbms/shared';
import { BloodBankModel } from '../../src/modules/bloodBanks/bloodBank.model.js';
import { UserModel } from '../../src/modules/users/user.model.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { REFRESH_COOKIE } from '../../src/modules/auth/authCookies.js';
import { InMemoryMailAdapter, setMailAdapter } from '../../src/infrastructure/mail/mailer.js';

export const PASSWORD = 'correct-horse-battery-9';
export const TEST_ORIGIN = 'http://localhost:5173';

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export function donorPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Donor',
    email: `donor-${unique()}@example.test`,
    phone: '+91 98765 43210',
    password: PASSWORD,
    consent: true,
    bloodGroup: 'O+',
    dateOfBirth: '1990-05-17',
    city: 'Pune',
    area: 'Hinjawadi',
    ...overrides,
  };
}

export function hospitalPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Hospital Contact',
    email: `hospital-${unique()}@example.test`,
    phone: '+91 20 1234 5678',
    password: PASSWORD,
    consent: true,
    hospitalName: 'City General Hospital',
    registrationNumber: `REG-${unique()}`.toUpperCase(),
    address: { line1: '1 Hospital Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001' },
    ...overrides,
  };
}

/** The active bank staff users belong to when a test does not pick one (staff always need one). */
async function defaultBankId() {
  const bank = await BloodBankModel.findOneAndUpdate(
    { code: 'TESTBANK' },
    {
      $setOnInsert: {
        name: 'Default test bank',
        code: 'TESTBANK',
        address: { line1: '1 Test Rd', city: 'Pune', state: 'MH', postalCode: '411001' },
        contactPhone: '+91 20 0000 0000',
        contactEmail: 'test-bank@example.test',
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return bank!._id;
}

/** Inserts a user directly (e.g. staff/admin accounts that cannot self-register). */
export async function createUser(role: Role, overrides: Record<string, unknown> = {}) {
  const email = `${role.toLowerCase()}-${unique()}@example.test`;
  return UserModel.create({
    name: `Test ${role}`,
    email,
    phone: '+91 90000 00000',
    passwordHash: await hashPassword(PASSWORD),
    role,
    emailVerified: true,
    ...(role === 'BLOOD_BANK_STAFF' &&
      !('bloodBankId' in overrides) && {
        bloodBankId: await defaultBankId(),
      }),
    ...overrides,
  });
}

export interface TestSession {
  accessToken: string;
  refreshCookie: string;
  userId: string;
}

/** Extracts "bbms_rt=<value>" from a Set-Cookie header for replay in later requests. */
export function refreshCookieFrom(res: request.Response): string {
  const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = header.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0]!;
}

export async function login(
  app: Express,
  email: string,
  password = PASSWORD,
): Promise<TestSession> {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return {
    accessToken: res.body.data.accessToken,
    refreshCookie: refreshCookieFrom(res),
    userId: res.body.data.user.id,
  };
}

export function useMailbox() {
  const mailbox = new InMemoryMailAdapter();
  setMailAdapter(mailbox);
  return mailbox;
}

/** Pulls the token out of an emailed link (`...#token=...`). */
export function tokenFromMail(text: string): string {
  const match = /#token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error('No token link in email');
  return match[1]!;
}
