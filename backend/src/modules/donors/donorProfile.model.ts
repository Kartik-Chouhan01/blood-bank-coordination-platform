import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import {
  AVAILABILITY_STATUSES,
  BLOOD_GROUPS,
  VERIFICATION_STATUSES,
  type AvailabilityStatus,
  type BloodGroup,
  type VerificationStatus,
} from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

export interface DonorProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  bloodGroup: BloodGroup;
  /** Set only by blood-bank staff (e.g. after a lab result); self-declared groups stay unconfirmed. */
  bloodGroupConfirmed: boolean;
  dateOfBirth: Date;
  location: {
    city: string;
    area: string;
    /** Approximate (≈1 km) coordinates for matching; never exposed to hospitals. Added in Phase 3. */
    point?: { type: 'Point'; coordinates: [number, number] };
  };
  lastDonationAt: Date | null;
  donationCount: number;
  availabilityStatus: AvailabilityStatus;
  availabilityHistory: { status: AvailabilityStatus; changedAt: Date }[];
  verificationStatus: VerificationStatus;
  notificationPreferences: {
    inApp: boolean;
    email: boolean;
    emergencyOnly: boolean;
    maxContactsPerWeek: number;
  };
}

export type DonorProfileDocument = HydratedDocument<DonorProfile>;

const donorProfileSchema = new Schema<DonorProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    bloodGroupConfirmed: { type: Boolean, default: false },
    dateOfBirth: { type: Date, required: true },
    location: {
      city: { type: String, required: true, trim: true, maxlength: 80 },
      area: { type: String, required: true, trim: true, maxlength: 80 },
      point: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number], default: undefined },
      },
    },
    lastDonationAt: { type: Date, default: null },
    donationCount: { type: Number, default: 0, min: 0 },
    availabilityStatus: { type: String, enum: AVAILABILITY_STATUSES, default: 'AVAILABLE' },
    availabilityHistory: {
      type: [{ status: String, changedAt: Date, _id: false }],
      default: [],
    },
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'PENDING' },
    notificationPreferences: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      emergencyOnly: { type: Boolean, default: false },
      maxContactsPerWeek: { type: Number, default: 3, min: 0, max: 14 },
    },
  },
  baseSchemaOptions<DonorProfile>(),
);

donorProfileSchema.index({ userId: 1 }, { unique: true });
donorProfileSchema.index({ bloodGroup: 1, availabilityStatus: 1, verificationStatus: 1 });
donorProfileSchema.index({ 'location.point': '2dsphere' }, { sparse: true });

export const DonorProfileModel = model<DonorProfile>('DonorProfile', donorProfileSchema);
