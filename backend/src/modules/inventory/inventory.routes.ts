import { Router } from 'express';
import { z } from 'zod';
import {
  inventorySummaryQuerySchema,
  listBloodUnitsQuerySchema,
  listDonationsQuerySchema,
  objectIdSchema,
  recordDonationSchema,
  recordTestResultSchema,
  unitTransitionSchema,
} from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './inventory.controller.js';

const idParams = z.object({ id: objectIdSchema });

export const donationsRouter = Router();
donationsRouter.use(authenticate);
donationsRouter.post(
  '/',
  authorize('inventory:manage'),
  validate({ body: recordDonationSchema }),
  controller.recordDonation,
);
donationsRouter.get(
  '/',
  authorize('inventory:read'),
  validate({ query: listDonationsQuerySchema }),
  controller.listDonations,
);
donationsRouter.get(
  '/:id',
  authorize('inventory:read'),
  validate({ params: idParams }),
  controller.getDonation,
);
donationsRouter.post(
  '/:id/start-testing',
  authorize('inventory:manage'),
  validate({ params: idParams }),
  controller.startTesting,
);
donationsRouter.post(
  '/:id/test-result',
  authorize('inventory:manage'),
  validate({ params: idParams, body: recordTestResultSchema }),
  controller.recordTestResult,
);

export const bloodUnitsRouter = Router();
bloodUnitsRouter.use(authenticate);
bloodUnitsRouter.get(
  '/',
  authorize('inventory:read'),
  validate({ query: listBloodUnitsQuerySchema }),
  controller.listUnits,
);
bloodUnitsRouter.get(
  '/summary',
  authorize('inventory:read'),
  validate({ query: inventorySummaryQuerySchema }),
  controller.getSummary,
);
bloodUnitsRouter.get(
  '/:id',
  authorize('inventory:read'),
  validate({ params: idParams }),
  controller.getUnit,
);
bloodUnitsRouter.post(
  '/:id/transitions',
  authorize('inventory:manage'),
  validate({ params: idParams, body: unitTransitionSchema }),
  controller.transitionUnit,
);
