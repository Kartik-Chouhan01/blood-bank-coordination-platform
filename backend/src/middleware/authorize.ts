import type { RequestHandler } from 'express';
import { hasPermission, type Permission } from '@bbms/shared';
import { AppError } from '../utils/AppError.js';

/** Requires every listed permission. Must run after `authenticate`. */
export function authorize(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthenticated());
    const allowed = permissions.every((permission) => hasPermission(req.auth!.role, permission));
    next(allowed ? undefined : AppError.forbidden());
  };
}
