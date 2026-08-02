import { BillingMode } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

/**
 * `from` / `to` are read as IST calendar dates, with `to` INCLUSIVE — see
 * `reports.period.resolveRange`. Omitting both gives the current month, which
 * is what every report screen opens on.
 */
const dateRangeShape = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

/**
 * `format` decides the response body, not the data: JSON, or the very same
 * object rendered as a file. There is deliberately no format that returns a
 * *different* set of numbers.
 */
export const exportFormatSchema = z.enum(['json', 'pdf', 'excel']).default('json');

export const dateRangeQuerySchema = z.object({
  ...dateRangeShape,
  format: exportFormatSchema,
});

export const salesReportQuerySchema = z.object({
  ...dateRangeShape,
  format: exportFormatSchema,
  /** ALL is the absence of a filter, not a third billing mode. */
  mode: z.union([z.literal('ALL'), z.nativeEnum(BillingMode)]).default('ALL'),
  staffId: z.string().uuid('Pick a valid staff member.').optional(),
});

/** Valuation, outstanding and ageing are "as of now" — no range applies. */
export const snapshotQuerySchema = z.object({
  format: exportFormatSchema,
});

export const lowStockReportQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  format: exportFormatSchema,
});

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type SnapshotQuery = z.infer<typeof snapshotQuerySchema>;
export type LowStockReportQuery = z.infer<typeof lowStockReportQuerySchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
