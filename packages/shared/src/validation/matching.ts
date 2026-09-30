import { z } from 'zod';
import { MAX_UNITS_PER_REQUEST } from '../constants/requests.js';
import { objectIdSchema } from './common.js';

const reasonSchema = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500);

const uniqueIds = (max: number, label: string) =>
  z
    .array(objectIdSchema)
    .min(1, `Select at least one ${label}`)
    .max(max, `At most ${max} ${label}s at a time`)
    .refine((ids) => new Set(ids).size === ids.length, { message: `Each ${label} only once` });

/** Staff confirm the exact units to reserve; nothing is ever reserved automatically. */
export const reserveUnitsSchema = z.object({ unitIds: uniqueIds(MAX_UNITS_PER_REQUEST, 'unit') });
export type ReserveUnitsInput = z.infer<typeof reserveUnitsSchema>;

export const releaseAllocationSchema = z.object({ reason: reasonSchema });
export type ReleaseAllocationInput = z.infer<typeof releaseAllocationSchema>;

export const MAX_OUTREACH_PER_BATCH = 50;

/** Staff choose which potential donors to contact from the search preview. */
export const startOutreachSchema = z.object({
  donorIds: uniqueIds(MAX_OUTREACH_PER_BATCH, 'donor'),
});
export type StartOutreachInput = z.infer<typeof startOutreachSchema>;

export const OUTREACH_RESPONSES = ['INTERESTED', 'DECLINED'] as const;
export type OutreachResponse = (typeof OUTREACH_RESPONSES)[number];
export const respondOutreachSchema = z.object({ response: z.enum(OUTREACH_RESPONSES) });
export type RespondOutreachInput = z.infer<typeof respondOutreachSchema>;
