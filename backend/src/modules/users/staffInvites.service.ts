import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import {
  ERROR_CODES,
  ROLE_LABELS,
  type AcceptInviteInput,
  type InviteStaffInput,
} from '@bbms/shared';
import { appLink, sendMail } from '../../infrastructure/mail/mailer.js';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { recordAudit } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';
import {
  consumeVerificationToken,
  issueVerificationToken,
} from '../auth/verificationToken.service.js';
import { BloodBankModel } from '../bloodBanks/bloodBank.model.js';
import { UserModel, type User } from './user.model.js';
import { toUserSummaries } from './user.presenter.js';

export const INVITE_TTL_HOURS = 72;

async function sendInvite(
  user: Pick<User, '_id' | 'name' | 'email' | 'role'>,
  bankName: string | null,
) {
  const token = await issueVerificationToken(
    user._id,
    'ACCOUNT_INVITE',
    INVITE_TTL_HOURS * 3600_000,
  );
  await sendMail({
    to: user.email,
    template: 'ACCOUNT_INVITE',
    subject: 'You have been invited to the blood coordination platform',
    text:
      `Hi ${user.name},\n\nYou have been invited as ${ROLE_LABELS[user.role]}` +
      `${bankName ? ` at ${bankName}` : ''}.\n\nChoose a password to activate your account ` +
      `(link valid for ${INVITE_TTL_HOURS} hours):\n${appLink('/accept-invite', token)}`,
  });
}

/**
 * Staff and administrators cannot self-register: an administrator invites them, and the account
 * stays PENDING (unable to sign in) until the invitee chooses their own password.
 */
export async function inviteStaff(actor: Actor, input: InviteStaffInput) {
  let bankName: string | null = null;
  if (input.bloodBankId) {
    const bank = await BloodBankModel.findById(input.bloodBankId).lean();
    if (!bank)
      throw AppError.validation([{ field: 'body.bloodBankId', message: 'Blood bank not found' }]);
    if (!bank.isActive) {
      throw AppError.validation([
        { field: 'body.bloodBankId', message: 'This blood bank is inactive' },
      ]);
    }
    bankName = bank.name;
  }

  const userId = new Types.ObjectId();
  // Nobody knows this password; the account only becomes usable through the invitation link.
  const unusablePasswordHash = await hashPassword(randomBytes(32).toString('base64url'));
  try {
    await withTransaction(async (session) => {
      await UserModel.create(
        [
          {
            _id: userId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            passwordHash: unusablePasswordHash,
            role: input.role,
            accountStatus: 'PENDING',
            bloodBankId: input.bloodBankId ? new Types.ObjectId(input.bloodBankId) : null,
          },
        ],
        { session },
      );
      await recordAudit(
        actor,
        {
          action: 'USER_INVITED',
          entityType: 'User',
          entityId: userId,
          after: { role: input.role, bloodBankId: input.bloodBankId ?? null },
        },
        session,
      );
    });
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      throw AppError.conflict(
        'An account with this email already exists.',
        ERROR_CODES.DUPLICATE_RESOURCE,
      );
    }
    throw err;
  }

  const user = (await UserModel.findById(userId).lean())!;
  await sendInvite(user, bankName);
  const [summary] = await toUserSummaries([user]);
  return summary!;
}

export async function resendInvite(id: string) {
  const user = await UserModel.findById(id).lean();
  if (!user) throw AppError.notFound('User');
  if (user.accountStatus !== 'PENDING') {
    throw AppError.conflict('This invitation has already been accepted.', ERROR_CODES.CONFLICT);
  }
  const bank = user.bloodBankId ? await BloodBankModel.findById(user.bloodBankId).lean() : null;
  await sendInvite(user, bank?.name ?? null);
}

/** Activates an invited account with the invitee's chosen password. Returns the activated user. */
export async function acceptInvite(
  input: AcceptInviteInput,
  context: Omit<Actor, 'userId' | 'role'>,
) {
  const userId = await consumeVerificationToken(input.token, 'ACCOUNT_INVITE');
  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (session) => {
    const user = await UserModel.findOneAndUpdate(
      { _id: userId, accountStatus: 'PENDING' },
      {
        $set: {
          passwordHash,
          accountStatus: 'ACTIVE',
          emailVerified: true,
          lastLoginAt: new Date(),
        },
        $inc: { tokenVersion: 1 },
      },
      { session, returnDocument: 'after' },
    ).lean();
    if (!user)
      throw new AppError(400, ERROR_CODES.INVALID_TOKEN, 'This invitation is no longer valid.');
    await recordAudit(
      { userId, role: user.role, ...context },
      { action: 'INVITE_ACCEPTED', entityType: 'User', entityId: userId },
      session,
    );
    return user;
  });
}
