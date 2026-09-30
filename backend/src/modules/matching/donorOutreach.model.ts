import { Schema, model, type Types } from 'mongoose';
import { OUTREACH_STATUSES, type OutreachStatus } from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

/** One potential donor contacted about one request, and how they answered. */
export interface DonorOutreach {
  _id: Types.ObjectId;
  requestId: Types.ObjectId;
  donorId: Types.ObjectId;
  /** Administrative ranking at the time of contact (0–100). */
  score: number;
  approxDistanceKm: number | null;
  status: OutreachStatus;
  /** null when outreach ran automatically (emergency shortfall). */
  notifiedBy: Types.ObjectId | null;
  notifiedAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const donorOutreachSchema = new Schema<DonorOutreach>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
    donorId: { type: Schema.Types.ObjectId, ref: 'DonorProfile', required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    approxDistanceKm: { type: Number, default: null },
    status: { type: String, enum: OUTREACH_STATUSES, required: true },
    notifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notifiedAt: { type: Date, required: true },
    respondedAt: { type: Date, default: null },
  },
  baseSchemaOptions<DonorOutreach>(),
);

// A donor is contacted at most once per request.
donorOutreachSchema.index({ requestId: 1, donorId: 1 }, { unique: true });
// Weekly contact cap and the donor's own list.
donorOutreachSchema.index({ donorId: 1, notifiedAt: -1 });
// Outreach expiry job.
donorOutreachSchema.index({ status: 1, requestId: 1 });

export const DonorOutreachModel = model<DonorOutreach>('DonorOutreach', donorOutreachSchema);
