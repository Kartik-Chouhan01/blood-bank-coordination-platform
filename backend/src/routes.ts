import { Router } from 'express';
import { auditLogsRouter } from './modules/audit/auditLogs.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bloodBanksRouter } from './modules/bloodBanks/bloodBanks.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { donorsRouter } from './modules/donors/donors.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { hospitalsRouter } from './modules/hospitals/hospitals.routes.js';
import { bloodUnitsRouter, donationsRouter } from './modules/inventory/inventory.routes.js';
import { donorOutreachRouter, matchingRouter } from './modules/matching/matching.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/**
 * Every feature module is mounted here and nowhere else. Exported so the security tests can walk
 * every route and prove it is protected.
 */
export const API_MOUNTS: readonly (readonly [string, Router])[] = [
  ['/health', healthRouter],
  ['/auth', authRouter],
  ['/users', usersRouter],
  ['/donors', donorsRouter],
  ['/hospitals', hospitalsRouter],
  ['/blood-banks', bloodBanksRouter],
  ['/audit-logs', auditLogsRouter],
  ['/donations', donationsRouter],
  ['/blood-units', bloodUnitsRouter],
  ['/requests', requestsRouter],
  ['/matching', matchingRouter],
  ['/donor-outreach', donorOutreachRouter],
  ['/notifications', notificationsRouter],
  ['/dashboard', dashboardRouter],
  ['/settings', settingsRouter],
];

export const apiRouter = Router();
for (const [path, router] of API_MOUNTS) apiRouter.use(path, router);
