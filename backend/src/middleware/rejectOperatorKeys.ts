import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

const MAX_DEPTH = 10;

/** Finds a key that MongoDB could interpret as an operator (`$gt`) or path traversal (`a.b`). */
function findDangerousKey(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) return key;
    const found = findDangerousKey(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * NoSQL-injection guard at the HTTP boundary. Legitimate clients never send such keys, so the
 * request is rejected outright rather than silently rewritten.
 */
export const rejectOperatorKeys: RequestHandler = (req, _res, next) => {
  const key = findDangerousKey(req.body) ?? findDangerousKey(req.query);
  if (key) return next(AppError.badRequest(`Field name "${key}" is not allowed`));
  next();
};
