import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body, params, query } from '../../middleware/validate';
import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './categories.schema';
import * as categoriesService from './categories.service';

function requireActor(req: Request): { id: string } {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id };
}

export const listCategoriesController = asyncHandler(async (req: Request, res: Response) => {
  const input = query(req, listCategoriesQuerySchema);
  const result = await categoriesService.listCategories(input);
  res.status(200).json({ data: result });
});

export const getCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, categoryIdParamsSchema);
  const category = await categoriesService.getCategoryById(id);
  res.status(200).json({ data: category });
});

export const createCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, createCategorySchema);
  const category = await categoriesService.createCategory(input, actor, req);
  res.status(201).json({ data: category });
});

export const updateCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, categoryIdParamsSchema);
  const input = body(req, updateCategorySchema);
  const category = await categoriesService.updateCategory(id, input, actor, req);
  res.status(200).json({ data: category });
});

export const deleteCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, categoryIdParamsSchema);
  await categoriesService.deleteCategory(id, actor, req);
  res.status(200).json({ data: { deleted: true } });
});
