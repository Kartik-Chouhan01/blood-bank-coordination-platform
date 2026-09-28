import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@bbms/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * CSRF defence for endpoints authenticated by cookie (refresh, logout): browsers always send
 * Origin on cross-site POSTs, so a foreign origin is rejected even if SameSite is relaxed.
 */
export const requireAllowedOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    return next(new AppError(403, ERROR_CODES.ORIGIN_NOT_ALLOWED, 'Request origin not allowed'));
  }
  next();
};
