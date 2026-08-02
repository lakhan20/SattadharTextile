import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, publicRoute, requireRole } from '../../middleware/rbac';
import { loginLimiter, sensitiveLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  adminResetPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
} from './auth.schema';
import {
  adminResetPasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
} from './auth.controller';

export const authRouter = Router();

/**
 * Every route states its access policy explicitly. The RBAC sentinel refuses
 * to send a response from any route that forgot to.
 */

authRouter.post(
  '/login',
  publicRoute(),
  loginLimiter,
  validate({ body: loginSchema }),
  loginController,
);

authRouter.post(
  '/refresh',
  publicRoute(),
  sensitiveLimiter,
  validate({ body: refreshSchema }),
  refreshController,
);

authRouter.post(
  '/logout',
  requireAuth,
  authenticated(),
  validate({ body: logoutSchema }),
  logoutController,
);

authRouter.get('/me', requireAuth, authenticated(), meController);

authRouter.post(
  '/admin/reset-password',
  requireAuth,
  requireRole(Role.ADMIN),
  sensitiveLimiter,
  validate({ body: adminResetPasswordSchema }),
  adminResetPasswordController,
);
