import { Router } from 'express';
import { z } from 'zod';
import {
  confirmBloodGroupSchema,
  listDonorsQuerySchema,
  notificationPreferencesSchema,
  objectIdSchema,
  updateAvailabilitySchema,
  updateDonorProfileSchema,
  updateDonorVerificationSchema,
} from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './donors.controller.js';
import { listOwnDonations } from '../inventory/inventory.controller.js';

export const donorsRouter = Router();
const idParams = z.object({ id: objectIdSchema });

donorsRouter.use(authenticate);

// Self-service: the profile is always resolved from the signed-in user, never from a URL id.
donorsRouter.get('/me', authorize('donor:self'), controller.getMe);
donorsRouter.patch(
  '/me',
  authorize('donor:self'),
  validate({ body: updateDonorProfileSchema }),
  controller.updateMe,
);
donorsRouter.put(
  '/me/availability',
  authorize('donor:self'),
  validate({ body: updateAvailabilitySchema }),
  controller.updateMyAvailability,
);
donorsRouter.put(
  '/me/notification-preferences',
  authorize('donor:self'),
  validate({ body: notificationPreferencesSchema }),
  controller.updateMyNotificationPreferences,
);

donorsRouter.get('/me/donations', authorize('donor:self'), listOwnDonations);

// Staff
donorsRouter.get(
  '/',
  authorize('donors:read'),
  validate({ query: listDonorsQuerySchema }),
  controller.listDonors,
);
donorsRouter.get(
  '/:id',
  authorize('donors:read'),
  validate({ params: idParams }),
  controller.getDonor,
);
donorsRouter.patch(
  '/:id/verification',
  authorize('donors:verify'),
  validate({ params: idParams, body: updateDonorVerificationSchema }),
  controller.updateVerification,
);
donorsRouter.patch(
  '/:id/blood-group',
  authorize('donors:verify'),
  validate({ params: idParams, body: confirmBloodGroupSchema }),
  controller.confirmBloodGroup,
);
