import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  cancelRequestSchema,
  createRequestSchema,
  escalateRequestSchema,
  hasPermission,
  listRequestsQuerySchema,
  objectIdSchema,
  reviewRequestSchema,
  updateRequestSchema,
} from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import * as controller from './requests.controller.js';

export const requestsRouter = Router();
const idParams = z.object({ id: objectIdSchema });

/** Hospitals (own requests only — enforced in the service) or staff. */
const hospitalOrStaff: RequestHandler = (req, _res, next) => {
  const role = req.auth?.role;
  next(
    hasPermission(role, 'hospital:self') || hasPermission(role, 'requests:read')
      ? undefined
      : AppError.forbidden(),
  );
};

requestsRouter.use(authenticate);

// Hospital
requestsRouter.post(
  '/',
  authorize('requests:create'),
  validate({ body: createRequestSchema }),
  controller.create,
);
requestsRouter.get(
  '/mine',
  authorize('hospital:self'),
  validate({ query: listRequestsQuerySchema }),
  controller.listMine,
);
requestsRouter.get('/mine/stats', authorize('hospital:self'), controller.myStats);
requestsRouter.patch(
  '/:id',
  authorize('requests:create'),
  validate({ params: idParams, body: updateRequestSchema }),
  controller.update,
);
requestsRouter.post(
  '/:id/escalate',
  authorize('requests:create'),
  validate({ params: idParams, body: escalateRequestSchema }),
  controller.escalate,
);

requestsRouter.post(
  '/:id/confirm-receipt',
  authorize('hospital:self'),
  validate({ params: idParams }),
  controller.confirmReceipt,
);

// Staff
requestsRouter.get(
  '/',
  authorize('requests:read'),
  validate({ query: listRequestsQuerySchema }),
  controller.list,
);
requestsRouter.get('/stats', authorize('requests:read'), controller.stats);
requestsRouter.post(
  '/:id/review',
  authorize('requests:review'),
  validate({ params: idParams, body: reviewRequestSchema }),
  controller.review,
);

// Either (ownership checked in the service)
requestsRouter.get('/:id', hospitalOrStaff, validate({ params: idParams }), controller.get);
requestsRouter.post(
  '/:id/cancel',
  hospitalOrStaff,
  validate({ params: idParams, body: cancelRequestSchema }),
  controller.cancel,
);
