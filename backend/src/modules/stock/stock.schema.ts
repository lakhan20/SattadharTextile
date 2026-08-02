import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

/**
 * Quantities are `numeric(14,3)` in the database. Unit-awareness (a PIECE
 * product may not take 3.5) cannot be expressed here because it depends on the
 * product row — the service enforces it once the product is loaded, exactly as
 * billing does.
 */
export const stockInSchema = z.object({
  productId: z.string().uuid('Pick a valid product.'),
  qty: z.coerce.number().positive('Quantity must be greater than 0.'),
  reason: z.string().trim().min(1, 'Say what this stock-in is for.').max(200, 'Keep the reason under 200 characters.'),
  /**
   * Purchase / landed rate for this consignment. Accepted here but only ever
   * honoured for an ADMIN actor — the service drops it for anyone else, the
   * same way products.costPrice is handled.
   */
  rate: z.coerce.number().nonnegative('Rate must be 0 or more.').optional(),
  supplierRef: z.string().trim().max(100, 'Keep the supplier reference under 100 characters.').optional(),
});

export const stockAdjustSchema = z.object({
  productId: z.string().uuid('Pick a valid product.'),
  /** Signed: negative for damage/wastage, positive for a correction upwards. */
  qty: z.coerce
    .number()
    .refine((v) => v !== 0, 'An adjustment of zero changes nothing.')
    .refine((v) => Number.isFinite(v), 'Enter a valid quantity.'),
  /** Required — an unexplained adjustment is indistinguishable from shrinkage. */
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required for every adjustment.')
    .max(200, 'Keep the reason under 200 characters.'),
});

export const listMovementsQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid('Pick a valid product.').optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const lowStockQuerySchema = paginationQuerySchema.extend({
  /** Matches against name or SKU, like the products list. */
  search: z.string().trim().max(100).optional(),
});

export type StockInInput = z.infer<typeof stockInSchema>;
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
