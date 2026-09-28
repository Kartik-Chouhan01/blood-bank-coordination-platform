import { Schema, model, type Types } from 'mongoose';
import {
  BLOOD_GROUPS,
  COMPONENT_TYPES,
  TESTING_STATUSES,
  UNIT_STATUSES,
  type BloodGroup,
  type ComponentType,
  type TestingStatus,
  type UnitStatus,
} from '@bbms/shared';
import { baseSchemaOptions } from '../../utils/mongoose.js';

export interface UnitHistoryEntry {
  from: UnitStatus | null;
  to: UnitStatus;
  at: Date;
  by: Types.ObjectId | null;
  reason: string | null;
  override: boolean;
}

/** One physical blood unit. Its status only ever changes through the unit state machine. */
export interface BloodUnit {
  _id: Types.ObjectId;
  unitCode: string;
  donationId: Types.ObjectId;
  donorId: Types.ObjectId;
  bloodBankId: Types.ObjectId;
  bloodGroup: BloodGroup;
  componentType: ComponentType;
  /** Known for whole blood; separated components are not individually measured here. */
  volumeMl: number | null;
  collectedAt: Date;
  expiryDate: Date;
  storageLocation: string | null;
  status: UnitStatus;
  testingStatus: TestingStatus;
  /** Set by the allocation workflow (Phase 7). */
  currentAllocationId: Types.ObjectId | null;
  statusHistory: UnitHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const bloodUnitSchema = new Schema<BloodUnit>(
  {
    unitCode: { type: String, required: true },
    donationId: { type: Schema.Types.ObjectId, ref: 'Donation', required: true },
    donorId: { type: Schema.Types.ObjectId, ref: 'DonorProfile', required: true },
    bloodBankId: { type: Schema.Types.ObjectId, ref: 'BloodBank', required: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    componentType: { type: String, enum: COMPONENT_TYPES, required: true },
    volumeMl: { type: Number, default: null, min: 1 },
    collectedAt: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    storageLocation: { type: String, default: null, maxlength: 60 },
    status: { type: String, enum: UNIT_STATUSES, required: true },
    testingStatus: { type: String, enum: TESTING_STATUSES, default: 'PENDING' },
    currentAllocationId: { type: Schema.Types.ObjectId, default: null },
    statusHistory: {
      type: [
        {
          from: { type: String, enum: [...UNIT_STATUSES, null], default: null },
          to: { type: String, enum: UNIT_STATUSES, required: true },
          at: { type: Date, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          reason: { type: String, default: null },
          override: { type: Boolean, default: false },
          _id: false,
        },
      ],
      default: [],
    },
  },
  baseSchemaOptions<BloodUnit>(),
);

bloodUnitSchema.index({ unitCode: 1 }, { unique: true });
// Inventory search / future matching: usable stock by group and component, earliest expiry first.
bloodUnitSchema.index({ status: 1, bloodGroup: 1, componentType: 1, expiryDate: 1 });
bloodUnitSchema.index({ bloodBankId: 1, status: 1, expiryDate: 1 });
bloodUnitSchema.index({ donationId: 1 });
// Expiry sweep.
bloodUnitSchema.index({ expiryDate: 1, status: 1 });

export const BloodUnitModel = model<BloodUnit>('BloodUnit', bloodUnitSchema);
