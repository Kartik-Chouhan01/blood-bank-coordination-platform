import { Router } from 'express';
import { z } from 'zod';
import {
  objectIdSchema,
  releaseAllocationSchema,
  reserveUnitsSchema,
  respondOutreachSchema,
  startOutreachSchema,
} from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './matching.controller.js';

const idParams = z.object({ id: objectIdSchema });

/** Staff: inventory allocation and donor outreach for approved requests. */
export const matchingRouter = Router();
matchingRouter.use(authenticate, authorize('matching:allocate'));

matchingRouter.get(
  '/requests/:id/inventory',
  validate({ params: idParams }),
  controller.inventoryCandidates,
);
matchingRouter.post(
  '/requests/:id/allocations',
  validate({ params: idParams, body: reserveUnitsSchema }),
  controller.reserve,
);
matchingRouter.post(
  '/allocations/:id/release',
  validate({ params: idParams, body: releaseAllocationSchema }),
  controller.release,
);
matchingRouter.post('/allocations/:id/issue', validate({ params: idParams }), controller.issue);
matchingRouter.get(
  '/requests/:id/donors',
  validate({ params: idParams }),
  controller.donorCandidates,
);
matchingRouter.get(
  '/requests/:id/outreach',
  validate({ params: idParams }),
  controller.requestOutreach,
);
matchingRouter.post(
  '/requests/:id/outreach',
  validate({ params: idParams, body: startOutreachSchema }),
  controller.startOutreach,
);

/** Donors: requests for help they were contacted about (own records only). */
export const donorOutreachRouter = Router();
donorOutreachRouter.use(authenticate, authorize('donor:self'));

donorOutreachRouter.get('/mine', controller.myOutreach);
donorOutreachRouter.post(
  '/:id/respond',
  validate({ params: idParams, body: respondOutreachSchema }),
  controller.respond,
);
