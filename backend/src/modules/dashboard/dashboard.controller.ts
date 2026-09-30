import type { RequestHandler } from 'express';
import type { AnalyticsQuery, OverviewQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as service from './dashboard.service.js';

export const publicStats: RequestHandler = async (_req, res) => {
  // Levels are cached server-side for five minutes; let browsers and proxies reuse them too.
  res.set('Cache-Control', 'public, max-age=300');
  sendSuccess(res, await service.getPublicStats());
};

export const overview: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.getStaffOverview(actorFromRequest(req), req.validatedQuery as OverviewQuery),
  );
};

export const analytics: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.getAnalytics(req.validatedQuery as AnalyticsQuery));
};

export const hospital: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.getHospitalDashboard(actorFromRequest(req)));
};
