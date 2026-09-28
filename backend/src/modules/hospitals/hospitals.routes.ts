import { Router } from 'express';
import { z } from 'zod';
import {
  listHospitalsQuerySchema,
  objectIdSchema,
  updateHospitalProfileSchema,
  updateHospitalVerificationSchema,
} from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './hospitals.controller.js';

export const hospitalsRouter = Router();
const idParams = z.object({ id: objectIdSchema });

hospitalsRouter.use(authenticate);

hospitalsRouter.get('/me', authorize('hospital:self'), controller.getMe);
hospitalsRouter.patch(
  '/me',
  authorize('hospital:self'),
  validate({ body: updateHospitalProfileSchema }),
  controller.updateMe,
);

hospitalsRouter.get(
  '/',
  authorize('hospitals:read'),
  validate({ query: listHospitalsQuerySchema }),
  controller.list,
);
hospitalsRouter.get(
  '/:id',
  authorize('hospitals:read'),
  validate({ params: idParams }),
  controller.get,
);
hospitalsRouter.patch(
  '/:id/verification',
  authorize('hospitals:verify'),
  validate({ params: idParams, body: updateHospitalVerificationSchema }),
  controller.updateVerification,
);
