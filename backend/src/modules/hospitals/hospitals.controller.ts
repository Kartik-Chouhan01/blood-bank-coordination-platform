import type { RequestHandler } from 'express';
import type { ListHospitalsQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as service from './hospitals.service.js';

export const getMe: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.getOwnHospital(actorFromRequest(req)));
};

export const updateMe: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.updateOwnHospital(actorFromRequest(req), req.body));
};

export const list: RequestHandler = async (req, res) => {
  const { items, meta } = await service.listHospitals(req.validatedQuery as ListHospitalsQuery);
  sendSuccess(res, items, 200, meta);
};

export const get: RequestHandler = async (req, res) => {
  sendSuccess(res, await service.getHospital(req.params.id as string));
};

export const updateVerification: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await service.updateHospitalVerification(
      actorFromRequest(req),
      req.params.id as string,
      req.body,
    ),
  );
};
