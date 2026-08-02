import { request } from './client';
import type {
  CreateStaffInput,
  Paginated,
  Role,
  StaffAccount,
  StaffOptions,
  StaffStateChangeResult,
  UpdateStaffInput,
} from './types';

export interface ListStaffParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: Role;
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

/**
 * Staff accounts. Every call here is ADMIN-only and the server returns 403 for
 * a staff token — the app also keeps these screens out of a staff navigator
 * entirely, but that is defence in depth, not the boundary.
 */
export const staffApi = {
  list: (params: ListStaffParams = {}) =>
    request<Paginated<StaffAccount>>({ method: 'GET', url: '/admin/staff', params: toQuery(params) }),

  get: (id: string) => request<StaffAccount>({ method: 'GET', url: `/admin/staff/${id}` }),

  /** Which menus may be assigned, and which are owner-only. Served, never hardcoded. */
  options: () => request<StaffOptions>({ method: 'GET', url: '/admin/staff/options' }),

  /** 409 CONFLICT when the username is taken. */
  create: (input: CreateStaffInput) =>
    request<StaffAccount>({ method: 'POST', url: '/admin/staff', data: input }),

  /** 400 when `menuAccess` names an owner-only screen; 409 on the last-owner rules. */
  update: (id: string, input: UpdateStaffInput) =>
    request<StaffAccount>({ method: 'PATCH', url: `/admin/staff/${id}`, data: input }),

  /** Ends their live sessions: the next request they make returns 401. */
  deactivate: (id: string) =>
    request<StaffStateChangeResult>({ method: 'POST', url: `/admin/staff/${id}/deactivate` }),

  activate: (id: string) =>
    request<{ staff: StaffAccount }>({ method: 'POST', url: `/admin/staff/${id}/activate` }),

  /** Also ends their sessions — they are signed out wherever they are. */
  resetPassword: (id: string, newPassword: string) =>
    request<StaffStateChangeResult>({
      method: 'POST',
      url: `/admin/staff/${id}/reset-password`,
      data: { newPassword },
    }),

  /** Clears a 5-failure lockout without changing the password. */
  unlock: (id: string) =>
    request<{ staff: StaffAccount }>({ method: 'POST', url: `/admin/staff/${id}/unlock` }),
};
