import { ERROR_CODES } from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import { hashToken } from '../../utils/crypto.js';
import { LoginThrottleModel } from './loginThrottle.model.js';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const keyFor = (email: string) => hashToken(`login:${email}`);

export async function assertNotLocked(email: string): Promise<void> {
  const throttle = await LoginThrottleModel.findOne({ key: keyFor(email) }).lean();
  if (throttle?.lockedUntil && throttle.lockedUntil > new Date()) {
    const minutes = Math.ceil((throttle.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(
      429,
      ERROR_CODES.ACCOUNT_LOCKED,
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
}

export async function recordFailedLogin(email: string): Promise<void> {
  const now = Date.now();
  const throttle = await LoginThrottleModel.findOneAndUpdate(
    { key: keyFor(email) },
    { $inc: { failures: 1 }, $set: { expiresAt: new Date(now + WINDOW_MS + LOCK_MS) } },
    { upsert: true, returnDocument: 'after' },
  );
  if (throttle.failures >= MAX_FAILURES) {
    await LoginThrottleModel.updateOne(
      { _id: throttle._id },
      { $set: { failures: 0, lockedUntil: new Date(now + LOCK_MS) } },
    );
  }
}

export async function clearLoginThrottle(email: string): Promise<void> {
  await LoginThrottleModel.deleteOne({ key: keyFor(email) });
}
