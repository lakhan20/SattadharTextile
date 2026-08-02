import axios from 'axios';
import { request, toApiError } from './client';
import { API_PREFIX, stripTrailingSlash } from './config';
import type { Envelope, HealthResponse, LoginResponse, MyMenu, PublicUser } from './types';

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>({
      method: 'POST',
      url: '/auth/login',
      data: { username: username.trim().toLowerCase(), password },
    }),

  me: () => request<PublicUser>({ method: 'GET', url: '/auth/me' }),

  /**
   * The screens this account may see, used to build the navigation. An owner
   * always gets the full set; a staff account gets what the owner assigned,
   * intersected server-side with what staff may ever see.
   */
  menu: () => request<MyMenu>({ method: 'GET', url: '/me/menu' }),

  logout: (allDevices = false) =>
    request<{ signedOut: boolean; revokedSessions: number }>({
      method: 'POST',
      url: '/auth/logout',
      data: { allDevices },
    }),

  /**
   * ADMIN only. The generic form of the reset. The staff screens call
   * `staffApi.resetPassword` instead, which reaches the same service through
   * `/admin/staff/:id/reset-password` and returns the updated account with it.
   */
  adminResetPassword: (userId: string, newPassword: string) =>
    request<{ passwordReset: boolean; userId: string; username: string; revokedSessions: number }>({
      method: 'POST',
      url: '/auth/admin/reset-password',
      data: { userId, newPassword },
    }),
};

/**
 * Probes an address the user has typed but not saved yet, so it deliberately
 * bypasses the shared client and its stored base URL.
 */
export async function pingServer(baseUrl: string, timeoutMs = 8000): Promise<HealthResponse> {
  try {
    const response = await axios.get<Envelope<HealthResponse>>(
      `${stripTrailingSlash(baseUrl)}${API_PREFIX}/health`,
      { timeout: timeoutMs },
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}
