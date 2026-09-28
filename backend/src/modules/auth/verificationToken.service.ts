import type { Types } from 'mongoose';
import { ERROR_CODES } from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import { generateToken, hashToken } from '../../utils/crypto.js';
import { VerificationTokenModel, type TokenPurpose } from './verificationToken.model.js';

/** Issues a fresh single-use token, invalidating any earlier unused token for the same purpose. */
export async function issueVerificationToken(
  userId: Types.ObjectId,
  purpose: TokenPurpose,
  ttlMs: number,
): Promise<string> {
  await VerificationTokenModel.deleteMany({ userId, purpose, usedAt: null });
  const token = generateToken();
  await VerificationTokenModel.create({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

/** Atomically marks the token used; a token can therefore never be redeemed twice. */
export async function consumeVerificationToken(
  rawToken: string,
  purpose: TokenPurpose,
): Promise<Types.ObjectId> {
  const now = new Date();
  const token = await VerificationTokenModel.findOneAndUpdate(
    { tokenHash: hashToken(rawToken), purpose, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
  if (!token) {
    throw new AppError(400, ERROR_CODES.INVALID_TOKEN, 'This link is invalid or has expired.');
  }
  return token.userId;
}
