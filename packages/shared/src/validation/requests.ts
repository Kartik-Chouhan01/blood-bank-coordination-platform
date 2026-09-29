import { z } from 'zod';
import { BLOOD_GROUPS, COMPONENT_TYPES } from '../constants/blood.js';
import {
  MAX_REQUEST_LEAD_DAYS,
  MAX_UNITS_PER_REQUEST,
  REQUEST_REASON_CATEGORIES,
} from '../constants/requests.js';
import { REQUEST_STATUSES, URGENCY_LEVELS } from '../constants/statuses.js';
import { objectIdSchema, paginationQuerySchema } from './common.js';

const reasonSchema = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500);

/** Must be in the future (with a small tolerance) and within the lead-time window. */
const requiredBySchema = z.iso.datetime({ offset: true }).superRefine((value, ctx) => {
  const time = Date.parse(value);
  if (time < Date.now() - 60_000) {
    ctx.addIssue({ code: 'custom', message: 'The required-by time must be in the future' });
  } else if (time > Date.now() + MAX_REQUEST_LEAD_DAYS * 86_400_000) {
    ctx.addIssue({
      code: 'custom',
      message: `Requests can be raised at most ${MAX_REQUEST_LEAD_DAYS} days ahead`,
    });
  }
});

const requestFields = {
  bloodGroup: z.enum(BLOOD_GROUPS, { error: 'Select the blood group' }),
  componentType: z.enum(COMPONENT_TYPES, { error: 'Select the component' }),
  unitsRequested: z
    .number({ error: 'Enter the number of units' })
    .int()
    .min(1, 'At least 1 unit')
    .max(MAX_UNITS_PER_REQUEST, `At most ${MAX_UNITS_PER_REQUEST} units per request`),
  requiredBy: requiredBySchema,
  reasonCategory: z.enum(REQUEST_REASON_CATEGORIES, { error: 'Select a reason' }),
  /** The hospital's own reference (e.g. internal order number). Never a patient identifier. */
  hospitalReference: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9/_.-]*$/, 'Use letters, digits and / _ . - only')
    .optional(),
  notes: z.string().trim().max(500).optional(),
};

export const createRequestSchema = z.object({
  ...requestFields,
  urgency: z.enum(URGENCY_LEVELS, { error: 'Select the urgency' }),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/** Only while the request is still pending review. Urgency changes go through escalation. */
export const updateRequestSchema = z
  .object(requestFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const escalateRequestSchema = z.object({
  urgency: z.enum(['URGENT', 'EMERGENCY']),
  reason: reasonSchema,
});
export type EscalateRequestInput = z.infer<typeof escalateRequestSchema>;

export const reviewRequestSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), reason: reasonSchema.optional() })
  .refine((value) => value.decision === 'APPROVE' || !!value.reason, {
    message: 'A reason is required to reject a request',
    path: ['reason'],
  });
export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>;

export const cancelRequestSchema = z.object({ reason: reasonSchema });
export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;

export const REQUEST_SORTS = ['priority', 'newest'] as const;

export const listRequestsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(REQUEST_STATUSES).optional(),
  /** open = still being worked on; closed = finished in any way. */
  state: z.enum(['open', 'closed']).optional(),
  urgency: z.enum(URGENCY_LEVELS).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  componentType: z.enum(COMPONENT_TYPES).optional(),
  hospitalId: objectIdSchema.optional(),
  overdue: z.enum(['true']).optional(),
  sort: z.enum(REQUEST_SORTS).default('priority'),
});
export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;
