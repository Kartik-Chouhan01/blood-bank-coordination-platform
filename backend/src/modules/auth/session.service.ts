import { randomUUID } from 'node:crypto';
import type { ClientSession, Types } from 'mongoose';
import { ERROR_CODES } from '@bbms/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/AppError.js';
import { generateToken, hashToken } from '../../utils/crypto.js';
import { SYSTEM_ACTOR, type Actor } from '../../utils/actor.js';
import { recordAudit } from '../audit/audit.service.js';
import { AuthSessionModel, type AuthSession } from './authSession.model.js';

/**
 * Two tabs refreshing at the same moment present the same token; the loser gets SESSION_ROTATED
 * and retries with the new cookie instead of being treated as a thief.
 */
const ROTATION_GRACE_MS = 15_000;

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

const sessionExpired = () =>
  new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'Your session has expired. Please sign in again.');

export async function issueRefreshToken(
  userId: Types.ObjectId,
  userAgent: string | undefined,
  family: string = randomUUID(),
  session?: ClientSession,
): Promise<IssuedRefreshToken> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await AuthSessionModel.create(
    [{ userId, family, tokenHash: hashToken(token), expiresAt, userAgent: userAgent ?? null }],
    { session },
  );
  return { token, expiresAt };
}

/**
 * Exchanges a refresh token for a new one (rotation). Returns the owning user id; the caller
 * checks the account is still allowed to sign in.
 */
export async function rotateRefreshToken(
  rawToken: string,
  context: Omit<Actor, 'userId' | 'role'>,
): Promise<{ userId: Types.ObjectId; refresh: IssuedRefreshToken }> {
  const now = new Date();
  const existing = await AuthSessionModel.findOne({ tokenHash: hashToken(rawToken) }).lean();
  if (!existing || existing.expiresAt <= now) throw sessionExpired();

  if (existing.revokedAt) {
    await handleRevokedTokenUse(existing, now, context);
  }

  // Atomically claim the token: of two concurrent requests, exactly one wins.
  const claimed = await AuthSessionModel.findOneAndUpdate(
    { _id: existing._id, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: 'ROTATED' } },
  );
  if (!claimed) {
    throw new AppError(401, ERROR_CODES.SESSION_ROTATED, 'Session was refreshed elsewhere; retry.');
  }

  const refresh = await issueRefreshToken(existing.userId, context.userAgent, existing.family);
  return { userId: existing.userId, refresh };
}

async function handleRevokedTokenUse(
  existing: AuthSession,
  now: Date,
  context: Omit<Actor, 'userId' | 'role'>,
): Promise<never> {
  const withinGrace =
    existing.revokedReason === 'ROTATED' &&
    now.getTime() - existing.revokedAt!.getTime() < ROTATION_GRACE_MS;
  if (withinGrace) {
    throw new AppError(401, ERROR_CODES.SESSION_ROTATED, 'Session was refreshed elsewhere; retry.');
  }

  if (existing.revokedReason === 'ROTATED') {
    // An old token came back long after rotation: assume it was stolen and end the whole chain.
    await AuthSessionModel.updateMany(
      { family: existing.family, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: 'REUSE_DETECTED' } },
    );
    logger.warn({ userId: existing.userId.toString() }, 'Refresh token reuse detected');
    await recordAudit(
      { ...SYSTEM_ACTOR, ...context },
      {
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'User',
        entityId: existing.userId,
      },
    );
  }
  throw sessionExpired();
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await AuthSessionModel.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'LOGOUT' } },
  );
}

export async function revokeAllRefreshTokens(
  userId: Types.ObjectId,
  reason: 'LOGOUT_ALL' | 'ADMIN',
  session?: ClientSession,
): Promise<void> {
  await AuthSessionModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
    { session },
  );
}
