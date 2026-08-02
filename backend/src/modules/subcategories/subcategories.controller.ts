import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body, params, query } from '../../middleware/validate';
import {
  createSubCategorySchema,
  listSubCategoriesQuerySchema,
  subCategoryIdParamsSchema,
  updateSubCategorySchema,
} from './subcategories.schema';
import * as subCategoriesService from './subcategories.service';

function requireActor(req: Request): { id: string } {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id };
}

export const listSubCategoriesController = asyncHandler(async (req: Request, res: Response) => {
  const input = query(req, listSubCategoriesQuerySchema);
  const result = await subCategoriesService.listSubCategories(input);
  res.status(200).json({ data: result });
});

export const getSubCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, subCategoryIdParamsSchema);
  const subCategory = await subCategoriesService.getSubCategoryById(id);
  res.status(200).json({ data: subCategory });
});

export const createSubCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, createSubCategorySchema);
  const subCategory = await subCategoriesService.createSubCategory(input, actor, req);
  res.status(201).json({ data: subCategory });
});

export const updateSubCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, subCategoryIdParamsSchema);
  const input = body(req, updateSubCategorySchema);
  const subCategory = await subCategoriesService.updateSubCategory(id, input, actor, req);
  res.status(200).json({ data: subCategory });
});

export const deleteSubCategoryController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, subCategoryIdParamsSchema);
  await subCategoriesService.deleteSubCategory(id, actor, req);
  res.status(200).json({ data: { deleted: true } });
});
