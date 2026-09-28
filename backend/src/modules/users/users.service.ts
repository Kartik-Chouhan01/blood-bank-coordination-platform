import type { QueryFilter } from 'mongoose';
import { Types } from 'mongoose';
import {
  ERROR_CODES,
  type ListUsersQuery,
  type UpdateAccountInput,
  type UpdateUserStatusInput,
} from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { buildPaginationMeta, escapeRegex, pageToSkip } from '../../utils/pagination.js';
import { recordAudit } from '../audit/audit.service.js';
import { revokeAllRefreshTokens } from '../auth/session.service.js';
import { UserModel, type User } from './user.model.js';
import { toAuthUser, toUserSummaries, toUserSummary } from './user.presenter.js';

export async function listUsers(query: ListUsersQuery) {
  const filter: QueryFilter<User> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.accountStatus = query.status;
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(pageToSkip(query))
      .limit(query.limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  return { items: await toUserSummaries(users), meta: buildPaginationMeta(query, total) };
}

export async function getUser(id: string) {
  const user = await UserModel.findById(id).lean();
  if (!user) throw AppError.notFound('User');
  const [summary] = await toUserSummaries([user]);
  return summary!;
}

/**
 * Suspends, deactivates or reactivates an account. Leaving ACTIVE immediately invalidates every
 * access and refresh token the user holds.
 */
export async function updateUserStatus(actor: Actor, id: string, input: UpdateUserStatusInput) {
  const targetId = new Types.ObjectId(id);
  if (actor.userId?.equals(targetId)) {
    throw AppError.conflict(
      'You cannot change the status of your own account.',
      ERROR_CODES.CONFLICT,
    );
  }

  return withTransaction(async (session) => {
    const before = await UserModel.findById(targetId).session(session).lean();
    if (!before) throw AppError.notFound('User');
    if (before.accountStatus === input.status) return toUserSummary(before);
    if (before.accountStatus === 'PENDING' && input.status === 'ACTIVE') {
      throw AppError.conflict(
        'This person has not accepted their invitation yet. Resend the invitation instead.',
        ERROR_CODES.CONFLICT,
      );
    }

    const revoke = input.status !== 'ACTIVE';
    const after = await UserModel.findOneAndUpdate(
      { _id: targetId },
      { $set: { accountStatus: input.status }, ...(revoke && { $inc: { tokenVersion: 1 } }) },
      { session, returnDocument: 'after' },
    ).lean();
    if (revoke) await revokeAllRefreshTokens(targetId, 'ADMIN', session);

    await recordAudit(
      actor,
      {
        action: 'USER_STATUS_CHANGED',
        entityType: 'User',
        entityId: targetId,
        before: { accountStatus: before.accountStatus },
        after: { accountStatus: input.status },
        reason: input.reason,
      },
      session,
    );
    const [summary] = await toUserSummaries([after!]);
    return summary!;
  });
}

/** A user edits their own name/phone. A new phone number must be re-verified. */
export async function updateOwnAccount(actor: Actor, input: UpdateAccountInput) {
  return withTransaction(async (session) => {
    const before = await UserModel.findById(actor.userId).session(session).lean();
    if (!before) throw AppError.notFound('User');

    const phoneChanged = input.phone !== undefined && input.phone !== before.phone;
    const after = await UserModel.findOneAndUpdate(
      { _id: before._id },
      { $set: { ...input, ...(phoneChanged && { phoneVerified: false }) } },
      { session, returnDocument: 'after' },
    ).lean();
    await recordAudit(
      actor,
      {
        action: 'ACCOUNT_UPDATED',
        entityType: 'User',
        entityId: before._id,
        // Record which fields changed, not the personal data itself.
        after: { changedFields: Object.keys(input) },
      },
      session,
    );
    return toAuthUser(after!);
  });
}
