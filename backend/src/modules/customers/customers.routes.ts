import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { customerIdParamsSchema, listCustomersQuerySchema } from './customers.schema';
import { getCustomerController, listCustomersController } from './customers.controller';

export const customersRouter = Router();

customersRouter.get(
  '/',
  requireAuth,
  authenticated(),
  validate({ query: listCustomersQuerySchema }),
  listCustomersController,
);

customersRouter.get(
  '/:id',
  requireAuth,
  authenticated(),
  validate({ params: customerIdParamsSchema }),
  getCustomerController,
);
