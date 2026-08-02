import { request } from './client';
import type { Bill, BillingMode, CreateBillInput, Paginated, SendBillResult } from './types';

export interface ListBillsParams {
  page?: number;
  pageSize?: number;
  customerId?: string;
  billingMode?: BillingMode;
  dateFrom?: string;
  dateTo?: string;
}

function toQuery<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

export const billsApi = {
  list: (params: ListBillsParams = {}) =>
    request<Paginated<Bill>>({ method: 'GET', url: '/bills', params: toQuery(params) }),

  get: (id: string) => request<Bill>({ method: 'GET', url: `/bills/${id}` }),

  create: (input: CreateBillInput) => request<Bill>({ method: 'POST', url: '/bills', data: input }),

  send: (id: string, input: { phone?: string; lang?: 'en' | 'gu' } = {}) =>
    request<SendBillResult>({ method: 'POST', url: `/bills/${id}/send`, data: input }),
};
