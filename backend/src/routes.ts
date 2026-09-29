import { Router } from 'express';
import { auditLogsRouter } from './modules/audit/auditLogs.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bloodBanksRouter } from './modules/bloodBanks/bloodBanks.routes.js';
import { donorsRouter } from './modules/donors/donors.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { hospitalsRouter } from './modules/hospitals/hospitals.routes.js';
import { bloodUnitsRouter, donationsRouter } from './modules/inventory/inventory.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/** Every feature module mounts its router here; nothing else registers routes. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/donors', donorsRouter);
apiRouter.use('/hospitals', hospitalsRouter);
apiRouter.use('/blood-banks', bloodBanksRouter);
apiRouter.use('/audit-logs', auditLogsRouter);
apiRouter.use('/donations', donationsRouter);
apiRouter.use('/blood-units', bloodUnitsRouter);
apiRouter.use('/requests', requestsRouter);
