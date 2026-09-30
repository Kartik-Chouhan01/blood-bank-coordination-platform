import type { RequestHandler } from 'express';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import { getRequest } from '../requests/requests.service.js';
import * as allocations from './allocations.service.js';
import * as donorMatching from './donorMatching.service.js';
import * as outreach from './outreach.service.js';

const id = (req: Parameters<RequestHandler>[0]) => req.params.id as string;

// Inventory allocation — mutations answer with the updated request, which the UI shows directly.

export const inventoryCandidates: RequestHandler = async (req, res) => {
  sendSuccess(res, await allocations.getInventoryCandidates(actorFromRequest(req), id(req)));
};

export const reserve: RequestHandler = async (req, res) => {
  const actor = actorFromRequest(req);
  await allocations.reserveUnits(actor, id(req), req.body);
  sendSuccess(res, await getRequest(actor, id(req)), 201);
};

export const release: RequestHandler = async (req, res) => {
  const actor = actorFromRequest(req);
  const requestId = await allocations.releaseAllocation(actor, id(req), req.body);
  sendSuccess(res, await getRequest(actor, requestId));
};

export const issue: RequestHandler = async (req, res) => {
  const actor = actorFromRequest(req);
  const requestId = await allocations.issueAllocation(actor, id(req));
  sendSuccess(res, await getRequest(actor, requestId));
};

// Donor matching

export const donorCandidates: RequestHandler = async (req, res) => {
  sendSuccess(res, await donorMatching.findDonorCandidates(id(req)));
};

export const startOutreach: RequestHandler = async (req, res) => {
  await donorMatching.startOutreach(actorFromRequest(req), id(req), req.body);
  sendSuccess(res, await outreach.getRequestOutreach(id(req)), 201);
};

export const requestOutreach: RequestHandler = async (req, res) => {
  sendSuccess(res, await outreach.getRequestOutreach(id(req)));
};

// Donor self-service

export const myOutreach: RequestHandler = async (req, res) => {
  sendSuccess(res, await outreach.listOwnOutreach(actorFromRequest(req)));
};

export const respond: RequestHandler = async (req, res) => {
  const actor = actorFromRequest(req);
  await outreach.respondToOutreach(actor, id(req), req.body);
  sendSuccess(res, await outreach.listOwnOutreach(actor));
};
