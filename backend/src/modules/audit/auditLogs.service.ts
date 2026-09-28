import type { QueryFilter } from 'mongoose';
import type { AuditLogEntry, ListAuditLogsQuery } from '@bbms/shared';
import { buildPaginationMeta, pageToSkip } from '../../utils/pagination.js';
import { UserModel } from '../users/user.model.js';
import { AuditLogModel, type AuditLog } from './auditLog.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read-only view of the audit trail. There is intentionally no write/update/delete counterpart. */
export async function listAuditLogs(query: ListAuditLogsQuery) {
  const filter: QueryFilter<AuditLog> = {};
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.actorId) filter.actorId = query.actorId;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from && { $gte: new Date(query.from) }),
      // `to` is inclusive of the whole day.
      ...(query.to && { $lt: new Date(new Date(query.to).getTime() + DAY_MS) }),
    };
  }

  const [entries, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(pageToSkip(query))
      .limit(query.limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  const actorIds = [...new Set(entries.flatMap((e) => (e.actorId ? [e.actorId.toString()] : [])))];
  const actors = await UserModel.find({ _id: { $in: actorIds } })
    .select('name role')
    .lean();
  const actorById = new Map(actors.map((actor) => [actor._id.toString(), actor]));

  const items: AuditLogEntry[] = entries.map((entry) => {
    const actor = entry.actorId ? actorById.get(entry.actorId.toString()) : undefined;
    return {
      id: entry._id.toString(),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId.toString(),
      actor: actor ? { id: actor._id.toString(), name: actor.name, role: actor.role } : null,
      actorRole: entry.actorRole,
      before: entry.before,
      after: entry.after,
      reason: entry.reason,
      requestId: entry.meta?.requestId ?? null,
      ipTruncated: entry.meta?.ipTruncated ?? null,
      createdAt: entry.createdAt.toISOString(),
    };
  });

  return { items, meta: buildPaginationMeta(query, total) };
}
