import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated, requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  createCustomerSchema,
  customerIdParamsSchema,
  listCustomersQuerySchema,
  lookupByPhoneQuerySchema,
} from './customers.schema';
import {
  createCustomerController,
  getCustomerController,
  listCustomersController,
  lookupCustomerByPhoneController,
} from './customers.controller';

export const customersRouter = Router();

customersRouter.get(
  '/',
  requireAuth,
  authenticated(),
  validate({ query: listCustomersQuerySchema }),
  listCustomersController,
);

/**
 * Must be declared before `/:id`, or Express matches "by-phone" as an id and
 * the uuid validator rejects it.
 *
 * Open to any signed-in account: it reveals only whether a number is taken and
 * whose it is, which is exactly what the person about to register a duplicate
 * needs to know.
 */
customersRouter.get(
  '/by-phone',
  requireAuth,
  authenticated(),
  validate({ query: lookupByPhoneQuerySchema }),
  lookupCustomerByPhoneController,
);

customersRouter.get(
  '/:id',
  requireAuth,
  authenticated(),
  validate({ params: customerIdParamsSchema }),
  getCustomerController,
);

/**
 * `customer.create` already existed as a granular toggle and defaults ON for
 * new STAFF accounts — registering the person at the counter is counter work,
 * not owner work. An owner who disagrees can switch it off per account.
 */
customersRouter.post(
  '/',
  requireAuth,
  requirePermission('customer.create'),
  validate({ body: createCustomerSchema }),
  createCustomerController,
);
