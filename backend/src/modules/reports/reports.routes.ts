import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  dateRangeQuerySchema,
  lowStockReportQuerySchema,
  salesReportQuerySchema,
  snapshotQuerySchema,
} from './reports.schema';
import {
  ageingReportController,
  categorySalesReportController,
  gstSummaryController,
  lowStockReportController,
  outstandingReportController,
  paymentCollectionReportController,
  productSalesReportController,
  profitMarginReportController,
  salesReportController,
  stockValuationReportController,
} from './reports.controller';

export const reportsRouter = Router();

/**
 * ── The reporting boundary ───────────────────────────────────────────────
 *
 * Every route below is `requireRole(ADMIN)` except `/low-stock`. That is the
 * whole policy, and it is stated once here rather than scattered through the
 * controllers, so the answer to "can staff read this?" is a single line of
 * this file per endpoint.
 *
 * A STAFF token on any admin route gets a flat 403 — not a filtered subset,
 * not an empty list. A silently narrowed response would teach staff that these
 * URLs are theirs to call, and the next report added would inherit the habit.
 *
 * Deliberately NOT a `requirePermission` toggle, unlike stock-in or
 * customer-edit: shop-wide revenue, margin, cost price and other staff's sales
 * are a role boundary. There must be no switch an owner can flip that hands a
 * staff account the shop's profit figures.
 */
const adminOnly = [requireAuth, requireRole(Role.ADMIN)] as const;

// ── Sales ────────────────────────────────────────────────────────────────
reportsRouter.get('/sales', ...adminOnly, validate({ query: salesReportQuerySchema }), salesReportController);

// ── GST ──────────────────────────────────────────────────────────────────
reportsRouter.get('/gst-summary', ...adminOnly, validate({ query: dateRangeQuerySchema }), gstSummaryController);

// ── Stock ────────────────────────────────────────────────────────────────
// Valuation multiplies quantity by costPrice, so it is ADMIN-only for the same
// reason /stock/valuation is.
reportsRouter.get(
  '/stock-valuation',
  ...adminOnly,
  validate({ query: snapshotQuerySchema }),
  stockValuationReportController,
);

// The one exception. Low stock is an operational alert, not a financial
// figure — the query behind it selects no cost columns at all, so there is
// nothing here a staff account should not see.
reportsRouter.get(
  '/low-stock',
  requireAuth,
  authenticated(),
  validate({ query: lowStockReportQuerySchema }),
  lowStockReportController,
);

// ── Customers / credit ───────────────────────────────────────────────────
reportsRouter.get('/outstanding', ...adminOnly, validate({ query: snapshotQuerySchema }), outstandingReportController);
reportsRouter.get('/ageing', ...adminOnly, validate({ query: snapshotQuerySchema }), ageingReportController);

// ── Product / category / collection ──────────────────────────────────────
reportsRouter.get(
  '/product-sales',
  ...adminOnly,
  validate({ query: dateRangeQuerySchema }),
  productSalesReportController,
);
reportsRouter.get(
  '/category-sales',
  ...adminOnly,
  validate({ query: dateRangeQuerySchema }),
  categorySalesReportController,
);
reportsRouter.get(
  '/payment-collection',
  ...adminOnly,
  validate({ query: dateRangeQuerySchema }),
  paymentCollectionReportController,
);

// ── Profit ───────────────────────────────────────────────────────────────
// Built on costPriceSnapshot. ADMIN only, full stop.
reportsRouter.get(
  '/profit-margin',
  ...adminOnly,
  validate({ query: dateRangeQuerySchema }),
  profitMarginReportController,
);
