import { Router, type RequestHandler } from 'express';
import { listAuditLogsQuerySchema, type ListAuditLogsQuery } from '@bbms/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/respond.js';
import { listAuditLogs } from './auditLogs.service.js';

const list: RequestHandler = async (req, res) => {
  const { items, meta } = await listAuditLogs(req.validatedQuery as ListAuditLogsQuery);
  sendSuccess(res, items, 200, meta);
};

export const auditLogsRouter = Router();

auditLogsRouter.use(authenticate, authorize('audit:read'));
auditLogsRouter.get('/', validate({ query: listAuditLogsQuerySchema }), list);
