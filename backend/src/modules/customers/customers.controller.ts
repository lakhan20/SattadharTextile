import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body, params, query } from '../../middleware/validate';
import {
  createCustomerSchema,
  customerIdParamsSchema,
  listCustomersQuerySchema,
  lookupByPhoneQuerySchema,
} from './customers.schema';
import * as customersService from './customers.service';

export const listCustomersController = asyncHandler(async (req: Request, res: Response) => {
  const input = query(req, listCustomersQuerySchema);
  const result = await customersService.listCustomers(input);
  res.status(200).json({ data: result });
});

export const getCustomerController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, customerIdParamsSchema);
  const customer = await customersService.getCustomerById(id);
  res.status(200).json({ data: customer });
});

/**
 * Answers "is this number already on file?" so the new-customer form can offer
 * the existing record before anyone fills the rest of it in. `null` rather
 * than a 404: "nobody has this number" is a successful answer, not a missing
 * page, and the form treats it as the green light to carry on typing.
 */
export const lookupCustomerByPhoneController = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = query(req, lookupByPhoneQuerySchema);
  res.status(200).json({ data: await customersService.lookupByPhone(phone) });
});

export const createCustomerController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  const input = body(req, createCustomerSchema);
  const customer = await customersService.createCustomer(input, { id: user.id }, req);
  res.status(201).json({ data: customer });
});
