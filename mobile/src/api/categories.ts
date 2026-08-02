import { request } from './client';
import type { Category, Paginated } from './types';

export interface ListCategoriesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}

export interface CategoryInput {
  name: string;
  code: string;
  description?: string;
}

function toQuery<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

export const categoriesApi = {
  list: (params: ListCategoriesParams = {}) =>
    request<Paginated<Category>>({ method: 'GET', url: '/categories', params: toQuery(params) }),

  get: (id: string) => request<Category>({ method: 'GET', url: `/categories/${id}` }),

  create: (input: CategoryInput) =>
    request<Category>({ method: 'POST', url: '/categories', data: input }),

  update: (id: string, input: Partial<CategoryInput> & { isActive?: boolean }) =>
    request<Category>({ method: 'PATCH', url: `/categories/${id}`, data: input }),

  remove: (id: string) => request<{ deleted: boolean }>({ method: 'DELETE', url: `/categories/${id}` }),
};
