import { z } from 'zod';
import { VERIFICATION_STATUSES } from '../constants/roles.js';
import { emailSchema, paginationQuerySchema, phoneSchema, shortTextSchema } from './common.js';
import { hospitalAddressSchema } from './auth.js';

const reasonSchema = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500);

export const OPERATING_STATUSES = ['OPERATIONAL', 'CLOSED'] as const;
export type OperatingStatus = (typeof OPERATING_STATUSES)[number];

// ─── Hospitals ───────────────────────────────────────────────────────────────

export const registrationNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9/-]{3,40}$/, 'Enter a valid registration number');

export const updateHospitalProfileSchema = z
  .object({
    /** Identity fields: editable only while the hospital is not verified. */
    name: shortTextSchema('Hospital name', 150),
    registrationNumber: registrationNumberSchema,
    address: hospitalAddressSchema,
    operatingStatus: z.enum(OPERATING_STATUSES),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
export type UpdateHospitalProfileInput = z.infer<typeof updateHospitalProfileSchema>;

export const listHospitalsQuerySchema = paginationQuerySchema.extend({
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  city: z.string().trim().max(80).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListHospitalsQuery = z.infer<typeof listHospitalsQuerySchema>;

export const updateHospitalVerificationSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED']),
    reason: reasonSchema.optional(),
  })
  .refine((value) => value.status === 'VERIFIED' || !!value.reason, {
    message: 'A reason is required when rejecting or suspending',
    path: ['reason'],
  });
export type UpdateHospitalVerificationInput = z.infer<typeof updateHospitalVerificationSchema>;

// ─── Blood banks ─────────────────────────────────────────────────────────────

export const bloodBankCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,20}$/, 'Use 2–20 letters, digits or dashes');

export const createBloodBankSchema = z.object({
  name: shortTextSchema('Name', 150),
  code: bloodBankCodeSchema,
  address: hospitalAddressSchema,
  contactPhone: phoneSchema,
  contactEmail: emailSchema,
});
export type CreateBloodBankInput = z.infer<typeof createBloodBankSchema>;

export const updateBloodBankSchema = createBloodBankSchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
export type UpdateBloodBankInput = z.infer<typeof updateBloodBankSchema>;

export const listBloodBanksQuerySchema = paginationQuerySchema.extend({
  active: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListBloodBanksQuery = z.infer<typeof listBloodBanksQuerySchema>;
