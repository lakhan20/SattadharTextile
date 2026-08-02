import { request } from './client';
import type { DashboardResponse, TrendRange } from './types';

/**
 * One URL for both roles. The server decides which payload to build from the
 * token, so this client sends the same request either way and the caller
 * narrows on `role`.
 *
 * `range` only affects the ADMIN trend chart; the server ignores it for STAFF.
 */
export const dashboardApi = {
  get: (range: TrendRange = '7D') =>
    request<DashboardResponse>({ method: 'GET', url: '/dashboard', params: { range } }),
};
