import type { RequestHandler } from 'express';
import type { ListBloodBanksQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as service from './bloodBanks.service.js';

export const list: RequestHandler = async (req, res) => {
  const { items, meta } = await service.listBloodBanks(req.validatedQuery as ListBloodBanksQuery);
  sendSuccess(res, items, 200, meta);
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.getBloodBank(req.params.id as string));
};

export const create: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.createBloodBank(actorFromRequest(req), req.body), 201);
};

export const update: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.updateBloodBank(actorFromRequest(req), req.params.id as string, req.body),
  );
};
