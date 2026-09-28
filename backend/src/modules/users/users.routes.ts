import { Router } from 'express';
import { z } from 'zod';
import {
  listUsersQuerySchema,
  objectIdSchema,
  updateAccountSchema,
  updateUserStatusSchema,
} from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';

export const usersRouter = Router();
const idParams = z.object({ id: objectIdSchema });

usersRouter.use(authenticate);

usersRouter.patch(
  '/me',
  authorize('account:self'),
  validate({ body: updateAccountSchema }),
  controller.updateMe,
);

usersRouter.get(
  '/',
  authorize('users:read'),
  validate({ query: listUsersQuerySchema }),
  controller.listUsers,
);
usersRouter.get(
  '/:id',
  authorize('users:read'),
  validate({ params: idParams }),
  controller.getUser,
);
usersRouter.patch(
  '/:id/status',
  authorize('users:manage'),
  validate({ params: idParams, body: updateUserStatusSchema }),
  controller.updateUserStatus,
);
