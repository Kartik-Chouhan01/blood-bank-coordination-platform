import { Schema, model, type Types } from 'mongoose';
import {
  BLOOD_GROUPS,
  COMPONENT_TYPES,
  REQUEST_REASON_CATEGORIES,
  REQUEST_STATUSES,
  URGENCY_LEVELS,
  URGENCY_RANK,
  type BloodGroup,
  type ComponentType,
  type RequestReasonCategory,
  type RequestStatus,
  type Urgency,
} from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

export interface RequestHistoryEntry {
  from: RequestStatus | null;
  to: RequestStatus;
  at: Date;
  by: Types.ObjectId | null;
  reason: string | null;
}

export interface BloodRequest {
  _id: Types.ObjectId;
  requestNumber: string;
  hospitalId: Types.ObjectId;
  createdBy: Types.ObjectId;
  bloodGroup: BloodGroup;
  componentType: ComponentType;
  unitsRequested: number;
  /** Maintained by the allocation workflow (Phase 7). */
  unitsAllocated: number;
  unitsIssued: number;
  urgency: Urgency;
  /** 0 = EMERGENCY, 1 = URGENT, 2 = ROUTINE — stored so the queue sorts by priority in the database. */
  urgencyRank: number;
  requiredBy: Date;
  reasonCategory: RequestReasonCategory;
  hospitalReference: string | null;
  notes: string | null;
  status: RequestStatus;
  statusReason: string | null;
  statusHistory: RequestHistoryEntry[];
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const bloodRequestSchema = new Schema<BloodRequest>(
  {
    requestNumber: { type: String, required: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    componentType: { type: String, enum: COMPONENT_TYPES, required: true },
    unitsRequested: { type: Number, required: true, min: 1 },
    unitsAllocated: { type: Number, default: 0, min: 0 },
    unitsIssued: { type: Number, default: 0, min: 0 },
    urgency: { type: String, enum: URGENCY_LEVELS, required: true },
    urgencyRank: { type: Number, required: true },
    requiredBy: { type: Date, required: true },
    reasonCategory: { type: String, enum: REQUEST_REASON_CATEGORIES, required: true },
    hospitalReference: { type: String, default: null, maxlength: 40 },
    notes: { type: String, default: null, maxlength: 500 },
    status: { type: String, enum: REQUEST_STATUSES, required: true },
    statusReason: { type: String, default: null, maxlength: 500 },
    statusHistory: {
      type: [
        {
          from: { type: String, enum: [...REQUEST_STATUSES, null], default: null },
          to: { type: String, enum: REQUEST_STATUSES, required: true },
          at: { type: Date, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          reason: { type: String, default: null },
          _id: false,
        },
      ],
      default: [],
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  baseSchemaOptions<BloodRequest>(),
);

bloodRequestSchema.index({ requestNumber: 1 }, { unique: true });
// Staff queue: open requests, most urgent first, then earliest required-by.
bloodRequestSchema.index({ status: 1, urgencyRank: 1, requiredBy: 1 });
bloodRequestSchema.index({ hospitalId: 1, createdAt: -1 });
bloodRequestSchema.index({ bloodGroup: 1, componentType: 1, status: 1 });
// Expiry sweep.
bloodRequestSchema.index({ requiredBy: 1, status: 1 });

export const BloodRequestModel = model<BloodRequest>('BloodRequest', bloodRequestSchema);

export const urgencyRankOf = (urgency: Urgency) => URGENCY_RANK[urgency];
