import { z } from 'zod';
import { ACCOUNT_STATUSES, ROLES } from '../constants/roles.js';
import { paginationQuerySchema } from './common.js';

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500),
});
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
