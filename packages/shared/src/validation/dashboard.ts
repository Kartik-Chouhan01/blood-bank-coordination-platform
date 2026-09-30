import { z } from 'zod';
import { objectIdSchema } from './common.js';

export const ANALYTICS_PERIODS = [7, 30, 90, 365] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine((d): d is AnalyticsPeriod => (ANALYTICS_PERIODS as readonly number[]).includes(d), {
      message: 'Choose 7, 30, 90 or 365 days',
    })
    .default(30),
  bloodBankId: objectIdSchema.optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const overviewQuerySchema = z.object({ bloodBankId: objectIdSchema.optional() });
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
