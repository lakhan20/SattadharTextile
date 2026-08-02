import { request } from './client';
import type { LowStockItem, Paginated, StockEntryResult, StockMovement, StockValuation } from './types';

export interface StockInInput {
  productId: string;
  qty: number;
  reason: string;
  /** Landed/purchase rate. Ignored by the server for a non-ADMIN caller. */
  rate?: number;
  supplierRef?: string;
}

export interface StockAdjustInput {
  productId: string;
  /** Signed — negative for damage/wastage, positive for a correction upwards. */
  qty: number;
  reason: string;
}

export interface ListMovementsParams {
  productId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface LowStockParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

function toQuery<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

export const stockApi = {
  in: (input: StockInInput) => request<StockEntryResult>({ method: 'POST', url: '/stock/in', data: input }),

  adjust: (input: StockAdjustInput) =>
    request<StockEntryResult>({ method: 'POST', url: '/stock/adjust', data: input }),

  movements: (params: ListMovementsParams = {}) =>
    request<Paginated<StockMovement>>({ method: 'GET', url: '/stock/movements', params: toQuery(params) }),

  low: (params: LowStockParams = {}) =>
    request<Paginated<LowStockItem>>({ method: 'GET', url: '/stock/low', params: toQuery(params) }),

  /** ADMIN only — a STAFF token gets a 403 from the server, by design. */
  valuation: () => request<StockValuation>({ method: 'GET', url: '/stock/valuation' }),
};
