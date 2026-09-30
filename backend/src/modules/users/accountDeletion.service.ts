import { randomBytes } from 'node:crypto';
import type { DeleteAccountInput } from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import type { Actor } from '../../utils/actor.js';
import { withTransaction } from '../../utils/mongoose.js';
import { recordAudit } from '../audit/audit.service.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { AuthSessionModel } from '../auth/authSession.model.js';
import { VerificationTokenModel } from '../auth/verificationToken.model.js';
import { DonorProfileModel } from '../donors/donorProfile.model.js';
import { DonorOutreachModel } from '../matching/donorOutreach.model.js';
import { NotificationModel } from '../notifications/notification.model.js';
import { UserModel } from './user.model.js';

const REMOVED = 'Removed';

/**
 * A donor deletes their account (A10). Deletion is anonymisation: donation records must survive
 * for traceability, so the person is removed from them instead.
 *
 *  - Identity (name, email, phone, password) is replaced; the account can never sign in again.
 *  - The donor profile keeps only what traceability needs: blood group and donation counts.
 *    Location, exact date of birth (reduced to the year), preferences and history are cleared,
 *    and the donor can never be matched or contacted again.
 *  - Open requests for help are declined; personal notifications, sessions and pending email
 *    tokens are deleted.
 *  - The audit log is append-only and holds no personal details, so it is left untouched.
 *
 * Hospitals and staff hold organisational records; their accounts are closed by an administrator.
 */
export async function deleteOwnAccount(actor: Actor, input: DeleteAccountInput) {
  const user = await UserModel.findById(actor.userId).select('+passwordHash').lean();
  if (!user) throw AppError.notFound('User');
  if (user.role !== 'DONOR') {
    throw AppError.forbidden(
      'Hospital and staff accounts are closed by an administrator. Please contact them.',
    );
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw AppError.validation([{ field: 'body.password', message: 'Password is incorrect' }]);
  }
  // A random password nobody knows, so even a leaked old hash is useless.
  const unusable = await hashPassword(randomBytes(32).toString('base64url'));

  await withTransaction(async (session) => {
    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          name: 'Deleted donor',
          email: `deleted-${user._id.toString()}@deleted.invalid`,
          phone: REMOVED,
          passwordHash: unusable,
          accountStatus: 'DEACTIVATED',
          emailVerified: false,
          phoneVerified: false,
        },
        $inc: { tokenVersion: 1 },
      },
      { session },
    );

    const profile = await DonorProfileModel.findOne({ userId: user._id })
      .select('_id dateOfBirth')
      .session(session)
      .lean();
    if (profile) {
      await DonorProfileModel.updateOne(
        { _id: profile._id },
        {
          $set: {
            'location.city': REMOVED,
            'location.cityKey': REMOVED.toLowerCase(),
            'location.area': REMOVED,
            dateOfBirth: new Date(Date.UTC(profile.dateOfBirth.getUTCFullYear(), 0, 1)),
            availabilityStatus: 'DO_NOT_CONTACT',
            availableAgainAt: null,
            availabilityHistory: [],
            notificationPreferences: {
              inApp: false,
              email: false,
              emergencyOnly: true,
              maxContactsPerWeek: 0,
            },
          },
          $unset: { 'location.point': '' },
        },
        { session },
      );
      await DonorOutreachModel.updateMany(
        { donorId: profile._id, status: { $in: ['NOTIFIED', 'INTERESTED'] } },
        { $set: { status: 'DECLINED', respondedAt: new Date() } },
        { session },
      );
    }

    await AuthSessionModel.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'LOGOUT_ALL' } },
      { session },
    );
    await VerificationTokenModel.deleteMany({ userId: user._id }, { session });
    await NotificationModel.deleteMany({ recipientId: user._id }, { session });

    await recordAudit(
      actor,
      {
        action: 'ACCOUNT_DELETED',
        entityType: 'User',
        entityId: user._id,
        after: { role: 'DONOR' },
      },
      session,
    );
  });
}
