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

/** Oldest entries are dropped beyond this many availability changes. */
export const AVAILABILITY_HISTORY_LIMIT = 50;

export interface AvailabilityHistoryEntry {
  status: AvailabilityStatus;
  changedAt: Date;
  availableAgainAt: Date | null;
}

export interface DonorProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  bloodGroup: BloodGroup;
  /** Set only by blood-bank staff (e.g. after a lab result); self-declared groups stay unconfirmed. */
  bloodGroupConfirmed: boolean;
  bloodGroupConfirmedBy: Types.ObjectId | null;
  bloodGroupConfirmedAt: Date | null;
  dateOfBirth: Date;
  location: {
    city: string;
    /** Lower-cased city for indexed, case-insensitive filtering. */
    cityKey: string;
    area: string;
    /** Coarsened (≈1 km) coordinates for matching; never exposed outside the donor's own view. */
    point?: { type: 'Point'; coordinates: [number, number] } | undefined;
  };
  lastDonationAt: Date | null;
  donationCount: number;
  availabilityStatus: AvailabilityStatus;
  availableAgainAt: Date | null;
  availabilityHistory: AvailabilityHistoryEntry[];
  verificationStatus: VerificationStatus;
  notificationPreferences: {
    inApp: boolean;
    email: boolean;
    emergencyOnly: boolean;
    maxContactsPerWeek: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type DonorProfileDocument = HydratedDocument<DonorProfile>;

export const cityKeyOf = (city: string) => city.trim().toLowerCase();

const donorProfileSchema = new Schema<DonorProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    bloodGroupConfirmed: { type: Boolean, default: false },
    bloodGroupConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    bloodGroupConfirmedAt: { type: Date, default: null },
    dateOfBirth: { type: Date, required: true },
    location: {
      city: { type: String, required: true, trim: true, maxlength: 80 },
      cityKey: { type: String, required: true },
      area: { type: String, required: true, trim: true, maxlength: 80 },
      point: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number], default: undefined },
      },
    },
    lastDonationAt: { type: Date, default: null },
    donationCount: { type: Number, default: 0, min: 0 },
    availabilityStatus: { type: String, enum: AVAILABILITY_STATUSES, default: 'AVAILABLE' },
    availableAgainAt: { type: Date, default: null },
    availabilityHistory: {
      type: [
        {
          status: { type: String, enum: AVAILABILITY_STATUSES },
          changedAt: Date,
          availableAgainAt: { type: Date, default: null },
          _id: false,
        },
      ],
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
donorProfileSchema.index({ 'location.cityKey': 1, bloodGroup: 1 });
donorProfileSchema.index({ createdAt: -1 });
donorProfileSchema.index({ 'location.point': '2dsphere' }, { sparse: true });

export const DonorProfileModel = model<DonorProfile>('DonorProfile', donorProfileSchema);
