import { Router } from 'express';
import { z } from 'zod';
import { listNotificationsQuerySchema, objectIdSchema } from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './notifications.controller.js';

/** Every signed-in user's own notifications; there is no way to read anyone else's. */
export const notificationsRouter = Router();
notificationsRouter.use(authenticate, authorize('account:self'));

notificationsRouter.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  controller.listMine,
);
notificationsRouter.get('/unread-count', controller.unreadCount);
notificationsRouter.post('/read-all', controller.markAllRead);
notificationsRouter.post(
  '/:id/read',
  validate({ params: z.object({ id: objectIdSchema }) }),
  controller.markRead,
);
