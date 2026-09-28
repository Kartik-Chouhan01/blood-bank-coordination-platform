import { Types, type ClientSession } from 'mongoose';
import {
  ERROR_CODES,
  type AuthSessionResponse,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterDonorInput,
  type RegisterHospitalInput,
  type ResetPasswordInput,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/AppError.js';
import { withTransaction } from '../../utils/mongoose.js';
import type { Actor } from '../../utils/actor.js';
import { recordAudit } from '../audit/audit.service.js';
import { DonorProfileModel, cityKeyOf } from '../donors/donorProfile.model.js';
import { HospitalModel } from '../hospitals/hospital.model.js';
import { UserModel, type User } from '../users/user.model.js';
import { toAuthUser } from '../users/user.presenter.js';
import { signAccessToken } from './accessToken.js';
import {
  EMAIL_VERIFY_TTL_HOURS,
  PASSWORD_RESET_TTL_MINUTES,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './auth.emails.js';
import { assertNotLocked, clearLoginThrottle, recordFailedLogin } from './loginThrottle.service.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';
import {
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  type IssuedRefreshToken,
} from './session.service.js';
import { consumeVerificationToken, issueVerificationToken } from './verificationToken.service.js';

/** Request metadata (no identity) for actions performed before/while signing in. */
type RequestContext = Omit<Actor, 'userId' | 'role'>;

export interface SessionResult {
  response: AuthSessionResponse;
  refresh: IssuedRefreshToken;
}

const invalidCredentials = () =>
  new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Incorrect email or password.');

const accountSuspended = () =>
  new AppError(
    403,
    ERROR_CODES.ACCOUNT_SUSPENDED,
    'This account is not active. Please contact support.',
  );

async function buildSession(user: User, refresh: IssuedRefreshToken): Promise<SessionResult> {
  return {
    refresh,
    response: {
      user: await toAuthUser(user),
      accessToken: signAccessToken({
        sub: user._id.toString(),
        role: user.role,
        tv: user.tokenVersion,
      }),
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    },
  };
}

function isDuplicateKey(err: unknown, field: string): boolean {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e?.code === 11000 && !!e.keyPattern && field in e.keyPattern;
}

async function sendNewVerificationEmail(user: Pick<User, '_id' | 'email' | 'name'>) {
  const token = await issueVerificationToken(
    user._id,
    'EMAIL_VERIFY',
    EMAIL_VERIFY_TTL_HOURS * 60 * 60 * 1000,
  );
  await sendVerificationEmail(user.email, user.name, token);
}

// ─── Registration ────────────────────────────────────────────────────────────

async function registerAccount(
  input: RegisterDonorInput | RegisterHospitalInput,
  role: 'DONOR' | 'HOSPITAL',
  createProfile: (userId: Types.ObjectId, session: ClientSession) => Promise<Types.ObjectId>,
  context: RequestContext,
): Promise<SessionResult> {
  const passwordHash = await hashPassword(input.password);
  const userId = new Types.ObjectId();

  try {
    await withTransaction(async (session) => {
      await UserModel.create(
        [
          {
            _id: userId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            passwordHash,
            role,
            consentAcceptedAt: new Date(),
            lastLoginAt: new Date(),
          },
        ],
        { session },
      );
      const profileId = await createProfile(userId, session);
      await recordAudit(
        { userId, role, ...context },
        {
          action: 'USER_REGISTERED',
          entityType: 'User',
          entityId: userId,
          after: { role, profileId: profileId.toString() },
        },
        session,
      );
    });
  } catch (err) {
    if (isDuplicateKey(err, 'email')) {
      throw AppError.conflict(
        'An account with this email already exists.',
        ERROR_CODES.DUPLICATE_RESOURCE,
      );
    }
    if (isDuplicateKey(err, 'registrationNumber')) {
      throw AppError.conflict(
        'A hospital with this registration number is already registered.',
        ERROR_CODES.DUPLICATE_RESOURCE,
      );
    }
    throw err;
  }

  const user = (await UserModel.findById(userId).lean())!;
  await sendNewVerificationEmail(user);
  const refresh = await issueRefreshToken(userId, context.userAgent);
  return buildSession(user, refresh);
}

export function registerDonor(input: RegisterDonorInput, context: RequestContext) {
  return registerAccount(
    input,
    'DONOR',
    async (userId, session) => {
      const [profile] = await DonorProfileModel.create(
        [
          {
            userId,
            bloodGroup: input.bloodGroup,
            dateOfBirth: new Date(input.dateOfBirth),
            location: { city: input.city, cityKey: cityKeyOf(input.city), area: input.area },
            availabilityHistory: [
              { status: 'AVAILABLE', changedAt: new Date(), availableAgainAt: null },
            ],
          },
        ],
        { session },
      );
      return profile!._id;
    },
    context,
  );
}

export function registerHospital(input: RegisterHospitalInput, context: RequestContext) {
  return registerAccount(
    input,
    'HOSPITAL',
    async (userId, session) => {
      const [hospital] = await HospitalModel.create(
        [
          {
            userId,
            name: input.hospitalName,
            registrationNumber: input.registrationNumber,
            address: input.address,
          },
        ],
        { session },
      );
      return hospital!._id;
    },
    context,
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function login(input: LoginInput, context: RequestContext): Promise<SessionResult> {
  await assertNotLocked(input.email);

  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash').lean();
  const passwordOk = user
    ? await verifyPassword(input.password, user.passwordHash)
    : (await burnPasswordCheck(input.password), false);

  if (!user || !passwordOk) {
    await recordFailedLogin(input.email);
    throw invalidCredentials();
  }
  // Only reveal account status to someone who proved they know the password.
  if (user.accountStatus !== 'ACTIVE') throw accountSuspended();

  await clearLoginThrottle(input.email);
  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  logger.info({ userId: user._id.toString(), requestId: context.requestId }, 'User signed in');

  const refresh = await issueRefreshToken(user._id, context.userAgent);
  return buildSession(user, refresh);
}

export async function refreshSession(
  rawToken: string | undefined,
  context: RequestContext,
): Promise<SessionResult> {
  if (!rawToken) {
    throw new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'No active session. Please sign in.');
  }
  const { userId, refresh } = await rotateRefreshToken(rawToken, context);
  const user = await UserModel.findById(userId).lean();
  if (!user || user.accountStatus !== 'ACTIVE') {
    await revokeRefreshToken(refresh.token);
    throw new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'Your session has ended. Please sign in.');
  }
  return buildSession(user, refresh);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (rawToken) await revokeRefreshToken(rawToken);
}

/** Signs out every device: revokes refresh tokens and invalidates outstanding access tokens. */
export async function logoutAll(actor: Actor): Promise<void> {
  const userId = actor.userId!;
  await withTransaction(async (session) => {
    await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }, { session });
    await revokeAllRefreshTokens(userId, 'LOGOUT_ALL', session);
    await recordAudit(
      actor,
      { action: 'SESSIONS_REVOKED', entityType: 'User', entityId: userId },
      session,
    );
  });
}

