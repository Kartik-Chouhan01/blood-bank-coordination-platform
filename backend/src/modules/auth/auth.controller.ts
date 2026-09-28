import type { RequestHandler, Response } from 'express';
import { ERROR_CODES } from '@bbms/shared';
import { AppError } from '../../utils/AppError.js';
import { actorFromRequest, requestContext } from '../../utils/actor.js';
import { sendSuccess } from '../../utils/respond.js';
import * as authService from './auth.service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './authCookies.js';

function sendSession(res: Response, result: authService.SessionResult, status = 200) {
  setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
  // Tokens must never be cached by browsers or intermediaries.
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, result.response, status);
}

export const registerDonor: RequestHandler = async (req, res) => {
  sendSession(res, await authService.registerDonor(req.body, requestContext(req)), 201);
};

export const registerHospital: RequestHandler = async (req, res) => {
  sendSession(res, await authService.registerHospital(req.body, requestContext(req)), 201);
};

export const login: RequestHandler = async (req, res) => {
  sendSession(res, await authService.login(req.body, requestContext(req)));
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    sendSession(res, await authService.refreshSession(readRefreshCookie(req), requestContext(req)));
  } catch (err) {
    // A rotated-by-another-tab token is still valid for that tab's new cookie; keep it.
    if (!(err instanceof AppError && err.errorCode === ERROR_CODES.SESSION_ROTATED)) {
      clearRefreshCookie(res);
    }
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  sendSuccess(res, null);
};

export const logoutAll: RequestHandler = async (req, res) => {
  await authService.logoutAll(actorFromRequest(req));
  clearRefreshCookie(res);
  sendSuccess(res, null);
};

export const me: RequestHandler = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, await authService.getCurrentUser(actorFromRequest(req)));
};

export const verifyEmail: RequestHandler = async (req, res) => {
  await authService.verifyEmail(req.body.token, requestContext(req));
  sendSuccess(res, null);
};

export const resendVerification: RequestHandler = async (req, res) => {
  await authService.resendVerification(actorFromRequest(req));
  sendSuccess(res, null);
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, null, 202);
};

export const resetPassword: RequestHandler = async (req, res) => {
  await authService.resetPassword(req.body, requestContext(req));
  clearRefreshCookie(res);
  sendSuccess(res, null);
};

export const changePassword: RequestHandler = async (req, res) => {
  sendSession(res, await authService.changePassword(actorFromRequest(req), req.body));
};

export const acceptInvite: RequestHandler = async (req, res) => {
  sendSession(res, await authService.acceptInvite(req.body, requestContext(req)));
};
