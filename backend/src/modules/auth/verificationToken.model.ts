import { Schema, model, type Types } from 'mongoose';

export const TOKEN_PURPOSES = ['EMAIL_VERIFY', 'PASSWORD_RESET', 'ACCOUNT_INVITE'] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

export interface VerificationToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  purpose: TokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

const verificationTokenSchema = new Schema<VerificationToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

verificationTokenSchema.index({ tokenHash: 1 }, { unique: true });
verificationTokenSchema.index({ userId: 1, purpose: 1 });
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationTokenModel = model<VerificationToken>(
  'VerificationToken',
  verificationTokenSchema,
);
