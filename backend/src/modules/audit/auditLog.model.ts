import { Schema, model, type Types } from 'mongoose';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  ROLES,
  type AuditAction,
  type AuditEntityType,
  type Role,
} from '@bbms/shared';

export { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditAction, type AuditEntityType };

/** Append-only: no update or delete path exists anywhere in the application. */
export interface AuditLog {
  _id: Types.ObjectId;
  /** null for system actions (jobs, CLI scripts). */
  actorId: Types.ObjectId | null;
  actorRole: Role | 'SYSTEM';
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: Types.ObjectId;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  meta: { requestId?: string; ipTruncated?: string; userAgent?: string };
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: [...ROLES, 'SYSTEM'], required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, enum: AUDIT_ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null, maxlength: 1000 },
    meta: {
      requestId: String,
      ipTruncated: String,
      userAgent: String,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: true },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLogModel = model<AuditLog>('AuditLog', auditLogSchema);
