import type { ClientSession, Types } from 'mongoose';
import type { Actor } from '../../utils/actor.js';
import { AuditLogModel, type AuditAction, type AuditEntityType } from './auditLog.model.js';

interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: Types.ObjectId;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/**
 * Records an audit entry. Pass the surrounding transaction's session so the audit record commits
 * or rolls back together with the change it describes.
 */
export async function recordAudit(actor: Actor, entry: AuditEntry, session?: ClientSession) {
  await AuditLogModel.create(
    [
      {
        actorId: actor.userId,
        actorRole: actor.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        reason: entry.reason ?? null,
        meta: {
          requestId: actor.requestId,
          ipTruncated: actor.ipTruncated,
          userAgent: actor.userAgent,
        },
      },
    ],
    { session },
  );
}
