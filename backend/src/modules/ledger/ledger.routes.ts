import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  customerIdParamsSchema,
  recordNoteSchema,
  recordPaymentSchema,
  statementQuerySchema,
} from './ledger.schema';
import {
  ageingController,
  customerStatementController,
  outstandingController,
  recordNoteController,
  recordPaymentController,
  reminderController,
} from './ledger.controller';

export const ledgerRouter = Router();

/**
 * ── The khata boundary ───────────────────────────────────────────────────
 *
 * The split here is between ONE customer and THE SHOP.
 *
 * A staff member at the counter needs the customer in front of them: their
 * balance, their statement, and the ability to take the money they are
 * holding. All three are gated by permission toggles the owner controls
 * (`payment.record`, `ledger.view`), both on by default for new staff.
 *
 * What the whole shop is owed is a different question. The outstanding list,
 * the total across every customer and the ageing report say how much cash the
 * business is carrying and who is slowest to pay — commercially sensitive in
 * the same way revenue and margin are, and gated by ROLE rather than by
 * permission for exactly that reason: there must be no switch an owner can
 * flip that hands a staff account the shop's debtor book.
 *
 * Credit and debit notes are ADMIN-only on the same logic. A note is the only
 * entry that moves a balance with no bill and no receipt behind it — writing
 * one off is the owner's decision, not the counter's.
 */
const adminOnly = [requireAuth, requireRole(Role.ADMIN)] as const;

// ── Per-customer: open to staff who hold the toggle ──────────────────────

ledgerRouter.post(
  '/payment',
  requireAuth,
  requirePermission('payment.record'),
  validate({ body: recordPaymentSchema }),
  recordPaymentController,
);

ledgerRouter.get(
  '/customer/:customerId',
  requireAuth,
  requirePermission('ledger.view'),
  validate({ params: customerIdParamsSchema, query: statementQuerySchema }),
  customerStatementController,
);

// Reveals one customer's balance and nothing else, so it sits with the
// statement rather than with the shop-wide screens.
ledgerRouter.post(
  '/reminder/:customerId',
  requireAuth,
  requirePermission('ledger.view'),
  validate({ params: customerIdParamsSchema }),
  reminderController,
);

// ── Shop-wide and write-offs: owner only ─────────────────────────────────

ledgerRouter.post('/note', ...adminOnly, validate({ body: recordNoteSchema }), recordNoteController);

ledgerRouter.get('/outstanding', ...adminOnly, outstandingController);

ledgerRouter.get('/ageing', ...adminOnly, ageingController);
