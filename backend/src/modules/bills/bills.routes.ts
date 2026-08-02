import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { authenticated } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import {
  billIdParamsSchema,
  createBillSchema,
  listBillsQuerySchema,
  pdfQuerySchema,
  sendBillSchema,
} from './bills.schema';
import {
  createBillController,
  getBillController,
  getBillPdfController,
  listBillsController,
  sendBillController,
} from './bills.controller';

export const billsRouter = Router();

billsRouter.get('/', requireAuth, authenticated(), validate({ query: listBillsQuerySchema }), listBillsController);

billsRouter.post('/', requireAuth, authenticated(), validate({ body: createBillSchema }), createBillController);

billsRouter.get(
  '/:id',
  requireAuth,
  authenticated(),
  validate({ params: billIdParamsSchema }),
  getBillController,
);

billsRouter.get(
  '/:id/pdf',
  requireAuth,
  authenticated(),
  validate({ params: billIdParamsSchema, query: pdfQuerySchema }),
  getBillPdfController,
);

billsRouter.post(
  '/:id/send',
  requireAuth,
  authenticated(),
  validate({ params: billIdParamsSchema, body: sendBillSchema }),
  sendBillController,
);
