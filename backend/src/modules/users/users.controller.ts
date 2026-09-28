import type { RequestHandler } from 'express';
import type { ListUsersQuery } from '@bbms/shared';
import { actorFromRequest } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as usersService from './users.service.js';

export const listUsers: RequestHandler = async (req, res) => {
  const { items, meta } = await usersService.listUsers(req.validatedQuery as ListUsersQuery);
  sendSuccess(res, items, 200, meta);
};

export const getUser: RequestHandler = async (req, res) => {
  sendSuccess(res, await usersService.getUser(req.params.id as string));
};

export const updateUserStatus: RequestHandler = async (req, res) => {
  sendSuccess(
    res,
    await usersService.updateUserStatus(actorFromRequest(req), req.params.id as string, req.body),
  );
};

export const updateMe: RequestHandler = async (req, res) => {
  sendSuccess(res, await usersService.updateOwnAccount(actorFromRequest(req), req.body));
};
