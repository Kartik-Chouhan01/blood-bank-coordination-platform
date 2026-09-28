import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/respond.js';
import { getHealthStatus } from './health.service.js';

export const getHealth: RequestHandler = async (_req, res) => {
  const health = await getHealthStatus();
  // 503 lets load balancers and uptime monitors take a degraded instance out of rotation.
  sendSuccess(res, health, health.status === 'ok' ? 200 : 503);
};
