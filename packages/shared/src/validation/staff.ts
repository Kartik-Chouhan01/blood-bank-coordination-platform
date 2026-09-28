import { z } from 'zod';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.js';
import {
  emailSchema,
  objectIdSchema,
  paginationQuerySchema,
  passwordSchema,
  personNameSchema,
  phoneSchema,
  tokenSchema,
} from './common.js';

export const inviteStaffSchema = z
  .object({
    name: personNameSchema,
    email: emailSchema,
    phone: phoneSchema,
    role: z.enum(['BLOOD_BANK_STAFF', 'ADMIN']),
    bloodBankId: objectIdSchema.optional(),
  })
  .refine((value) => value.role !== 'BLOOD_BANK_STAFF' || !!value.bloodBankId, {
    message: 'Choose the blood bank this staff member works for',
    path: ['bloodBankId'],
  });
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const acceptInviteSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entityId: objectIdSchema.optional(),
  actorId: objectIdSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
