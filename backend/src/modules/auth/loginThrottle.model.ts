import { Schema, model } from 'mongoose';

/**
 * Failed-login counter keyed by the hash of the submitted email, whether or not an account
 * exists, so lockout responses cannot be used to discover which emails are registered.
 */
export interface LoginThrottle {
  key: string;
  failures: number;
  lockedUntil: Date | null;
  expiresAt: Date;
}

const loginThrottleSchema = new Schema<LoginThrottle>({
  key: { type: String, required: true },
  failures: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});

loginThrottleSchema.index({ key: 1 }, { unique: true });
loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginThrottleModel = model<LoginThrottle>('LoginThrottle', loginThrottleSchema);
