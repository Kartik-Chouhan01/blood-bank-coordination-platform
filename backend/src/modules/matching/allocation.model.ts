import { Schema, model, type Types } from 'mongoose';
import { ALLOCATION_STATUSES, type AllocationStatus } from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

/**
 * Links one blood unit to one request. Released allocations are kept for traceability; a unit can
 * appear in many allocations over time but in at most one live (RESERVED/ISSUED) one.
 */
export interface Allocation {
  _id: Types.ObjectId;
  requestId: Types.ObjectId;
  unitId: Types.ObjectId;
  /** Denormalised from the unit so staff scoping needs no extra lookup. */
  bloodBankId: Types.ObjectId;
  status: AllocationStatus;
  reservedBy: Types.ObjectId | null;
  reservedAt: Date;
  holdUntil: Date;
  issuedBy: Types.ObjectId | null;
  issuedAt: Date | null;
  receivedBy: Types.ObjectId | null;
  receivedAt: Date | null;
  /** null for automatic releases (hold expiry, unit expiry, request closed). */
  releasedBy: Types.ObjectId | null;
  releasedAt: Date | null;
  releaseReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const allocationSchema = new Schema<Allocation>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'BloodUnit', required: true },
    bloodBankId: { type: Schema.Types.ObjectId, ref: 'BloodBank', required: true },
    status: { type: String, enum: ALLOCATION_STATUSES, required: true },
    reservedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reservedAt: { type: Date, required: true },
    holdUntil: { type: Date, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    issuedAt: { type: Date, default: null },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    receivedAt: { type: Date, default: null },
    releasedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: null, maxlength: 500 },
  },
  baseSchemaOptions<Allocation>(),
);

// The database-level double-booking guard: a unit can be live in only one allocation. The unit's
// own compare-and-set status change is the first guard; this catches anything that slips past it.
allocationSchema.index(
  { unitId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['RESERVED', 'ISSUED'] } } },
);
allocationSchema.index({ requestId: 1, status: 1 });
// Hold-release job.
allocationSchema.index({ status: 1, holdUntil: 1 });

export const AllocationModel = model<Allocation>('Allocation', allocationSchema);
