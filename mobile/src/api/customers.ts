import { request } from './client';
import type { Customer, CustomerType, Paginated } from './types';

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
};
