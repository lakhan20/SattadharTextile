import { CustomerType } from '@prisma/client';
import { z } from 'zod';
import { booleanQueryParam, paginationQuerySchema } from '../../utils/pagination';

export const customerIdParamsSchema = z.object({
  id: z.string().uuid('Invalid customer id.'),
});

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  /** Matches against name or phone. */
  search: z.string().trim().max(100).optional(),
  type: z.nativeEnum(CustomerType).optional(),
  isActive: booleanQueryParam,
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
