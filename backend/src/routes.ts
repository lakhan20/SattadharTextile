import { Router } from 'express';
import { rbacSentinel } from './middleware/rbac';
import { authRouter } from './modules/auth/auth.routes';
import { healthRouter } from './modules/health/health.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { subCategoriesRouter } from './modules/subcategories/subcategories.routes';
import { productsRouter } from './modules/products/products.routes';
import { billsRouter } from './modules/bills/bills.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { stockRouter } from './modules/stock/stock.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';

export const apiRouter = Router();

// Default-deny: nothing mounted below may respond without declaring a policy.
apiRouter.use(rbacSentinel);

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/sub-categories', subCategoriesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/bills', billsRouter);
// Read-only for now (list + get) — just enough for the billing customer
// picker and last-price lookups. Create/update/khata land with the full
// customers module.
apiRouter.use('/customers', customersRouter);
// Stock-in, adjustments, the movement ledger, low-stock alerts and valuation.
// Sales already write their own OUT movements from inside the bill transaction
// (bills.service) — this module never duplicates that path.
apiRouter.use('/stock', stockRouter);

// Read-only, both roles — but the payload is chosen by role before any query
// runs, so a STAFF session never causes a shop-wide figure to be read.
apiRouter.use('/dashboard', dashboardRouter);

// ADMIN-only throughout, with one deliberate exception (/reports/low-stock,
// an operational alert carrying no cost data). The policy is stated once, per
// endpoint, in reports.routes.ts.
apiRouter.use('/reports', reportsRouter);

// Modules added in later stages:
//   /discounts
//   /ledger  /payments  /users  /settings
