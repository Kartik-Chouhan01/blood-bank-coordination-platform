import type { RequestHandler } from 'express';
import { ERROR_CODES, type Role } from '@bbms/shared';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../modules/auth/accessToken.js';
import { UserModel } from '../modules/users/user.model.js';

export interface RequestAuth {
  userId: string;
  role: Role;
  bloodBankId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: RequestAuth;
  }
}

/**
 * Verifies the bearer token, then re-reads the user from the database on every request:
 * the role and account status in the token are never trusted on their own, so suspensions,
 * role changes and "sign out everywhere" take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthenticated());

  const claims = verifyAccessToken(header.slice('Bearer '.length).trim());
  const user = await UserModel.findById(claims.sub)
    .select('role accountStatus tokenVersion bloodBankId')
    .lean();

  if (!user || user.tokenVersion !== claims.tv) {
    return next(
      new AppError(
        401,
        ERROR_CODES.SESSION_EXPIRED,
        'Your session has ended. Please sign in again.',
      ),
    );
  }
  if (user.accountStatus !== 'ACTIVE') {
    return next(new AppError(403, ERROR_CODES.ACCOUNT_SUSPENDED, 'This account is not active.'));
  }

  req.auth = {
    userId: user._id.toString(),
    role: user.role,
    bloodBankId: user.bloodBankId?.toString() ?? null,
  };
  next();
};
