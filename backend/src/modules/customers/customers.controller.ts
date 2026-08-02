import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { params, query } from '../../middleware/validate';
import { customerIdParamsSchema, listCustomersQuerySchema } from './customers.schema';
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
