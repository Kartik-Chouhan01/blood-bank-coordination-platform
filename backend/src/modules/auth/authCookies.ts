import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../../config/env.js';

export const REFRESH_COOKIE = 'bbms_rt';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // SameSite=None is only accepted by browsers on Secure cookies.
    secure: isProduction || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    // Sent only to auth endpoints, never to the rest of the API.
    path: '/api/auth',
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
