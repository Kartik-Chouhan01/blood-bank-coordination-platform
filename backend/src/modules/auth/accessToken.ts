import jwt from 'jsonwebtoken';
import { ERROR_CODES, ROLES, type Role } from '@bbms/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const ISSUER = 'bbms-api';
const AUDIENCE = 'bbms-web';

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  /** tokenVersion at issue time; a mismatch means the token was revoked. */
  tv: number;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign({ role: claims.role, tv: claims.tv }, env.JWT_ACCESS_SECRET, {
    subject: claims.sub,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.tv !== 'number' ||
      !ROLES.includes(payload.role)
    ) {
      throw new Error('Malformed token payload');
    }
    return { sub: payload.sub, role: payload.role, tv: payload.tv };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, ERROR_CODES.TOKEN_EXPIRED, 'Your session token has expired');
    }
    throw new AppError(401, ERROR_CODES.INVALID_TOKEN, 'Invalid authentication token');
  }
}
