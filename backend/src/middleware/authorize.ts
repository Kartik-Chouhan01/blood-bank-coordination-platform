import type { RequestHandler } from 'express';
import { PERMISSIONS, ROLES, hasPermission, type Permission } from '@bbms/shared';
import { AppError } from '../utils/AppError.js';
import { withMeta } from '../utils/routeMeta.js';

/** Requires every listed permission. Must run after `authenticate`. */
export function authorize(...permissions: Permission[]): RequestHandler {
  const roles = ROLES.filter((role) =>
    permissions.every((p) => (PERMISSIONS[p] as readonly string[]).includes(role)),
  );
  return withMeta(
    (req, _res, next) => {
      if (!req.auth) return next(AppError.unauthenticated());
      const allowed = permissions.every((permission) => hasPermission(req.auth!.role, permission));
      next(allowed ? undefined : AppError.forbidden());
    },
    { roles },
  );
}
