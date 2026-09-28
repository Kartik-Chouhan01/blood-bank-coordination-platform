import { Schema, model, type Types } from 'mongoose';
import {
  BLOOD_GROUPS,
  DONATION_TYPES,
  TESTING_STATUSES,
  type BloodGroup,
  type DonationType,
  type TestingStatus,
} from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

/** One collection event. Its blood units are separate documents referencing it. */
export interface Donation {
  _id: Types.ObjectId;
  donorId: Types.ObjectId;
  bloodBankId: Types.ObjectId;
  collectedAt: Date;
  collectedBy: Types.ObjectId;
  donationType: DonationType;
  volumeMl: number;
  testingStatus: TestingStatus;
  testedAt: Date | null;
  testedBy: Types.ObjectId | null;
  testedBloodGroup: BloodGroup | null;
  testNote: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const donationSchema = new Schema<Donation>(
  {
    donorId: { type: Schema.Types.ObjectId, ref: 'DonorProfile', required: true },
    bloodBankId: { type: Schema.Types.ObjectId, ref: 'BloodBank', required: true },
    collectedAt: { type: Date, required: true },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    donationType: { type: String, enum: DONATION_TYPES, required: true },
    volumeMl: { type: Number, required: true, min: 50, max: 1000 },
    testingStatus: { type: String, enum: TESTING_STATUSES, default: 'PENDING' },
    testedAt: { type: Date, default: null },
    testedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    testedBloodGroup: { type: String, enum: [...BLOOD_GROUPS, null], default: null },
    testNote: { type: String, default: null, maxlength: 500 },
    notes: { type: String, default: null, maxlength: 500 },
  },
  baseSchemaOptions<Donation>(),
);

donationSchema.index({ donorId: 1, collectedAt: -1 });
donationSchema.index({ bloodBankId: 1, collectedAt: -1 });
donationSchema.index({ testingStatus: 1, collectedAt: -1 });

export const DonationModel = model<Donation>('Donation', donationSchema);
