import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { dashboardQuerySchema } from './dashboard.schema';
import { getDashboardController } from './dashboard.controller';

export const dashboardRouter = Router();

/**
 * `authenticated()`, not `requireRole` — both roles have a home screen. The
 * role gate is inside the controller, which picks the payload *before*
 * querying, so a STAFF token never causes a shop-wide figure to be read.
 * See the note there.
 */
dashboardRouter.get('/', requireAuth, authenticated(), validate({ query: dashboardQuerySchema }), getDashboardController);
