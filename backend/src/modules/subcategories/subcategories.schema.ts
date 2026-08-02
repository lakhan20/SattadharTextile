import { z } from 'zod';
import { booleanQueryParam, paginationQuerySchema } from '../../utils/pagination';

export const subCategoryIdParamsSchema = z.object({
  id: z.string().uuid('Invalid sub-category id.'),
});

export const createSubCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be 100 characters or fewer.'),
  categoryId: z.string().uuid('Pick a valid category.'),
});

export const updateSubCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be 100 characters or fewer.').optional(),
  categoryId: z.string().uuid('Pick a valid category.').optional(),
  isActive: z.boolean().optional(),
});

export const listSubCategoriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid('Pick a valid category.').optional(),
  isActive: booleanQueryParam,
});

export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>;
export type UpdateSubCategoryInput = z.infer<typeof updateSubCategorySchema>;
export type ListSubCategoriesQuery = z.infer<typeof listSubCategoriesQuerySchema>;
