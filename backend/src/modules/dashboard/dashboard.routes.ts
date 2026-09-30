import { Router } from 'express';
import { analyticsQuerySchema, overviewQuerySchema } from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './dashboard.controller.js';

export const dashboardRouter = Router();

// Public: coarse stock levels only (no counts).
dashboardRouter.get('/public-stats', controller.publicStats);

dashboardRouter.get(
  '/overview',
  authenticate,
  authorize('inventory:read'),
  validate({ query: overviewQuerySchema }),
  controller.overview,
);
dashboardRouter.get(
  '/analytics',
  authenticate,
  authorize('analytics:read'),
  validate({ query: analyticsQuerySchema }),
  controller.analytics,
);
dashboardRouter.get('/hospital', authenticate, authorize('hospital:self'), controller.hospital);
