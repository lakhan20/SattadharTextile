import axios from 'axios';
import { request, toApiError } from './client';
import { API_PREFIX, stripTrailingSlash } from './config';
import type { Envelope, HealthResponse, LoginResponse, PublicUser } from './types';

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>({
      method: 'POST',
      url: '/auth/login',
      data: { username: username.trim().toLowerCase(), password },
    }),

  me: () => request<PublicUser>({ method: 'GET', url: '/auth/me' }),

  logout: (allDevices = false) =>
    request<{ signedOut: boolean; revokedSessions: number }>({
      method: 'POST',
      url: '/auth/logout',
      data: { allDevices },
    }),

  /** ADMIN only. Wired to the staff-accounts screen when that module lands. */
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
