import { request } from './client';
import type { CreateCustomerInput, Customer, CustomerType, Paginated } from './types';

export interface ListCustomersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: CustomerType;
  isActive?: boolean;
}

function toQuery<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

export const customersApi = {
  list: (params: ListCustomersParams = {}) =>
    request<Paginated<Customer>>({ method: 'GET', url: '/customers', params: toQuery(params) }),

  get: (id: string) => request<Customer>({ method: 'GET', url: `/customers/${id}` }),

  /**
   * `null` means the number is free. Used by the new-customer form to offer
   * the existing record *before* someone fills the rest of the form in, rather
   * than refusing them at submit.
   */
  byPhone: (phone: string) =>
    request<Customer | null>({ method: 'GET', url: '/customers/by-phone', params: { phone } }),

  /** 409 CONFLICT when the number is already on a live customer. */
  create: (input: CreateCustomerInput) =>
    request<Customer & { created: boolean }>({ method: 'POST', url: '/customers', data: input }),
};
