import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requireRole } from '../../middleware/rbac';
import { sensitiveLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  createStaffSchema,
  listStaffQuerySchema,
  resetStaffPasswordSchema,
  staffIdParamsSchema,
  updateStaffSchema,
} from './staff.schema';
import {
  activateStaffController,
  createStaffController,
  deactivateStaffController,
  getStaffController,
  listStaffController,
  myMenuController,
  resetStaffPasswordController,
  staffOptionsController,
  unlockStaffController,
  updateStaffController,
} from './staff.controller';

/**
 * ── /admin/staff ─────────────────────────────────────────────────────────
 *
 * ADMIN-only without exception. Menu assignment lives here, and assigning a
 * menu is not the same as granting access: the endpoints those menus lead to
 * enforce their own role and permission checks, and would refuse a staff token
 * whatever this router had recorded.
 */
export const staffRouter = Router();

staffRouter.get(
  '/',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ query: listStaffQuerySchema }),
  listStaffController,
);

/** Before `/:id`, or Express reads "options" as a uuid and the validator rejects it. */
staffRouter.get('/options', requireAuth, requireRole(Role.ADMIN), staffOptionsController);

staffRouter.get(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: staffIdParamsSchema }),
  getStaffController,
);

staffRouter.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN),
  sensitiveLimiter,
  validate({ body: createStaffSchema }),
  createStaffController,
);

staffRouter.patch(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: staffIdParamsSchema, body: updateStaffSchema }),
  updateStaffController,
);

staffRouter.post(
  '/:id/deactivate',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: staffIdParamsSchema }),
  deactivateStaffController,
);

staffRouter.post(
  '/:id/activate',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: staffIdParamsSchema }),
  activateStaffController,
);

staffRouter.post(
  '/:id/reset-password',
  requireAuth,
  requireRole(Role.ADMIN),
  sensitiveLimiter,
  validate({ params: staffIdParamsSchema, body: resetStaffPasswordSchema }),
  resetStaffPasswordController,
);

staffRouter.post(
  '/:id/unlock',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: staffIdParamsSchema }),
  unlockStaffController,
);

/**
 * ── /me ──────────────────────────────────────────────────────────────────
 *
 * The signed-in account's own effective menu, used by the app to build its
 * navigation. Any signed-in session may read its own; there is nothing here
 * about the shop or about anyone else.
 */
export const meRouter = Router();

meRouter.get('/menu', requireAuth, authenticated(), myMenuController);
