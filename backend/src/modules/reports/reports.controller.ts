import type { Request, Response } from 'express';
import { AuditAction, BillingMode, Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { getShopSettings } from '../../utils/shopSettings';
import { query } from '../../middleware/validate';
import {
  dateRangeQuerySchema,
  lowStockReportQuerySchema,
  salesReportQuerySchema,
  snapshotQuerySchema,
  type ExportFormat,
} from './reports.schema';
import { resolveRange } from './reports.period';
import { streamReportExcel, streamReportPdf, type ReportDocument } from './reports.export';
import * as documents from './reports.documents';
import * as reportsService from './reports.service';

/**
 * Every handler here is mounted behind `requireRole(ADMIN)` except low-stock —
 * see `reports.routes.ts`, which is the actual boundary. This file assumes the
 * caller already passed that gate and does not re-check it; a second, softer
 * check here would be the kind of thing that eventually gets relaxed.
 */

function requireActor(req: Request): { id: string; role: Role } {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id, role: user.role };
}

/**
 * The one place a report becomes a response.
 *
 * JSON and both file formats are rendered from the *same* already-computed
 * object, so an export can never show a different number from the screen it
 * was launched from. Exports are audited: a shop's whole sales history leaving
 * as a file is worth a row in the trail, and `AuditAction.EXPORT` already
 * exists for exactly this.
 */
async function respond(
  req: Request,
  res: Response,
  format: ExportFormat,
  payload: unknown,
  buildDocument: () => ReportDocument,
): Promise<void> {
  if (format === 'json') {
    res.status(200).json({ data: payload });
    return;
  }

  const [shop, document] = [await getShopSettings(), buildDocument()];

  await writeAudit({
    userId: req.user?.id ?? null,
    action: AuditAction.EXPORT,
    entity: 'Report',
    entityId: document.slug,
    after: { format, range: document.range ?? null },
    req,
  });

  if (format === 'pdf') {
    await streamReportPdf(res, shop, document);
    return;
  }
  await streamReportExcel(res, shop, document);
}

// ── Sales ────────────────────────────────────────────────────────────────

export const salesReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, salesReportQuerySchema);
  const range = resolveRange(input.from, input.to);

  const result = await reportsService.getSalesReport(range, {
    mode: input.mode === 'ALL' ? undefined : (input.mode as BillingMode),
    staffId: input.staffId,
  });

  await respond(req, res, input.format, result, () => documents.salesDocument(result));
});

// ── GST ──────────────────────────────────────────────────────────────────

export const gstSummaryController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, dateRangeQuerySchema);
  const result = await reportsService.getGstSummary(resolveRange(input.from, input.to));
  await respond(req, res, input.format, result, () => documents.gstSummaryDocument(result));
});

// ── Stock ────────────────────────────────────────────────────────────────

/** ADMIN ONLY — built on costPrice. No permission toggle may open this. */
export const stockValuationReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, snapshotQuerySchema);
  const result = await reportsService.getStockValuationReport();
  await respond(req, res, input.format, result, () => documents.stockValuationDocument(result));
});

/**
 * The one report STAFF may read. `listLowStock` selects no cost columns at
 * all, so there is nothing to strip for a non-admin viewer — the shape is
 * identical for both roles because it contains no cost data in the first place.
 */
export const lowStockReportController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = query(req, lowStockReportQuerySchema);

  // An export wants the whole list, not page one of it.
  const result = await reportsService.getLowStockReport({
    page: input.format === 'json' ? input.page : 1,
    pageSize: input.format === 'json' ? input.pageSize : 100,
    search: input.search,
  });

  await respond(req, res, input.format, result, () =>
    documents.lowStockDocument(result, actor.role === Role.ADMIN),
  );
});

// ── Customers / credit ───────────────────────────────────────────────────

export const outstandingReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, snapshotQuerySchema);
  const result = await reportsService.getOutstandingReport();
  await respond(req, res, input.format, result, () => documents.outstandingDocument(result));
});

export const ageingReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, snapshotQuerySchema);
  const result = await reportsService.getAgeingReport();
  await respond(req, res, input.format, result, () => documents.ageingDocument(result));
});

// ── Product / category / collection ──────────────────────────────────────

export const productSalesReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, dateRangeQuerySchema);
  const result = await reportsService.getProductSalesReport(resolveRange(input.from, input.to));
  await respond(req, res, input.format, result, () => documents.productSalesDocument(result));
});

export const categorySalesReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, dateRangeQuerySchema);
  const result = await reportsService.getCategorySalesReport(resolveRange(input.from, input.to));
  await respond(req, res, input.format, result, () => documents.categorySalesDocument(result));
});

export const paymentCollectionReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, dateRangeQuerySchema);
  const result = await reportsService.getPaymentCollectionReport(resolveRange(input.from, input.to));
  await respond(req, res, input.format, result, () => documents.paymentCollectionDocument(result));
});

// ── Profit ───────────────────────────────────────────────────────────────

/** ADMIN ONLY — derived from costPriceSnapshot. Never reachable by STAFF. */
export const profitMarginReportController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, dateRangeQuerySchema);
  const result = await reportsService.getProfitMarginReport(resolveRange(input.from, input.to));
  await respond(req, res, input.format, result, () => documents.profitMarginDocument(result));
});
