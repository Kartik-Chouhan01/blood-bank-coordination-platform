import { Router, type RequestHandler } from 'express';
import { updateSettingsSchema } from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import { listSettings, updateSettings } from './settings.service.js';

const list: RequestHandler = async (_req, res) => {
  sendSuccess(res, await listSettings());
};

const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await updateSettings(actorFromRequest(req), req.body));
};

/** Administrators only; every change needs a reason and is audited per setting. */
export const settingsRouter = Router();
settingsRouter.use(authenticate, authorize('settings:manage'));
settingsRouter.get('/', list);
settingsRouter.patch('/', validate({ body: updateSettingsSchema }), update);
