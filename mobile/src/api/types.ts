/** Mirrors the backend's response contract. See docs/API.md. */

export type Role = 'ADMIN' | 'STAFF';
export type ServerLanguage = 'EN' | 'GU';

export const PERMISSION_KEYS = [
  'stock.in',
  'stock.adjust',
  'product.create',
  'product.update',
  'customer.create',
  'customer.update',
  'bill.cancel',
  /** Rewrite an already-issued bill. Off by default — see the note on `UpdateBillInput`. */
  'bill.edit',
  'payment.record',
  'ledger.view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * ── Menu assignment ──────────────────────────────────────────
 *
 * Which SCREENS an account sees, as decided by the shop owner. Mirrors
 * `backend/src/config/menus.ts`.
 *
 * This is not a permission and cannot be used as one. Hiding a tab is a
 * courtesy to the person holding the phone; what actually stops a staff account
 * reaching owner-only data is the 403 the server returns on those endpoints,
 * which it returns whatever this list says. Two independent layers:
 *
 *   menuAccess  → can they GET TO the screen?   (this)
 *   permissions → can they DO the thing on it?  (PERMISSION_KEYS above)
 */
export const STAFF_MENU_KEYS = [
  'DASHBOARD',
  'BILLING',
  'PRODUCTS',
  'CUSTOMERS',
  'STOCK',
  /** Reached from a customer's record, so it needs `CUSTOMERS` to be usable. */
  'KHATA',
] as const;

/** Never assignable. The staff form does not offer these, and the API refuses them. */
export const ADMIN_ONLY_MENU_KEYS = ['REPORTS', 'OUTSTANDING', 'STAFF'] as const;

export type StaffMenuKey = (typeof STAFF_MENU_KEYS)[number];
export type AdminMenuKey = (typeof ADMIN_ONLY_MENU_KEYS)[number];
export type MenuKey = StaffMenuKey | AdminMenuKey;

/** What `GET /me/menu` returns: the signed-in account's own effective screens. */
export interface MyMenu {
  role: Role;
  menu: MenuKey[];
}

/**
 * A staff account as the owner's management screens see it. There is no
 * password field of any kind — the server never sends one.
 */
export interface StaffAccount {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  preferredLang: ServerLanguage;
  permissions: Record<PermissionKey, boolean>;
  /** What the owner ticked. Empty for an owner — their menu comes from the role. */
  menuAccess: StaffMenuKey[];
  /** What this account will actually see once signed in. */
  effectiveMenu: MenuKey[];
  maxDiscountPercent: number;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStaffInput {
  name: string;
  username: string;
  password: string;
  role?: Role;
  phone?: string;
  email?: string;
  preferredLang?: ServerLanguage;
  maxDiscountPercent?: number;
  permissions?: Partial<Record<PermissionKey, boolean>>;
  /** Omit for the server's default (Dashboard, Billing, Customers). */
  menuAccess?: StaffMenuKey[];
}

/**
 * Everything an owner may change afterwards. The username is absent because it
 * is how the account signs in and how it reads in the audit trail; the password
 * is absent because that is `resetPassword`, which also ends their sessions.
 */
export interface UpdateStaffInput {
  name?: string;
  role?: Role;
  phone?: string | null;
  email?: string | null;
  preferredLang?: ServerLanguage;
  maxDiscountPercent?: number;
  permissions?: Partial<Record<PermissionKey, boolean>>;
  menuAccess?: StaffMenuKey[];
}

/** What the form is allowed to offer, straight from the server so the two cannot drift. */
export interface StaffOptions {
  assignableMenus: StaffMenuKey[];
  adminOnlyMenus: AdminMenuKey[];
  defaultMenus: StaffMenuKey[];
  permissions: PermissionKey[];
}

export interface StaffStateChangeResult {
  staff: StaffAccount;
  /** Non-zero means somebody was signed in and has just been thrown out. */
  revokedSessions: number;
}

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  preferredLang: ServerLanguage;
  permissions: Record<PermissionKey, boolean>;
  maxDiscountPercent: number;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken: string;
  accessExpiresIn: number;
  user: PublicUser;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  database: 'up' | 'down';
  uptimeSeconds: number;
  timestamp: string;
}

/** Every successful response is wrapped in `data`. */
export interface Envelope<T> {
  data: T;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'ACCOUNT_INACTIVE'
  | 'FORBIDDEN'
  | 'ACCOUNT_LOCKED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  /** A credit sale would take the customer past their credit limit. */
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'
  /** Client-side only — the request never reached the server. */
  | 'NETWORK_ERROR'
  | 'TIMEOUT';

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface Category {
  id: string;
  name: string;
  code: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type Unit = 'METER' | 'PIECE';

/**
 * `costPrice` mirrors the server's `serializeProduct()`: the key is entirely
 * absent from the JSON for a STAFF viewer, not merely `undefined` — so
 * `'costPrice' in product` is the correct presence check, not `product.costPrice != null`.
 */
export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string;
  subCategoryId: string | null;
  hsnCode: string | null;
  unit: Unit;
  retailRate: number;
  wholesaleRate: number;
  costPrice?: number;
  gstPercent: number;
  colour: string | null;
  width: string | null;
  gsm: number | null;
  imageUrl: string | null;
  openingStock: number;
  currentStock: number;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CustomerType = 'RETAIL' | 'WHOLESALE';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  addressLine: string | null;
  city: string | null;
  state: string;
  pincode: string | null;
  type: CustomerType;
  creditLimit: number;
  openingBalance: number;
  outstanding: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  /** Any spelling — the server canonicalises to +91XXXXXXXXXX. */
  phone: string;
  email?: string;
  gstin?: string;
  addressLine?: string;
  city?: string;
  /** Drives CGST+SGST vs IGST on every bill. Defaults to Gujarat server-side. */
  state?: string;
  pincode?: string;
  type?: CustomerType;
  /** 0 means "no limit set", not "no credit allowed". */
  creditLimit?: number;
  /** Posted as an OPENING khata entry, not written straight onto the balance. */
  openingBalance?: number;
  notes?: string;
}

export interface LastPriceResponse {
  rate: number;
  qty: number;
  unit: Unit;
  billNumber: string;
  billDate: string;
}

export type BillingMode = 'GST' | 'NON_GST';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'CARD' | 'CREDIT';
export type DiscountType = 'PERCENT' | 'FLAT';
export type TaxType = 'CGST_SGST' | 'IGST' | 'NONE';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type BillStatus = 'DRAFT' | 'FINAL' | 'CANCELLED';

export interface BillLineItemInput {
  productId: string;
  qty: number;
  /** Omit to default to the customer's rate (wholesale/retail); pass to override. */
  rate?: number;
  discountType?: DiscountType;
  discountValue?: number;
}

export interface CreateBillInput {
  billingMode: BillingMode;
  customerId?: string;
  walkInName?: string;
  walkInPhone?: string;
  paymentMode?: PaymentMode;
  paidAmount?: number;
  billDiscountType?: DiscountType;
  billDiscountValue?: number;
  notes?: string;
  lang?: 'en' | 'gu';
  /** ADMIN only — the server ignores it for a STAFF token. */
  overrideCreditLimit?: boolean;
  items: BillLineItemInput[];
}

export interface BillItem {
  id: string;
  productId: string;
  productName: string;
  hsnCode: string | null;
  colour: string | null;
  unit: Unit;
  qty: number;
  rate: number;
  discountType: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  taxableValue: number;
  gstPercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
  /** ADMIN-only. */
  costPriceSnapshot?: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  billingMode: BillingMode;
  fy: string;
  seq: number;
  customerId: string | null;
  walkInName: string | null;
  walkInPhone: string | null;
  billDate: string;
  customerNameSnapshot: string | null;
  customerGstin: string | null;
  placeOfSupplyState: string;
  taxType: TaxType;
  subTotal: number;
  lineDiscountTotal: number;
  billDiscountType: DiscountType | null;
  billDiscountValue: number;
  billDiscountAmount: number;
  effectiveDiscountPercent: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  grandTotal: number;
  /** ADMIN-only — never sent to STAFF. */
  costTotal?: number;
  paymentMode: PaymentMode;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: PaymentStatus;
  status: BillStatus;
  notes: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** 0 for a bill nobody has rewritten. Shown on the bill so an edit is never silent. */
  revisionCount: number;
  lastRevisedAt: string | null;
  items?: BillItem[];
  itemCount?: number;
  /**
   * Present only on the create response, and only when the sale carried a
   * walk-in phone number: says whether that number was recognised as an
   * existing customer or registered as a new one.
   */
  walkInCustomer?: { customerId: string; name: string; outcome: 'registered' | 'matched' };
}

/**
 * Revising an issued bill.
 *
 * The bill number, date, billing mode and customer are deliberately absent —
 * changing any of those is not a correction but a different document, so the
 * server refuses them. What the counter actually gets wrong (a quantity, a
 * rate, a line that should not be there, how it was paid) is here.
 *
 * `items` is the complete new line list, not a patch: the server replaces the
 * lines and posts the stock difference as fresh movements.
 */
export interface UpdateBillInput {
  /** Required by the server (min 3 chars) and stored on the revision. */
  reason: string;
  paymentMode?: PaymentMode;
  /** Omit to keep whatever has already been received against this bill. */
  paidAmount?: number;
  billDiscountType?: DiscountType;
  billDiscountValue?: number;
  notes?: string;
  /** ADMIN only — the server ignores it for a STAFF token. */
  overrideCreditLimit?: boolean;
  items: BillLineItemInput[];
}

/**
 * What `GET /bills` returns. Beyond the page of bills it carries totals for
 * the WHOLE filter — a footer that only added up the visible twenty would be
 * quietly wrong on a busy day — and the IST dates actually queried.
 */
export interface BillsPage {
  items: Bill[];
  pagination: Pagination;
  /** `FINAL` bills only: a cancelled bill is not a sale. */
  summary: { billCount: number; grandTotal: number; paidTotal: number; dueTotal: number };
  /** Null when no date filter was sent. */
  range: { from: string; to: string } | null;
}

/** One "before → after" line in a revision, computed by the server at write time. */
export interface BillChange {
  field: string;
  before: string;
  after: string;
}

export interface BillRevision {
  id: string;
  billId: string;
  billNumber: string;
  /** 1 for the first edit. */
  revision: number;
  reason: string;
  changes: BillChange[];
  /** Signed: how much the grand total moved. */
  amountDelta: number;
  changedById: string;
  changedByName: string;
  createdAt: string;
}

export interface SendBillResult {
  whatsappUrl: string;
  message: string;
}

// ── Stock ────────────────────────────────────────────────────

/**
 * Every kind of row in the movement ledger. `SALE` is written by billing from
 * inside the bill transaction, `OPENING` when a product is created — the stock
 * module itself only ever writes `STOCK_IN` and `ADJUSTMENT`.
 */
export type StockMovementType =
  | 'OPENING'
  | 'STOCK_IN'
  | 'SALE'
  | 'SALE_RETURN'
  | 'ADJUSTMENT'
  | 'BILL_CANCELLED';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: Unit;
  type: StockMovementType;
  /** Signed: positive added, negative removed. */
  qty: number;
  balanceAfter: number;
  reason: string | null;
  supplierRef: string | null;
  billId: string | null;
  billNumber: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  /** ADMIN-only — the landed rate on a STOCK_IN row is cost data. */
  rate?: number;
}

/** What a stock-in or an adjustment returns: the movement and the new balance. */
export interface StockEntryResult {
  movementId: string;
  productId: string;
  productName: string;
  unit: Unit;
  qty: number;
  balanceAfter: number;
  type: StockMovementType;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  imageUrl: string | null;
  categoryId: string;
  currentStock: number;
  reorderLevel: number;
  /** How far under the reorder level this sits. 0 when exactly at it. */
  shortBy: number;
  outOfStock: boolean;
}

export interface StockValuationByUnit {
  unit: Unit;
  productCount: number;
  totalQty: number;
  costValue: number;
  retailValue: number;
}

/** ADMIN-only response — the endpoint 403s for a STAFF token. */
export interface StockValuation {
  asOf: string;
  productCount: number;
  lowStockCount: number;
  costValue: number;
  retailValue: number;
  potentialMargin: number;
  byUnit: StockValuationByUnit[];
}

// ── Dashboard ────────────────────────────────────────────────
//
// `/dashboard` returns one of two payloads, chosen by the server from the
// token's role *before it queries anything*. They are modelled as a
// discriminated union on `role` so the UI switches on that rather than
// probing for the presence of a field — and so TypeScript refuses any attempt
// to read a revenue figure off the staff shape.

export interface SalesTrendPoint {
  /** IST calendar date, "YYYY-MM-DD". */
  date: string;
  total: number;
  billCount: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  unit: Unit;
  qty: number;
  value: number;
}

export interface TopCustomer {
  customerId: string;
  name: string;
  phone: string | null;
  billCount: number;
  value: number;
  outstanding: number;
}

export type TrendRange = '7D' | '30D';

export interface AdminDashboard {
  role: 'ADMIN';
  asOf: string;
  today: { sales: number; billCount: number; collected: number };
  month: { sales: number; billCount: number; gstPayable: number; label: string };
  financialYear: { label: string; sales: number };
  totalOutstanding: number;
  outstandingCustomerCount: number;
  lowStockCount: number;
  stockValueAtCost: number;
  salesTrend: SalesTrendPoint[];
  trendRange: TrendRange;
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
}

/** Their own bills and the low-stock alert. Nothing shop-wide exists on this type. */
export interface StaffDashboard {
  role: 'STAFF';
  asOf: string;
  myBillsToday: { count: number; total: number };
  lowStockCount: number;
}

export type DashboardResponse = AdminDashboard | StaffDashboard;

// ── Reports ──────────────────────────────────────────────────
// Every type below except LowStock mirrors an ADMIN-only endpoint.

export interface ReportRange {
  from: string;
  to: string;
}

export interface SalesTotals {
  billCount: number;
  grandTotal: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstCollected: number;
  discountTotal: number;
  paidAmount: number;
  dueAmount: number;
}

export interface SalesReportDay extends SalesTrendPoint {
  gstTotal: number;
  estimateTotal: number;
}

export interface SalesReportBill {
  id: string;
  billNumber: string;
  billDate: string;
  billingMode: BillingMode;
  customerName: string | null;
  staffName: string;
  itemCount: number;
  taxableValue: number;
  gstAmount: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
}

export interface SalesReport {
  range: ReportRange;
  totals: SalesTotals;
  byMode: {
    mode: BillingMode;
    billCount: number;
    grandTotal: number;
    taxableValue: number;
    gstCollected: number;
  }[];
  byDay: SalesReportDay[];
  bills: SalesReportBill[];
  /** The per-bill list was capped; the summaries still cover the whole period. */
  truncated: boolean;
}

export interface GstRateRow {
  gstPercent: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

export interface GstSummaryReport {
  range: ReportRange;
  byRate: GstRateRow[];
  totals: Omit<GstRateRow, 'gstPercent'>;
  estimateValueExcluded: number;
  gstBillCount: number;
}

export interface OutstandingCustomer {
  customerId: string;
  name: string;
  phone: string;
  type: string;
  creditLimit: number;
  outstanding: number;
  overLimitBy: number;
  lastBillDate: string | null;
  unpaidBillCount: number;
}

export interface OutstandingReport {
  asOf: string;
  totalOutstanding: number;
  customerCount: number;
  overLimitCount: number;
  customers: OutstandingCustomer[];
}

export interface AgeingCustomer {
  customerId: string;
  name: string;
  phone: string;
  bucket0to30: number;
  bucket31to60: number;
  bucket60Plus: number;
  billDue: number;
  outstanding: number;
  oldestBillDays: number;
}

export interface AgeingReport {
  asOf: string;
  buckets: { bucket0to30: number; bucket31to60: number; bucket60Plus: number; total: number };
  totalOutstanding: number;
  /** Opening balances not tied to a bill, so they cannot be aged. */
  unbucketed: number;
  customers: AgeingCustomer[];
}

export interface ProductSalesRow {
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  unit: Unit;
  qty: number;
  billCount: number;
  value: number;
  discountGiven: number;
  averageRate: number;
}

export interface ProductSalesReport {
  range: ReportRange;
  rows: ProductSalesRow[];
  totals: { productCount: number; value: number; discountGiven: number };
}

export interface CategorySalesRow {
  categoryId: string;
  name: string;
  code: string;
  productCount: number;
  qty: number;
  value: number;
  sharePercent: number;
}

export interface CategorySalesReport {
  range: ReportRange;
  rows: CategorySalesRow[];
  totalValue: number;
}

export interface CollectionRow {
  mode: PaymentMode;
  count: number;
  amount: number;
}

export interface PaymentCollectionReport {
  range: ReportRange;
  billCollection: CollectionRow[];
  billCollectionTotal: number;
  /** Empty until the payments module lands — see the note on the screen. */
  receipts: CollectionRow[];
  receiptsTotal: number;
  creditGiven: number;
  grandTotal: number;
}

export interface ProfitRow {
  productId: string;
  name: string;
  sku: string;
  unit: Unit;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

/** ADMIN-only. A STAFF token gets 403 — this shape never reaches one. */
export interface ProfitMarginReport {
  range: ReportRange;
  overall: {
    billCount: number;
    revenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
    discountGiven: number;
  };
  rows: ProfitRow[];
  lossMakers: ProfitRow[];
}

// ── Khata (credit ledger) ────────────────────────────────────
//
// `/ledger/outstanding` and `/ledger/ageing` return the same shapes as the
// reports of the same name — they are literally the same service call behind
// two URLs — so `OutstandingReport` and `AgeingReport` above are reused rather
// than duplicated here.

export type LedgerEntryType = 'OPENING' | 'CREDIT_SALE' | 'PAYMENT' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

/** DEBIT raised what the customer owes; CREDIT lowered it. */
export type LedgerDirection = 'DEBIT' | 'CREDIT';

/** Money actually settled at the counter — narrower than `PaymentMode`. */
export type ReceiptMode = 'CASH' | 'UPI' | 'BANK';

export type NoteType = 'CREDIT' | 'DEBIT';

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  direction: LedgerDirection;
  /** Always positive — the direction says which way it moved the balance. */
  amount: number;
  debit: number;
  credit: number;
  balanceAfter: number;
  note: string | null;
  paymentMode: PaymentMode | null;
  billId: string | null;
  billNumber: string | null;
  paymentId: string | null;
  receiptNumber: string | null;
  noteId: string | null;
  noteNumber: string | null;
  entryDate: string;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
}

export interface KhataCustomer {
  id: string;
  name: string;
  phone: string;
  type: CustomerType;
  creditLimit: number;
  /** Negative means the shop is holding the customer's money. */
  outstanding: number;
  /** Null when no credit limit is set on the customer. */
  availableCredit: number | null;
  isActive: boolean;
}

export interface KhataStatement {
  customer: KhataCustomer;
  openingBalance: number;
  /** Across the whole khata, not just the page in `entries`. */
  totals: { debit: number; credit: number; entryCount: number };
  entries: LedgerEntry[];
  pagination: Pagination;
  sort: 'asc' | 'desc';
}

export interface RecordPaymentInput {
  customerId: string;
  amount: number;
  paymentMode: ReceiptMode;
  note?: string;
  /** Settle this bill first; the rest flows to older unpaid bills. */
  refBillId?: string;
}

export interface PaymentAllocation {
  billId: string;
  billNumber: string;
  billDate: string;
  amount: number;
  dueAfter: number;
}

export interface RecordPaymentResult {
  paymentId: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMode: PaymentMode;
  balanceAfter: number;
  previousBalance: number;
  allocations: PaymentAllocation[];
  /** Received but not against any open bill — an advance, or an opening balance. */
  unallocated: number;
  entry: LedgerEntry;
}

export interface RecordNoteInput {
  customerId: string;
  type: NoteType;
  amount: number;
  reason: string;
  refBillId?: string;
}

export interface RecordNoteResult {
  noteId: string;
  noteNumber: string;
  type: NoteType;
  customerId: string;
  customerName: string;
  amount: number;
  reason: string;
  balanceAfter: number;
  previousBalance: number;
  billDueAfter: number | null;
  entry: LedgerEntry;
}

export interface PaymentReminder {
  customerId: string;
  customerName: string;
  phone: string;
  outstanding: number;
  message: string;
  /** Opened with `Linking.openURL`. */
  whatsappUrl: string;
}
