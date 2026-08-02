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
/**
 * Looking at one bill, and everything that hangs off it.
 *
 * Shared between the Billing and Customers stacks, because "show me this
 * customer's bills" has to end somewhere and that somewhere is a bill. Pushing
 * the detail onto whichever stack the user is already in keeps the back button
 * meaningful — from a customer's history, back goes to the customer, not to a
 * different tab.
 *
 * The screens that serve these routes are typed against THIS list alone, so
 * they only ever navigate to routes both stacks are guaranteed to have.
 */
export type BillRoutes = {
  BillDetail: { billId: string };
  /** Needs the `bill.edit` permission; the server also limits staff to their own bills. */
  BillEdit: { billId: string };
  /** One bill's edit history — open to whoever may open the bill. */
  BillRevisions: { billId: string; billNumber?: string };
};

export type BillingStackParamList = BillRoutes & {
  NewBill: undefined;
  BillsList: undefined;
  /**
   * The shop-wide edit log. Registered ONLY in the ADMIN branch of
   * `BillingStackNavigator`, so a staff session has no route to it — defence
   * in depth on top of the 403 the server returns.
   */
  BillEditLog: undefined;
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

/**
 * Customers and their khata share one stack, because that is how the work
 * actually flows: you look someone up, you open their book, you take the
 * money. Splitting them would put a tab switch in the middle of a two-minute
 * job at the counter.
 *
 * `Outstanding` and `Ageing` are registered ONLY in the ADMIN branch of
 * `CustomersStackNavigator` — a staff session's navigator has no such route,
 * exactly as with `Reports`. The server's 403 is the real boundary; this is
 * defence in depth on top of it.
 */
export type CustomersStackParamList = BillRoutes & {
  CustomersList: undefined;
  /** `phone` pre-fills the form when arriving from a "not on file" prompt. */
  CustomerForm: { phone?: string } | undefined;
  CustomerDetail: { customerId: string; customerName?: string };
  /** Everything this customer has ever bought — the purchase history. */
  CustomerBills: { customerId: string; customerName?: string };
  CustomerKhata: { customerId: string; customerName?: string };
  RecordPayment: { customerId: string; customerName?: string; billId?: string };
  /** ADMIN only. */
  KhataNote: { customerId: string; customerName?: string };
  /** ADMIN only. */
  Outstanding: undefined;
  /** ADMIN only. */
  Ageing: undefined;
};

/**
 * Staff accounts and their menu assignment. ADMIN only, exactly like Reports:
 * the whole stack is registered only in the owner's branch of `AppFlow`, so a
 * staff session's navigator has no route to it. The server's 403 on
 * `/admin/staff/*` is the real boundary; this is defence in depth on top.
 */
export type StaffStackParamList = {
  StaffList: undefined;
  /** No `staffId` means "create". `staffName` is only for the header while it loads. */
  StaffForm: { staffId?: string; staffName?: string } | undefined;
  StaffDetail: { staffId: string; staffName?: string };
};

/**
 * Which tabs exist is decided at runtime from `/me/menu` — see `TabNavigator`.
 * The type lists every tab that CAN be registered; a session whose menu omits
 * one simply has no such route, so `navigate('Products')` from a staff session
 * that was not given Products fails rather than landing anywhere.
 *
 * `More` is not an assignable menu key: it holds sign-out, the language choice
 * and the server address, which every session needs.
 */
export type TabParamList = {
  Dashboard: undefined;
  Billing: NavigatorScreenParams<BillingStackParamList>;
  Products: NavigatorScreenParams<ProductsStackParamList>;
  Customers: NavigatorScreenParams<CustomersStackParamList>;
  More: undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  /** Registered only when the session's menu carries `STOCK`. */
  Stock: NavigatorScreenParams<StockStackParamList>;
  /** Present in the navigator for ADMIN sessions only — see ReportsStackParamList. */
  Reports: NavigatorScreenParams<ReportsStackParamList>;
  /** ADMIN only — see StaffStackParamList. */
  Staff: NavigatorScreenParams<StaffStackParamList>;
  ServerSettings: { fromLogin?: boolean } | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList, AuthStackParamList {}
  }
}
