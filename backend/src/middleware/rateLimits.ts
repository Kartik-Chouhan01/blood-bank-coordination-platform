import { rateLimit, type Options } from 'express-rate-limit';
import { ERROR_CODES } from '@bbms/shared';
import { AppError } from '../utils/AppError.js';

export function createRateLimiter(options: Pick<Options, 'windowMs' | 'limit'>) {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, ERROR_CODES.RATE_LIMITED, 'Too many requests. Please slow down.')),
  });
}
