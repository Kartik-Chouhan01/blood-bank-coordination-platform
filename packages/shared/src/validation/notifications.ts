import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unread: z.enum(['true']).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
