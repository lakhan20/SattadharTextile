import { Unit } from '@prisma/client';
import { z } from 'zod';
import { booleanQueryParam, paginationQuerySchema } from '../../utils/pagination';

export const productIdParamsSchema = z.object({
  id: z.string().uuid('Invalid product id.'),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(150, 'Name must be 150 characters or fewer.'),
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required.')
    .max(50, 'SKU must be 50 characters or fewer.')
    .transform((v) => v.toUpperCase()),
  categoryId: z.string().uuid('Pick a valid category.'),
  subCategoryId: z.string().uuid('Pick a valid sub-category.').optional(),
  hsnCode: z.string().trim().max(20).optional(),
  unit: z.nativeEnum(Unit).default(Unit.METER),
  retailRate: z.coerce.number().nonnegative('Retail rate must be 0 or more.'),
  wholesaleRate: z.coerce.number().nonnegative('Wholesale rate must be 0 or more.'),
  /**
   * Accepted here but only ever honoured for an ADMIN actor — the service
   * layer forces this to 0 for any non-ADMIN caller, on create AND update.
   */
  costPrice: z.coerce.number().nonnegative('Cost price must be 0 or more.').optional(),
  gstPercent: z.coerce.number().min(0).max(100).default(5),
  colour: z.string().trim().max(50).optional(),
  width: z.string().trim().max(30).optional(),
  gsm: z.coerce.number().int().positive().optional(),
  imageUrl: z.string().trim().max(500).optional(),
  openingStock: z.coerce.number().nonnegative().default(0),
  reorderLevel: z.coerce.number().nonnegative().default(0),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listProductsQuerySchema = paginationQuerySchema.extend({
  /** Matches against name or SKU. */
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid('Pick a valid category.').optional(),
  subCategoryId: z.string().uuid('Pick a valid sub-category.').optional(),
  isActive: booleanQueryParam,
});

export const lastPriceQuerySchema = z.object({
  customerId: z.string().uuid('Pick a valid customer.'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type LastPriceQuery = z.infer<typeof lastPriceQuerySchema>;
