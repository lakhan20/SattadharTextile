import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { badRequest, unauthenticated } from '../../utils/errors';
import { body, params, query } from '../../middleware/validate';
import { productImageUrl } from '../../middleware/upload';
import {
  createProductSchema,
  lastPriceQuerySchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateProductSchema,
} from './products.schema';
import * as productsService from './products.service';
import { bulkImportProducts } from './products.import';

function requireActor(req: Request): { id: string; role: Role } {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id, role: user.role };
}

export const listProductsController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = query(req, listProductsQuerySchema);
  const result = await productsService.listProducts(input, actor.role);
  res.status(200).json({ data: result });
});

export const getProductController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, productIdParamsSchema);
  const product = await productsService.getProductById(id, actor.role);
  res.status(200).json({ data: product });
});

export const getLastPriceController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const { id } = params(req, productIdParamsSchema);
  const { customerId } = query(req, lastPriceQuerySchema);
  const result = await productsService.getLastPriceForCustomer(id, customerId);
  res.status(200).json({ data: result });
});

export const createProductController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, createProductSchema);
  const product = await productsService.createProduct(input, actor, req);
  res.status(201).json({ data: product });
});

export const updateProductController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, productIdParamsSchema);
  const input = body(req, updateProductSchema);
  const product = await productsService.updateProduct(id, input, actor, req);
  res.status(200).json({ data: product });
});

export const deleteProductController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, productIdParamsSchema);
  await productsService.deleteProduct(id, actor, req);
  res.status(200).json({ data: { deleted: true } });
});

export const uploadProductImageController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  if (!req.file) throw badRequest('No image file was uploaded.');
  res.status(201).json({ data: { imageUrl: productImageUrl(req.file.filename) } });
});

export const bulkImportProductsController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  if (!req.file) throw badRequest('No file was uploaded.');
  const summary = await bulkImportProducts({ buffer: req.file.buffer, originalname: req.file.originalname }, actor, req);
  res.status(200).json({ data: summary });
});
