import { Router } from 'express';
import { z } from 'zod';
import {
  createBloodBankSchema,
  listBloodBanksQuerySchema,
  objectIdSchema,
  updateBloodBankSchema,
} from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './bloodBanks.controller.js';

export const bloodBanksRouter = Router();
const idParams = z.object({ id: objectIdSchema });

bloodBanksRouter.use(authenticate);
bloodBanksRouter.get(
  '/',
  authorize('bloodBanks:read'),
  validate({ query: listBloodBanksQuerySchema }),
  controller.list,
);
bloodBanksRouter.get(
  '/:id',
  authorize('bloodBanks:read'),
  validate({ params: idParams }),
  controller.get,
);
bloodBanksRouter.post(
  '/',
  authorize('bloodBanks:manage'),
  validate({ body: createBloodBankSchema }),
  controller.create,
);
bloodBanksRouter.patch(
  '/:id',
  authorize('bloodBanks:manage'),
  validate({ params: idParams, body: updateBloodBankSchema }),
  controller.update,
);
