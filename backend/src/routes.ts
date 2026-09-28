import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { donorsRouter } from './modules/donors/donors.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/** Every feature module mounts its router here; nothing else registers routes. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/donors', donorsRouter);
