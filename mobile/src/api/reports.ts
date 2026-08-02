import { request } from './client';
import type {
  AgeingReport,
  CategorySalesReport,
  GstSummaryReport,
  LowStockItem,
  OutstandingReport,
  Paginated,
  PaymentCollectionReport,
  ProductSalesReport,
  ProfitMarginReport,
  SalesReport,
  StockValuation,
} from './types';

/**
 * Every call here except `lowStock` hits an ADMIN-only endpoint and returns
 * 403 for a STAFF token. The app hides the Reports area from staff entirely,
 * but that is a courtesy — the server is the gate, and these functions would
 * fail closed even if a staff session somehow reached them.
 */

export type ReportPath =
  | 'sales'
  | 'gst-summary'
  | 'stock-valuation'
  | 'low-stock'
  | 'outstanding'
  | 'ageing'
  | 'product-sales'
  | 'category-sales'
  | 'payment-collection'
  | 'profit-margin';

export type SalesMode = 'ALL' | 'GST' | 'NON_GST';

/** `from`/`to` are IST calendar dates ("YYYY-MM-DD"); `to` is inclusive. */
export interface DateRangeParams {
  from?: string;
  to?: string;
}

export interface SalesReportParams extends DateRangeParams {
  mode?: SalesMode;
  staffId?: string;
}

/** Drops undefined keys so an unset filter never becomes the string "undefined". */
export function toQuery(params: Record<string, string | number | undefined>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    query[key] = String(value);
  }
  return query;
}

const get = <T>(path: ReportPath, params: Record<string, string | number | undefined> = {}) =>
  request<T>({ method: 'GET', url: `/reports/${path}`, params: toQuery(params) });

export const reportsApi = {
  sales: (params: SalesReportParams = {}) => get<SalesReport>('sales', { ...params }),

  gstSummary: (params: DateRangeParams = {}) => get<GstSummaryReport>('gst-summary', { ...params }),

  stockValuation: () => get<StockValuation>('stock-valuation'),

  /** The one report open to STAFF. Carries no cost data for either role. */
  lowStock: (params: { search?: string; page?: number; pageSize?: number } = {}) =>
    get<Paginated<LowStockItem>>('low-stock', { ...params }),

  outstanding: () => get<OutstandingReport>('outstanding'),

  ageing: () => get<AgeingReport>('ageing'),

  productSales: (params: DateRangeParams = {}) => get<ProductSalesReport>('product-sales', { ...params }),

  categorySales: (params: DateRangeParams = {}) => get<CategorySalesReport>('category-sales', { ...params }),

  paymentCollection: (params: DateRangeParams = {}) =>
    get<PaymentCollectionReport>('payment-collection', { ...params }),

  profitMargin: (params: DateRangeParams = {}) => get<ProfitMarginReport>('profit-margin', { ...params }),
};
