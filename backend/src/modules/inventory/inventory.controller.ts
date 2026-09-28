import type { RequestHandler } from 'express';
import type { ListBloodUnitsQuery, ListDonationsQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as donations from './donations.service.js';
import * as units from './bloodUnits.service.js';

// Donations
export const recordDonation: RequestHandler = async (req, res) => {
  sendSuccess(res, await donations.recordDonation(actorFromRequest(req), req.body), 201);
};

export const listDonations: RequestHandler = async (req, res) => {
  const { items, meta } = await donations.listDonations(req.validatedQuery as ListDonationsQuery);
  sendSuccess(res, items, 200, meta);
};

export const getDonation: RequestHandler = async (req, res) => {
  sendSuccess(res, await donations.getDonation(actorFromRequest(req), req.params.id as string));
};

export const startTesting: RequestHandler = async (req, res) => {
  sendSuccess(res, await donations.startTesting(actorFromRequest(req), req.params.id as string));
};

export const recordTestResult: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await donations.recordTestResult(actorFromRequest(req), req.params.id as string, req.body),
  );
};

export const listOwnDonations: RequestHandler = async (req, res) => {
  sendSuccess(res, await donations.listOwnDonations(actorFromRequest(req)));
};

// Blood units
export const listUnits: RequestHandler = async (req, res) => {
  const { items, meta } = await units.listUnits(req.validatedQuery as ListBloodUnitsQuery);
  sendSuccess(res, items, 200, meta);
};

export const getSummary: RequestHandler = async (req, res) => {
  const { bloodBankId } = (req.validatedQuery ?? {}) as { bloodBankId?: string };
  sendSuccess(res, await units.getSummary(bloodBankId));
};

export const getUnit: RequestHandler = async (req, res) => {
  sendSuccess(res, await units.getUnit(actorFromRequest(req), req.params.id as string));
};

export const transitionUnit: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await units.transitionUnitManually(actorFromRequest(req), req.params.id as string, req.body),
  );
};
