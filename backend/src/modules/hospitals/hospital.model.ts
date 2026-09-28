import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import {
  OPERATING_STATUSES,
  VERIFICATION_STATUSES,
  type OperatingStatus,
  type VerificationStatus,
} from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

export interface Hospital {
  _id: Types.ObjectId;
  /** Owner account. Additional member accounts can be added later without changing this model. */
  userId: Types.ObjectId;
  name: string;
  registrationNumber: string;
  address: { line1: string; city: string; state: string; postalCode: string };
  location?: { type: 'Point'; coordinates: [number, number] };
  verificationStatus: VerificationStatus;
  verifiedBy: Types.ObjectId | null;
  verifiedAt: Date | null;
  /** Admin's reason for the current status (rejected / suspended). */
  statusReason: string | null;
  /** Set when a rejected hospital edits its details and goes back to review. */
  resubmittedAt: Date | null;
  operatingStatus: OperatingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type HospitalDocument = HydratedDocument<Hospital>;

const hospitalSchema = new Schema<Hospital>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    registrationNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    address: {
      line1: { type: String, required: true, trim: true, maxlength: 200 },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      state: { type: String, required: true, trim: true, maxlength: 80 },
      postalCode: { type: String, required: true, trim: true, maxlength: 10 },
    },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
    },
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'PENDING' },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    statusReason: { type: String, default: null, maxlength: 500 },
    resubmittedAt: { type: Date, default: null },
    operatingStatus: { type: String, enum: OPERATING_STATUSES, default: 'OPERATIONAL' },
  },
  baseSchemaOptions<Hospital>(),
);

hospitalSchema.index({ userId: 1 }, { unique: true });
hospitalSchema.index({ registrationNumber: 1 }, { unique: true });
hospitalSchema.index({ verificationStatus: 1, createdAt: -1 });
hospitalSchema.index({ location: '2dsphere' }, { sparse: true });

export const HospitalModel = model<Hospital>('Hospital', hospitalSchema);
