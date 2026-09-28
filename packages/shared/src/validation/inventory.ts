import { z } from 'zod';
import { BLOOD_GROUPS, COMPONENT_TYPES } from '../constants/blood.js';
import { DONATION_TYPES, TESTING_RESULTS } from '../constants/inventory.js';
import { TESTING_STATUSES, UNIT_STATUSES } from '../constants/statuses.js';
import { objectIdSchema, paginationQuerySchema } from './common.js';

const reasonSchema = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500);
const MAX_BACKDATE_DAYS = 7;

export const recordDonationSchema = z
  .object({
    donorId: objectIdSchema,
    /** Required for administrators; staff always record for their own blood bank. */
    bloodBankId: objectIdSchema.optional(),
    collectedAt: z.iso.datetime({ offset: true }),
    donationType: z.enum(DONATION_TYPES),
    volumeMl: z.number().int().min(50).max(1000),
    components: z.array(z.enum(COMPONENT_TYPES)).min(1, 'Choose at least one component').max(4),
    storageLocation: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.components).size !== value.components.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Each component can appear only once',
      });
    }
    if (value.components.includes('WHOLE_BLOOD') && value.components.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Whole blood cannot be combined with separated components',
      });
    }
    const collected = Date.parse(value.collectedAt);
    if (collected > Date.now() + 5 * 60_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['collectedAt'],
        message: 'Collection time cannot be in the future',
      });
    } else if (collected < Date.now() - MAX_BACKDATE_DAYS * 86_400_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['collectedAt'],
        message: `Donations can be recorded up to ${MAX_BACKDATE_DAYS} days after collection`,
      });
    }
  });
export type RecordDonationInput = z.infer<typeof recordDonationSchema>;

export const recordTestResultSchema = z
  .object({
    result: z.enum(TESTING_RESULTS),
    /** ABO/Rh established by the laboratory; required when the donation passed testing. */
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.result === 'FAILED' || !!value.bloodGroup, {
    message: 'Record the tested blood group',
    path: ['bloodGroup'],
  })
  .refine((value) => value.result === 'PASSED' || (value.note?.length ?? 0) >= 5, {
    message: 'Add a short note (at least 5 characters) for a failed result',
    path: ['note'],
  });
export type RecordTestResultInput = z.infer<typeof recordTestResultSchema>;

export const listDonationsQuerySchema = paginationQuerySchema.extend({
  bloodBankId: objectIdSchema.optional(),
  donorId: objectIdSchema.optional(),
  testingStatus: z.enum(TESTING_STATUSES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ListDonationsQuery = z.infer<typeof listDonationsQuerySchema>;

export const UNIT_SORTS = ['expiry', 'newest'] as const;

export const listBloodUnitsQuerySchema = paginationQuerySchema.extend({
  bloodBankId: objectIdSchema.optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  componentType: z.enum(COMPONENT_TYPES).optional(),
  status: z.enum(UNIT_STATUSES).optional(),
  /** Only units still in inventory that expire within this many days (includes already-expired-by-date). */
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  unitCode: z.string().trim().toUpperCase().max(40).optional(),
  sort: z.enum(UNIT_SORTS).default('expiry'),
});
export type ListBloodUnitsQuery = z.infer<typeof listBloodUnitsQuerySchema>;

export const inventorySummaryQuerySchema = z.object({ bloodBankId: objectIdSchema.optional() });

/** Manual transitions only; allocation-related states are driven by the allocation workflow. */
export const unitTransitionSchema = z.object({
  to: z.enum(UNIT_STATUSES),
  reason: reasonSchema.optional(),
  /** Administrator override of the normal workflow; always requires a reason and is audited. */
  override: z.boolean().optional(),
});
export type UnitTransitionInput = z.infer<typeof unitTransitionSchema>;
