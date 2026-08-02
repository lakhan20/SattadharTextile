import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body, params, query } from '../../middleware/validate';
import {
  billIdParamsSchema,
  createBillSchema,
  listBillsQuerySchema,
  listRevisionsQuerySchema,
  pdfQuerySchema,
  sendBillSchema,
  updateBillSchema,
} from './bills.schema';
import { streamInvoicePdf } from '../../pdf/invoice.pdf';
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

export const updateBillController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, billIdParamsSchema);
  const input = body(req, updateBillSchema);
  const bill = await billsService.updateBill(id, input, actor, req);
  res.status(200).json({ data: bill });
});

/** One bill's edit history. Visible to anyone who may see the bill itself. */
export const billRevisionsController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, billIdParamsSchema);
  const input = query(req, listRevisionsQuerySchema);
  // Reuses the bill's own access check, so a staff member cannot read the
  // edit history of a bill they could not open.
  await billsService.getBillById(id, actor, req);
  const result = await billsService.listBillRevisions({ ...input, billId: id }, actor);
  res.status(200).json({ data: result });
});

/** Shop-wide edit log — ADMIN only at the route. */
export const allRevisionsController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = query(req, listRevisionsQuerySchema);
  const result = await billsService.listBillRevisions(input, actor);
  res.status(200).json({ data: result });
});

export const getBillPdfController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, billIdParamsSchema);
  const { lang } = query(req, pdfQuerySchema);
  const data = await billsService.getBillPdfData(id, actor, req, lang);
  await streamInvoicePdf(res, data);
});

export const sendBillController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { id } = params(req, billIdParamsSchema);
  const input = body(req, sendBillSchema);
  const result = await billsService.sendBillStub(id, actor, req, input);
  res.status(200).json({ data: result });
});
