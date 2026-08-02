import { z } from 'zod';
import { booleanQueryParam, paginationQuerySchema } from '../../utils/pagination';

export const categoryIdParamsSchema = z.object({
  id: z.string().uuid('Invalid category id.'),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be 100 characters or fewer.'),
  code: z
    .string()
    .trim()
    .min(1, 'Code is required.')
    .max(30, 'Code must be 30 characters or fewer.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Code can use letters, numbers, underscore and hyphen only.')
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  isActive: booleanQueryParam,
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
