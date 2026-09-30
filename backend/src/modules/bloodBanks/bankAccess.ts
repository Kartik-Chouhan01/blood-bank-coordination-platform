import type { Types } from 'mongoose';
import { ERROR_CODES, type Role } from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import { BloodBankModel } from './bloodBank.model.js';

/**
 * Blood-bank staff may work only while their bank is active (A32). Deactivating a bank therefore
 * stops its staff at sign-in, token refresh and on every request — immediately, without having
 * to suspend each account. Administrators are not tied to a bank and are unaffected.
 */
export async function assertStaffBankActive(user: {
  role: Role;
  bloodBankId?: Types.ObjectId | null;
}) {
  if (user.role !== 'BLOOD_BANK_STAFF') return;
  const bank = user.bloodBankId
    ? await BloodBankModel.findById(user.bloodBankId).select('isActive').lean()
    : null;
  if (!bank?.isActive) {
    throw new AppError(
      403,
      ERROR_CODES.ACCOUNT_SUSPENDED,
      'Your blood bank is not active on the platform. Please contact an administrator.',
    );
  }
}
