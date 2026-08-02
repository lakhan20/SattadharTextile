import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  ServerSettings: { fromLogin?: boolean } | undefined;
};

/**
 * Category and Sub-Category management live inside the Products tab rather
 * than as tabs of their own — they are catalog masters a product form leans
 * on, not destinations shopkeepers open on their own.
 */
export type ProductsStackParamList = {
  ProductsList: undefined;
  ProductForm: { productId?: string } | undefined;
  Categories: undefined;
  CategoryForm: { categoryId?: string } | undefined;
  SubCategories: undefined;
  SubCategoryForm: { subCategoryId?: string; categoryId?: string } | undefined;
};

/**
 * The bills list and a bill's detail hang off the Billing tab rather than
 * getting a tab each — writing a bill is the destination, looking one up is
 * something you do from there.
 */
export type BillingStackParamList = {
  NewBill: undefined;
  BillsList: undefined;
  BillDetail: { billId: string };
};

/**
 * Stock hangs off the More tab rather than taking a sixth tab — the bar is
 * already at five and its labels are tight at 10px. Overview is the entry
 * point; the ledger is reached by tapping a product from it.
 */
export type StockStackParamList = {
  StockOverview: undefined;
  StockIn: { productId?: string } | undefined;
  StockAdjust: { productId?: string } | undefined;
  StockLedger: { productId: string; productName?: string };
};

/**
 * Reports, like Stock, hang off a push over the tabs rather than taking a tab.
 *
 * The whole stack is registered ONLY in the ADMIN branch of `AppFlow` — a
 * staff session's navigator has no `Reports` route at all, so there is nothing
 * to deep-link to, nothing to reach by a stale back-stack entry, and nothing
 * for a mistyped `navigate()` to land on. That is defence in depth on top of
 * the real gate, which is the 403 the server returns.
 */
export type ReportsStackParamList = {
  ReportsHub: undefined;
  SalesReport: undefined;
  GstSummaryReport: undefined;
  StockValuationReport: undefined;
  LowStockReport: undefined;
  OutstandingReport: undefined;
  AgeingReport: undefined;
  ProductSalesReport: undefined;
  CategorySalesReport: undefined;
  PaymentCollectionReport: undefined;
  ProfitMarginReport: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Billing: NavigatorScreenParams<BillingStackParamList>;
  Products: NavigatorScreenParams<ProductsStackParamList>;
  Customers: undefined;
  More: undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Stock: NavigatorScreenParams<StockStackParamList>;
  /** Present in the navigator for ADMIN sessions only — see ReportsStackParamList. */
  Reports: NavigatorScreenParams<ReportsStackParamList>;
  ServerSettings: { fromLogin?: boolean } | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList, AuthStackParamList {}
  }
}
