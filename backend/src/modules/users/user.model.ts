import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { ACCOUNT_STATUSES, ROLES, type AccountStatus, type Role } from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

export interface User {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Incremented to invalidate every access token issued before (logout-all, suspension, reset). */
  tokenVersion: number;
  consentAcceptedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, required: true, default: 'ACTIVE' },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    consentAcceptedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  baseSchemaOptions<User>(['passwordHash', 'tokenVersion']),
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, accountStatus: 1, createdAt: -1 });

export const UserModel = model<User>('User', userSchema);
