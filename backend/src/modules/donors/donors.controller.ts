import type { RequestHandler } from 'express';
import type { ListDonorsQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as donorsService from './donors.service.js';

export const getMe: RequestHandler = async (req, res) => {
  sendSuccess(res, await donorsService.getOwnProfile(actorFromRequest(req)));
};

export const updateMe: RequestHandler = async (req, res) => {
  sendSuccess(res, await donorsService.updateOwnProfile(actorFromRequest(req), req.body));
};

export const updateMyAvailability: RequestHandler = async (req, res) => {
  sendSuccess(res, await donorsService.updateOwnAvailability(actorFromRequest(req), req.body));
};

export const updateMyNotificationPreferences: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await donorsService.updateOwnNotificationPreferences(actorFromRequest(req), req.body),
  );
};

export const listDonors: RequestHandler = async (req, res) => {
  const { items, meta } = await donorsService.listDonors(req.validatedQuery as ListDonorsQuery);
  sendSuccess(res, items, 200, meta);
};

export const getDonor: RequestHandler = async (req, res) => {
  sendSuccess(res, await donorsService.getDonorForStaff(req.params.id as string));
};

export const updateVerification: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await donorsService.updateDonorVerification(
      actorFromRequest(req),
      req.params.id as string,
      req.body,
    ),
  );
};

export const confirmBloodGroup: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await donorsService.confirmDonorBloodGroup(
      actorFromRequest(req),
      req.params.id as string,
      req.body,
    ),
  );
};
