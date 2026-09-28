import { Router } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerDonorSchema,
  registerHospitalSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@bbms/shared';
import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/authenticate.js';
import { createRateLimiter } from '../../middleware/rateLimits.js';
import { requireAllowedOrigin } from '../../middleware/requireAllowedOrigin.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

// Brute-force/abuse protection for credential and email-sending endpoints.
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX });

authRouter.post(
  '/register/donor',
  authLimiter,
  validate({ body: registerDonorSchema }),
  controller.registerDonor,
);
authRouter.post(
  '/register/hospital',
  authLimiter,
  validate({ body: registerHospitalSchema }),
  controller.registerHospital,
);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/refresh', requireAllowedOrigin, controller.refresh);
authRouter.post('/logout', requireAllowedOrigin, controller.logout);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
authRouter.get('/me', authenticate, controller.me);
authRouter.post(
  '/verify-email',
  authLimiter,
  validate({ body: verifyEmailSchema }),
  controller.verifyEmail,
);
authRouter.post('/resend-verification', authLimiter, authenticate, controller.resendVerification);
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);
authRouter.post(
  '/change-password',
  authLimiter,
  authenticate,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);
