import type { RequestHandler } from 'express';
import type { ListNotificationsQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as service from './notifications.service.js';

export const listMine: RequestHandler = async (req, res) => {
  const { items, meta } = await service.listOwn(
    actorFromRequest(req),
    req.validatedQuery as ListNotificationsQuery,
  );
  sendSuccess(res, items, 200, meta);
};

export const unreadCount: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.unreadCount(actorFromRequest(req)));
};

export const markRead: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.markRead(actorFromRequest(req), req.params.id as string));
};

export const markAllRead: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.markAllRead(actorFromRequest(req)));
};
