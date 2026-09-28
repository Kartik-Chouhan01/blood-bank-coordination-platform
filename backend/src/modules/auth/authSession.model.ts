import { Schema, model, type Types } from 'mongoose';

/**
 * One row per issued refresh token. Rotation creates a new row in the same `family`; presenting
 * an already-rotated token outside the grace window revokes the whole family (theft detection).
 */
export interface AuthSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  family: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: 'ROTATED' | 'LOGOUT' | 'LOGOUT_ALL' | 'REUSE_DETECTED' | 'ADMIN' | null;
  userAgent: string | null;
  createdAt: Date;
}

const authSessionSchema = new Schema<AuthSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    family: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

authSessionSchema.index({ tokenHash: 1 }, { unique: true });
authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ family: 1 });
// MongoDB deletes rows once they expire.
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSessionModel = model<AuthSession>('AuthSession', authSessionSchema);
