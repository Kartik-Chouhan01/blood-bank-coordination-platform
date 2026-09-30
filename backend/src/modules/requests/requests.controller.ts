import type { RequestHandler } from 'express';
import type { ListRequestsQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as service from './requests.service.js';

const id = (req: Parameters<RequestHandler>[0]) => req.params.id as string;

export const create: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.createRequest(actorFromRequest(req), req.body), 201);
};

export const listMine: RequestHandler = async (req, res) => {
  const { items, meta } = await service.listOwnRequests(
    actorFromRequest(req),
    req.validatedQuery as ListRequestsQuery,
  );
  sendSuccess(res, items, 200, meta);
};

export const myStats: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.getOwnRequestStats(actorFromRequest(req)));
};

export const list: RequestHandler = async (req, res) => {
  const { items, meta } = await service.listRequests(req.validatedQuery as ListRequestsQuery);
  sendSuccess(res, items, 200, meta);
};

export const stats: RequestHandler = async (_req, res) => {
  sendSuccess(res, await service.getRequestStats());
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.getRequest(actorFromRequest(req), id(req)));
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.updateRequest(actorFromRequest(req), id(req), req.body));
};

export const escalate: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.escalateRequest(actorFromRequest(req), id(req), req.body));
};

export const review: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.reviewRequest(actorFromRequest(req), id(req), req.body));
};

export const cancel: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.cancelRequest(actorFromRequest(req), id(req), req.body));
};

export const confirmReceipt: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.confirmReceipt(actorFromRequest(req), id(req)));
};
