import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body, params, query } from '../../middleware/validate';
import {
  billIdParamsSchema,
  createBillSchema,
  listBillsQuerySchema,
  pdfQuerySchema,
  sendBillSchema,
} from './bills.schema';
import * as billsService from './bills.service';

function requireActor(req: Request): { id: string; role: Role; maxDiscountPercent: number } {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id, role: user.role, maxDiscountPercent: user.maxDiscountPercent };
}

export const createBillController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, createBillSchema);
  const bill = await billsService.createBill(input, actor, req);
  res.status(201).json({ data: bill });
});

export const listBillsController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = query(req, listBillsQuerySchema);
  const result = await billsService.listBills(input, actor);
  res.status(200).json({ data: result });
});

export const getBillController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, billIdParamsSchema);
  const bill = await billsService.getBillById(id, actor, req);
  res.status(200).json({ data: bill });
});

export const getBillPdfController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, billIdParamsSchema);
  const { lang } = query(req, pdfQuerySchema);
  const { absolutePath, fileName } = await billsService.getBillPdfPath(id, actor, req, lang);
  res.download(absolutePath, fileName);
});

export const sendBillController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, billIdParamsSchema);
  const input = body(req, sendBillSchema);
  const result = await billsService.sendBillStub(id, actor, req, input);
  res.status(200).json({ data: result });
});
