import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_PREFIX } from './config';
import { currentBaseUrl } from '../store/settingsStore';
import { tokenStorage } from '../store/tokenStorage';
import type { ApiErrorBody, ApiErrorCode, ApiErrorDetail, Envelope, RefreshResponse } from './types';

/** A server or transport failure, normalised to the one shape the UI reads. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: ApiErrorDetail[];

  constructor(code: ApiErrorCode, message: string, status = 0, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the request never reached the shop server. */
  get isOffline(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  fieldError(field: string): string | undefined {
    return this.details.find((d) => d.field === field)?.message;
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new ApiError('TIMEOUT', 'The server took too long to answer.');
    }
    if (!axiosError.response) {
      return new ApiError('NETWORK_ERROR', 'Cannot reach the server.');
    }

    const body = axiosError.response.data;
    if (body?.error?.code) {
      return new ApiError(body.error.code, body.error.message, axiosError.response.status, body.error.details ?? []);
    }
    return new ApiError('INTERNAL_ERROR', 'Something went wrong on the server.', axiosError.response.status);
  }

  return new ApiError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Something did not work.');
}

/**
 * Called when the session cannot be recovered — revoked, deactivated, or the
 * refresh token itself failed. Registered by the auth store so this module
 * does not have to import it (which would be a cycle).
 */
type SessionEndedHandler = (reason: ApiErrorCode) => void;
let onSessionEnded: SessionEndedHandler = () => undefined;
export const setSessionEndedHandler = (handler: SessionEndedHandler): void => {
  onSessionEnded = handler;
};

export const api: AxiosInstance = axios.create({
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// The address is editable in-app, so resolve it per request rather than
// freezing it into the instance at creation.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = `${currentBaseUrl()}${API_PREFIX}`;
  const token = tokenStorage.getAccess();
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/** Concurrent 401s share one refresh call instead of firing several. */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) throw new ApiError('TOKEN_REVOKED', 'Your session ended.');

  // A bare client: the refresh call must never re-enter these interceptors.
  const response = await axios.post<Envelope<RefreshResponse>>(
    `${currentBaseUrl()}${API_PREFIX}/auth/refresh`,
    { refreshToken },
    { timeout: 15_000, headers: { 'Content-Type': 'application/json' } },
  );

  const { accessToken } = response.data.data;
  await tokenStorage.saveAccess(accessToken);
  return accessToken;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const apiError = toApiError(error);
    const config = axios.isAxiosError(error) ? (error.config as RetriableConfig | undefined) : undefined;

    // The session is gone for good — no point retrying.
    if (apiError.code === 'TOKEN_REVOKED' || apiError.code === 'ACCOUNT_INACTIVE') {
      onSessionEnded(apiError.code);
      throw apiError;
    }

    const canRetry =
      apiError.code === 'TOKEN_EXPIRED' &&
      config !== undefined &&
      !config._retried &&
      !config.url?.includes('/auth/refresh') &&
      !config.url?.includes('/auth/login');

    if (!canRetry) throw apiError;

    config._retried = true;
    try {
      refreshInFlight = refreshInFlight ?? refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const accessToken = await refreshInFlight;
      config.headers.set('Authorization', `Bearer ${accessToken}`);
      return await api.request(config);
    } catch (refreshError) {
      const failure = toApiError(refreshError);
      onSessionEnded(failure.code);
      throw failure;
    }
  },
);

/** Unwraps the `{ data: … }` envelope and rethrows failures as ApiError. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.request<Envelope<T>>(config);
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export { toApiError };