export async function getCurrentUser(actor: Actor) {
  const user = await UserModel.findById(actor.userId).lean();
  if (!user) throw AppError.notFound('User');
  return toAuthUser(user);
}

// ─── Email verification ──────────────────────────────────────────────────────

export async function verifyEmail(rawToken: string, context: RequestContext): Promise<void> {
  const userId = await consumeVerificationToken(rawToken, 'EMAIL_VERIFY');
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, emailVerified: false },
    { $set: { emailVerified: true } },
  ).lean();
  if (user) {
    await recordAudit(
      { userId, role: user.role, ...context },
      { action: 'EMAIL_VERIFIED', entityType: 'User', entityId: userId },
    );
  }
}

export async function resendVerification(actor: Actor): Promise<void> {
  const user = await UserModel.findById(actor.userId).lean();
  if (!user || user.emailVerified) return;
  await sendNewVerificationEmail(user);
}

// ─── Passwords ───────────────────────────────────────────────────────────────

/** Always succeeds from the caller's view, so it cannot be used to discover registered emails. */
export async function forgotPassword(email: string): Promise<void> {
  const user = await UserModel.findOne({ email, accountStatus: 'ACTIVE' }).lean();
  if (!user) return;
  const token = await issueVerificationToken(
    user._id,
    'PASSWORD_RESET',
    PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
  );
  await sendPasswordResetEmail(user.email, user.name, token);
}

async function replacePassword(
  userId: Types.ObjectId,
  newPassword: string,
  actor: Actor,
  action: 'PASSWORD_RESET' | 'PASSWORD_CHANGED',
  extra: Partial<Pick<User, 'emailVerified'>> = {},
): Promise<User> {
  const passwordHash = await hashPassword(newPassword);
  return withTransaction(async (session) => {
    const user = await UserModel.findOneAndUpdate(
      { _id: userId },
      { $set: { passwordHash, ...extra }, $inc: { tokenVersion: 1 } },
      { session, returnDocument: 'after' },
    ).lean();
    if (!user) throw AppError.notFound('User');
    await revokeAllRefreshTokens(userId, 'LOGOUT_ALL', session);
    await recordAudit(actor, { action, entityType: 'User', entityId: userId }, session);
    return user;
  });
}

export async function resetPassword(
  input: ResetPasswordInput,
  context: RequestContext,
): Promise<void> {
  const userId = await consumeVerificationToken(input.token, 'PASSWORD_RESET');
  const current = await UserModel.findById(userId).lean();
  if (!current) throw AppError.notFound('User');
  // Using the emailed link also proves ownership of the address.
  const user = await replacePassword(
    userId,
    input.password,
    { userId, role: current.role, ...context },
    'PASSWORD_RESET',
    { emailVerified: true },
  );
  await clearLoginThrottle(user.email);
  await sendPasswordChangedEmail(user.email, user.name);
}

/** Changes the password, signs out all other devices and returns a fresh session for this one. */
export async function changePassword(
  actor: Actor,
  input: ChangePasswordInput,
): Promise<SessionResult> {
  const existing = await UserModel.findById(actor.userId).select('+passwordHash').lean();
  if (!existing) throw AppError.notFound('User');
  if (!(await verifyPassword(input.currentPassword, existing.passwordHash))) {
    throw AppError.validation([
      { field: 'body.currentPassword', message: 'Current password is incorrect' },
    ]);
  }

  const user = await replacePassword(existing._id, input.newPassword, actor, 'PASSWORD_CHANGED');
  await sendPasswordChangedEmail(user.email, user.name);
  const refresh = await issueRefreshToken(user._id, actor.userAgent);
  return buildSession(user, refresh);
}
