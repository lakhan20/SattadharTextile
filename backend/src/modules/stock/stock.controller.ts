import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body, query } from '../../middleware/validate';
import {
  listMovementsQuerySchema,
  lowStockQuerySchema,
  stockAdjustSchema,
  stockInSchema,
} from './stock.schema';
import * as stockService from './stock.service';

function requireActor(req: Request): { id: string; role: Role } {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id, role: user.role };
}

export const stockInController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, stockInSchema);
  const result = await stockService.recordStockIn(input, actor, req);
  res.status(201).json({ data: result });
});

export const stockAdjustController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, stockAdjustSchema);
  const result = await stockService.recordStockAdjustment(input, actor, req);
  res.status(201).json({ data: result });
});

export const listMovementsController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = query(req, listMovementsQuerySchema);
  const result = await stockService.listMovements(input, actor.role);
  res.status(200).json({ data: result });
});

export const lowStockController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const input = query(req, lowStockQuerySchema);
  const result = await stockService.listLowStock(input);
  res.status(200).json({ data: result });
});

/** ADMIN only — the route guard is the boundary that keeps costPrice in. */
export const stockValuationController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const result = await stockService.getStockValuation();
  res.status(200).json({ data: result });
});
