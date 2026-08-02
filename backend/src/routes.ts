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
import { ledgerRouter } from './modules/ledger/ledger.routes';
import { meRouter, staffRouter } from './modules/staff/staff.routes';

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

// The khata. Every rupee of `customers.outstanding` is explained by a row in
// `ledger_entries`, and `ledger.posting.postLedgerEntry` is the only thing in
// the codebase allowed to move either — billing included. Per-customer views
// are open to staff; the shop-wide debtor book is not. See ledger.routes.ts.
apiRouter.use('/ledger', ledgerRouter);

// Read-only, both roles — but the payload is chosen by role before any query
// runs, so a STAFF session never causes a shop-wide figure to be read.
apiRouter.use('/dashboard', dashboardRouter);

// ADMIN-only throughout, with one deliberate exception (/reports/low-stock,
// an operational alert carrying no cost data). The policy is stated once, per
// endpoint, in reports.routes.ts.
apiRouter.use('/reports', reportsRouter);

// Staff accounts and the menus assigned to them. ADMIN-only throughout.
//
// Menu assignment decides what a staff account SEES; it never decides what the
// server ALLOWS. The assignable set contains no owner-only key, the API rejects
// one if it is sent by hand, and /reports, stock valuation and the shop-wide
// debtor book stay behind requireRole(ADMIN) whatever menu anyone was given.
apiRouter.use('/admin/staff', staffRouter);

// The signed-in account's own effective menu, for building the app's navigation.
apiRouter.use('/me', meRouter);

// Modules added in later stages:
//   /discounts  /settings
