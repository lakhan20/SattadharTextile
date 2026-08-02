import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  billIdParamsSchema,
  createBillSchema,
  listBillsQuerySchema,
  listRevisionsQuerySchema,
  pdfQuerySchema,
  sendBillSchema,
  updateBillSchema,
} from './bills.schema';
import {
  allRevisionsController,
  billRevisionsController,
  createBillController,
  getBillController,
  getBillPdfController,
  listBillsController,
  sendBillController,
  updateBillController,
} from './bills.controller';

export const billsRouter = Router();

billsRouter.get('/', requireAuth, authenticated(), validate({ query: listBillsQuerySchema }), listBillsController);

billsRouter.post('/', requireAuth, authenticated(), validate({ body: createBillSchema }), createBillController);

/**
 * The shop-wide edit log — declared before `/:id/...` so "revisions" is not
 * matched as a bill id.
 *
 * ADMIN only, and not a permission toggle. "Which staff member has been
 * rewriting bills, and why" is a supervision question, and a supervision
 * report that the supervised can read is not one. A staff member sees their
 * own edits through the per-bill history instead.
 */
billsRouter.get(
  '/revisions',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ query: listRevisionsQuerySchema }),
  allRevisionsController,
);

billsRouter.get(
  '/:id',
  requireAuth,
  authenticated(),
  validate({ params: billIdParamsSchema }),
  getBillController,
);

/**
 * Revising an issued bill.
 *
 * Gated by `bill.edit`, which is OFF by default for STAFF — rewriting a bill
 * after it has been handed over is the easiest way to cover a mistake or a
 * theft, so an owner should switch it on deliberately. The service adds
 * ownership on top: a staff member holding the toggle may still only revise
 * bills they wrote themselves.
 *
 * Every edit writes a `bill_revisions` row with a required reason and the
 * complete before/after, so an edit that should not have happened is visible
 * rather than merely forbidden.
 */
billsRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('bill.edit'),
  validate({ params: billIdParamsSchema, body: updateBillSchema }),
  updateBillController,
);

billsRouter.get(
  '/:id/revisions',
  requireAuth,
  authenticated(),
  validate({ params: billIdParamsSchema, query: listRevisionsQuerySchema }),
  billRevisionsController,
);

billsRouter.get(
  '/:id/pdf',
  requireAuth,
  authenticated(),
  validate({ params: billIdParamsSchema, query: pdfQuerySchema }),
  getBillPdfController,
);

billsRouter.post(
  '/:id/send',
  requireAuth,
  authenticated(),
  validate({ params: billIdParamsSchema, body: sendBillSchema }),
  sendBillController,
);
