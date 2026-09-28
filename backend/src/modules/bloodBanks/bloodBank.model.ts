import { Schema, model, type Types } from 'mongoose';
import { baseSchemaOptions } from '../../utils/mongoose.js';

/**
 * A participating blood bank. Staff users, and later inventory, belong to one — the MVP runs a
 * single bank, but nothing assumes that, so a multi-bank network is a data change.
 */
export interface BloodBank {
  _id: Types.ObjectId;
  name: string;
  code: string;
  address: { line1: string; city: string; state: string; postalCode: string };
  location?: { type: 'Point'; coordinates: [number, number] };
  contactPhone: string;
  contactEmail: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bloodBankSchema = new Schema<BloodBank>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
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
    contactPhone: { type: String, required: true, trim: true, maxlength: 20 },
    contactEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<BloodBank>(),
);

bloodBankSchema.index({ code: 1 }, { unique: true });
bloodBankSchema.index({ isActive: 1, name: 1 });
bloodBankSchema.index({ location: '2dsphere' }, { sparse: true });

export const BloodBankModel = model<BloodBank>('BloodBank', bloodBankSchema);
