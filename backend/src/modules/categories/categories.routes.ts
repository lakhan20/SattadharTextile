import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './categories.schema';
import {
  createCategoryController,
  deleteCategoryController,
  getCategoryController,
  listCategoriesController,
  updateCategoryController,
} from './categories.controller';

export const categoriesRouter = Router();

categoriesRouter.get(
  '/',
  requireAuth,
  authenticated(),
  validate({ query: listCategoriesQuerySchema }),
  listCategoriesController,
);

categoriesRouter.get(
  '/:id',
  requireAuth,
  authenticated(),
  validate({ params: categoryIdParamsSchema }),
  getCategoryController,
);

categoriesRouter.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: createCategorySchema }),
  createCategoryController,
);

categoriesRouter.patch(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  updateCategoryController,
);

categoriesRouter.delete(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: categoryIdParamsSchema }),
  deleteCategoryController,
);
