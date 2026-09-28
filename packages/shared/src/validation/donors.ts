import { z } from 'zod';
import { BLOOD_GROUPS } from '../constants/blood.js';
import { AVAILABILITY_STATUSES } from '../constants/statuses.js';
import { VERIFICATION_STATUSES } from '../constants/roles.js';
import { paginationQuerySchema, personNameSchema, phoneSchema, shortTextSchema } from './common.js';

/** Coordinates are coarsened to 2 decimal places (≈1.1 km) before they are ever stored. */
export const COORDINATE_PRECISION = 2;

export function coarsenCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_PRECISION;
  return Math.round(value * factor) / factor;
}

export const approximateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const updateAccountSchema = z
  .object({ name: personNameSchema, phone: phoneSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const updateDonorProfileSchema = z
  .object({
    city: shortTextSchema('City', 80),
    area: shortTextSchema('Area', 80),
    /** null clears the stored approximate location. */
    approximateLocation: approximateLocationSchema.nullable(),
    /** Only accepted while the blood group has not been confirmed by staff. */
    bloodGroup: z.enum(BLOOD_GROUPS),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
export type UpdateDonorProfileInput = z.infer<typeof updateDonorProfileSchema>;

export const MAX_TEMPORARY_UNAVAILABILITY_DAYS = 365;

export const updateAvailabilitySchema = z
  .object({
    status: z.enum(AVAILABILITY_STATUSES),
    /** For TEMPORARILY_UNAVAILABLE: the donor becomes available again automatically after this date. */
    availableAgainAt: z.iso.date().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status !== 'TEMPORARILY_UNAVAILABLE') {
      if (value.availableAgainAt) {
        ctx.addIssue({
          code: 'custom',
          path: ['availableAgainAt'],
          message: 'A return date only applies to temporary unavailability',
        });
      }
      return;
    }
    if (!value.availableAgainAt) {
      ctx.addIssue({ code: 'custom', path: ['availableAgainAt'], message: 'Choose a return date' });
      return;
    }
    const days = (Date.parse(value.availableAgainAt) - Date.now()) / 86_400_000;
    if (days <= 0) {
      ctx.addIssue({ code: 'custom', path: ['availableAgainAt'], message: 'Choose a future date' });
    } else if (days > MAX_TEMPORARY_UNAVAILABILITY_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['availableAgainAt'],
        message: 'Choose a date within the next year',
      });
    }
  });
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

export const notificationPreferencesSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  emergencyOnly: z.boolean(),
  maxContactsPerWeek: z.number().int().min(0).max(14),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const listDonorsQuerySchema = paginationQuerySchema.extend({
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  availability: z.enum(AVAILABILITY_STATUSES).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  bloodGroupConfirmed: z.enum(['true', 'false']).optional(),
  city: z.string().trim().max(80).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListDonorsQuery = z.infer<typeof listDonorsQuerySchema>;

const reasonSchema = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500);

export const updateDonorVerificationSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED']),
    reason: reasonSchema.optional(),
  })
  .refine((value) => value.status === 'VERIFIED' || !!value.reason, {
    message: 'A reason is required when rejecting or suspending',
    path: ['reason'],
  });
export type UpdateDonorVerificationInput = z.infer<typeof updateDonorVerificationSchema>;

export const confirmBloodGroupSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS),
  /** Required by the API when the confirmed group differs from the donor's declaration. */
  note: reasonSchema.optional(),
});
export type ConfirmBloodGroupInput = z.infer<typeof confirmBloodGroupSchema>;
