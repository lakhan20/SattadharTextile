import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { uploadImportFile, uploadProductImage } from '../../middleware/upload';
import {
  createProductSchema,
  lastPriceQuerySchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateProductSchema,
} from './products.schema';
import {
  bulkImportProductsController,
  createProductController,
  deleteProductController,
  getLastPriceController,
  getProductController,
  listProductsController,
  updateProductController,
  uploadProductImageController,
} from './products.controller';

export const productsRouter = Router();

productsRouter.get(
  '/',
  requireAuth,
  authenticated(),
  validate({ query: listProductsQuerySchema }),
  listProductsController,
);

// Fixed sub-paths must be declared before the /:id catch-all.
productsRouter.post(
  '/upload-image',
  requireAuth,
  requirePermission('product.create'),
  uploadProductImage,
  uploadProductImageController,
);

productsRouter.post(
  '/bulk-import',
  requireAuth,
  requirePermission('product.create'),
  uploadImportFile,
  bulkImportProductsController,
);

productsRouter.get(
  '/:id',
  requireAuth,
  authenticated(),
  validate({ params: productIdParamsSchema }),
  getProductController,
);

productsRouter.get(
  '/:id/last-price',
  requireAuth,
  authenticated(),
  validate({ params: productIdParamsSchema, query: lastPriceQuerySchema }),
  getLastPriceController,
);

productsRouter.post(
  '/',
  requireAuth,
  requirePermission('product.create'),
  validate({ body: createProductSchema }),
  createProductController,
);

productsRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('product.update'),
  validate({ params: productIdParamsSchema, body: updateProductSchema }),
  updateProductController,
);

productsRouter.delete(
  '/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ params: productIdParamsSchema }),
  deleteProductController,
);
