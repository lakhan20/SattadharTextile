import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createSubCategorySchema,
  listSubCategoriesQuerySchema,
  subCategoryIdParamsSchema,
  updateSubCategorySchema,
} from './subcategories.schema';
import {
  createSubCategoryController,
  deleteSubCategoryController,
  getSubCategoryController,
  listSubCategoriesController,
  updateSubCategoryController,
} from './subcategories.controller';

export const subCategoriesRouter = Router();

subCategoriesRouter.get(
  '/',
  requireAuth,
  authenticated(),
  validate({ query: listSubCategoriesQuerySchema }),
  listSubCategoriesController,
);

subCategoriesRouter.get(
  '/:id',
  requireAuth,
  authenticated(),
  validate({ params: subCategoryIdParamsSchema }),
  getSubCategoryController,
);

subCategoriesRouter.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: createSubCategorySchema }),
  createSubCategoryController,
);

subCategoriesRouter.patch(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: subCategoryIdParamsSchema, body: updateSubCategorySchema }),
  updateSubCategoryController,
);

subCategoriesRouter.delete(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: subCategoryIdParamsSchema }),
  deleteSubCategoryController,
);
