import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body, params, query } from '../../middleware/validate';
import {
  customerIdParamsSchema,
  recordNoteSchema,
  recordPaymentSchema,
  statementQuerySchema,
} from './ledger.schema';
import * as ledgerService from './ledger.service';

function requireActor(req: Request): { id: string; role: Role } {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id, role: user.role };
}

export const recordPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, recordPaymentSchema);
  const result = await ledgerService.recordPayment(input, actor, req);
  res.status(201).json({ data: result });
});

/** ADMIN only — the route guard is the boundary. */
export const recordNoteController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = body(req, recordNoteSchema);
  const result = await ledgerService.recordNote(input, actor, req);
  res.status(201).json({ data: result });
});

export const customerStatementController = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { customerId } = params(req, customerIdParamsSchema);
  const input = query(req, statementQuerySchema);
  const result = await ledgerService.getCustomerStatement(customerId, input, actor);
  res.status(200).json({ data: result });
});

/** ADMIN only — this is the shop-wide figure, not one customer's. */
export const outstandingController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  res.status(200).json({ data: await ledgerService.getOutstandingList() });
});

/** ADMIN only. */
export const ageingController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  res.status(200).json({ data: await ledgerService.getAgeing() });
});

export const reminderController = asyncHandler(async (req: Request, res: Response) => {
  requireActor(req);
  const { customerId } = params(req, customerIdParamsSchema);
  const result = await ledgerService.buildPaymentReminder(customerId);
  res.status(200).json({ data: result });
});
