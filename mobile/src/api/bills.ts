import { request } from './client';
import type {
  Bill,
  BillingMode,
  BillRevision,
  BillsPage,
  CreateBillInput,
  Paginated,
  SendBillResult,
  UpdateBillInput,
} from './types';

export interface ListBillsParams {
  page?: number;
  pageSize?: number;
  customerId?: string;
  billingMode?: BillingMode;
  /** IST calendar date, "YYYY-MM-DD". */
  dateFrom?: string;
  /** IST calendar date, "YYYY-MM-DD" — INCLUSIVE, the way a shopkeeper means it. */
  dateTo?: string;
}

export interface ListRevisionsParams {
  page?: number;
  pageSize?: number;
  /** Owner-only, on the shop-wide log: narrow to one staff account. */
  changedById?: string;
  from?: string;
  to?: string;
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
    request<BillsPage>({ method: 'GET', url: '/bills', params: toQuery(params) }),

  get: (id: string) => request<Bill>({ method: 'GET', url: `/bills/${id}` }),

  create: (input: CreateBillInput) => request<Bill>({ method: 'POST', url: '/bills', data: input }),

  /** Needs the `bill.edit` permission; staff may only revise their own bills. */
  update: (id: string, input: UpdateBillInput) =>
    request<Bill>({ method: 'PATCH', url: `/bills/${id}`, data: input }),

  /** One bill's history — open to anyone who may already see the bill. */
  revisions: (id: string, params: ListRevisionsParams = {}) =>
    request<Paginated<BillRevision>>({
      method: 'GET',
      url: `/bills/${id}/revisions`,
      params: toQuery(params),
    }),

  /**
   * The shop-wide edit log. ADMIN only — the server returns 403 for a staff
   * token, which is why the screen behind this is registered in the admin
   * branch of the navigator alone.
   */
  editLog: (params: ListRevisionsParams = {}) =>
    request<Paginated<BillRevision>>({ method: 'GET', url: '/bills/revisions', params: toQuery(params) }),

  send: (id: string, input: { phone?: string; lang?: 'en' | 'gu' } = {}) =>
    request<SendBillResult>({ method: 'POST', url: `/bills/${id}/send`, data: input }),
};
