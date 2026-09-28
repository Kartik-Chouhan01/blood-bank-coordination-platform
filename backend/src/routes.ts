import { Router } from 'express';
import { healthRouter } from './modules/health/health.routes.js';

/** Every feature module mounts its router here; nothing else registers routes. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
