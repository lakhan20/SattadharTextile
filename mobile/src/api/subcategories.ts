import { request } from './client';
import type { Paginated, SubCategory } from './types';

export interface ListSubCategoriesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  isActive?: boolean;
}

export interface SubCategoryInput {
  name: string;
  categoryId: string;
}

function toQuery<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

export const subCategoriesApi = {
  list: (params: ListSubCategoriesParams = {}) =>
    request<Paginated<SubCategory>>({ method: 'GET', url: '/sub-categories', params: toQuery(params) }),

  get: (id: string) => request<SubCategory>({ method: 'GET', url: `/sub-categories/${id}` }),

  create: (input: SubCategoryInput) =>
    request<SubCategory>({ method: 'POST', url: '/sub-categories', data: input }),

  update: (id: string, input: Partial<SubCategoryInput> & { isActive?: boolean }) =>
    request<SubCategory>({ method: 'PATCH', url: `/sub-categories/${id}`, data: input }),

  remove: (id: string) => request<{ deleted: boolean }>({ method: 'DELETE', url: `/sub-categories/${id}` }),
};
