import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { listMovementsQuerySchema, lowStockQuerySchema, stockAdjustSchema, stockInSchema } from './stock.schema';
import {
  listMovementsController,
  lowStockController,
  stockAdjustController,
  stockInController,
  stockValuationController,
} from './stock.controller';

export const stockRouter = Router();

/**
 * Writing stock is gated by the granular toggles that already exist on
 * `users.permissions` — ADMIN holds them implicitly, and a STAFF account holds
 * them only if the owner switched them on (both default to off). Reading the
 * shelf is open to any signed-in account; reading its *value* is not, because
 * valuation is built on costPrice.
 */
stockRouter.post(
  '/in',
  requireAuth,
  requirePermission('stock.in'),
  validate({ body: stockInSchema }),
  stockInController,
);

stockRouter.post(
  '/adjust',
  requireAuth,
  requirePermission('stock.adjust'),
  validate({ body: stockAdjustSchema }),
  stockAdjustController,
);

stockRouter.get(
  '/movements',
  requireAuth,
  authenticated(),
  validate({ query: listMovementsQuerySchema }),
  listMovementsController,
);

stockRouter.get('/low', requireAuth, authenticated(), validate({ query: lowStockQuerySchema }), lowStockController);

// ADMIN only, and deliberately not a permission toggle: no STAFF account may be
// granted access to cost price by any means.
stockRouter.get('/valuation', requireAuth, requireRole(Role.ADMIN), stockValuationController);
