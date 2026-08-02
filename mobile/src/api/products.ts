import { request } from './client';
import type { LastPriceResponse, Paginated, Product, Unit } from './types';

export interface ListProductsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  subCategoryId?: string;
  isActive?: boolean;
}

export interface ProductInput {
  name: string;
  sku: string;
  categoryId: string;
  subCategoryId?: string | null;
  hsnCode?: string;
  unit: Unit;
  retailRate: number;
  wholesaleRate: number;
  /** Ignored by the server for a non-ADMIN caller — safe to omit for STAFF. */
  costPrice?: number;
  gstPercent: number;
  colour?: string;
  width?: string;
  gsm?: number;
  imageUrl?: string;
  openingStock?: number;
  reorderLevel?: number;
  isActive?: boolean;
}

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

function toQuery<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

export const productsApi = {
  list: (params: ListProductsParams = {}) =>
    request<Paginated<Product>>({ method: 'GET', url: '/products', params: toQuery(params) }),

  get: (id: string) => request<Product>({ method: 'GET', url: `/products/${id}` }),

  lastPrice: (id: string, customerId: string) =>
    request<LastPriceResponse | null>({ method: 'GET', url: `/products/${id}/last-price`, params: { customerId } }),

  create: (input: ProductInput) =>
    request<Product>({ method: 'POST', url: '/products', data: input }),

  update: (id: string, input: Partial<ProductInput>) =>
    request<Product>({ method: 'PATCH', url: `/products/${id}`, data: input }),

  remove: (id: string) => request<{ deleted: boolean }>({ method: 'DELETE', url: `/products/${id}` }),

  /** Multipart upload — field name `image`. Returns a relative path to embed as `imageUrl`. */
  uploadImage: (file: PickedImage) => {
    const form = new FormData();
    // React Native's FormData accepts this file-shaped object; it is not the
    // web File/Blob type, hence the cast.
    form.append('image', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    return request<{ imageUrl: string }>({
      method: 'POST',
      url: '/products/upload-image',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
