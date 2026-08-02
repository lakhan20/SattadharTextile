import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import type { ApiErrorCode } from '../api/types';

/**
 * The server's English prose is replaced by a translated string per code.
 *
 * `body` is a second line, and is only worth adding where it tells someone
 * what to actually *do*. Every code the API can emit is listed: an unmapped
 * one falls back to "Something did not work", which is true but useless — as
 * a missing `NOT_FOUND` mapping proved, turning "this server is running an
 * older build" into a shrug.
 */
const COPY_BY_CODE: Partial<Record<ApiErrorCode, { title: string; body?: string }>> = {
  INVALID_CREDENTIALS: { title: 'errors.invalidCredentials' },
  ACCOUNT_LOCKED: { title: 'errors.accountLocked' },
  ACCOUNT_INACTIVE: { title: 'errors.accountInactive' },
  RATE_LIMITED: { title: 'errors.rateLimited' },
  NETWORK_ERROR: { title: 'errors.network', body: 'errors.networkBody' },
  TIMEOUT: { title: 'errors.timeout', body: 'errors.timeoutBody' },
  INTERNAL_ERROR: { title: 'errors.server' },
  TOKEN_REVOKED: { title: 'errors.sessionEnded' },
  TOKEN_EXPIRED: { title: 'errors.sessionEnded' },
  UNAUTHENTICATED: { title: 'errors.sessionEnded' },
  TOKEN_INVALID: { title: 'errors.sessionEnded' },
  VALIDATION_ERROR: { title: 'errors.checkFields' },
  PAYLOAD_TOO_LARGE: { title: 'errors.imageTooLarge' },

  // The server refused on role or permission. Staff meet this if they ever
  // reach an owner-only screen — the message says whose it is, not "error".
  FORBIDDEN: { title: 'errors.forbidden', body: 'errors.forbiddenBody' },

  // On a report or dashboard call this almost always means the shop server is
  // running a build older than the app, so the route does not exist yet.
  NOT_FOUND: { title: 'errors.notFound', body: 'errors.notFoundBody' },

  CONFLICT: { title: 'errors.conflict', body: 'errors.conflictBody' },

  // The server's message names the three figures the shopkeeper needs — what
  // is already owed, what the sale would make it, and the limit — so this one
  // deliberately keeps the server's prose instead of replacing it. See
  // `useApiError`'s `serverMessage` branch below.
  CREDIT_LIMIT_EXCEEDED: { title: 'errors.creditLimit', body: 'errors.creditLimitBody' },
};

/**
 * Codes where the server's own sentence carries figures the app cannot
 * reconstruct, so it is shown verbatim rather than replaced by a translated
 * generic. Everything else switches on the code, as usual.
 */
const KEEP_SERVER_MESSAGE = new Set<ApiErrorCode>(['CREDIT_LIMIT_EXCEEDED']);

export interface ReadableError {
  title: string;
  /** Second line, only where it helps the user actually fix the problem. */
  body?: string;
  code: ApiErrorCode;
  isOffline: boolean;
}

export function useApiError() {
  const { t } = useTranslation();

  return useCallback(
    (error: unknown): ReadableError => {
      const apiError = error instanceof ApiError ? error : null;
      const code: ApiErrorCode = apiError?.code ?? 'INTERNAL_ERROR';
      const copy = COPY_BY_CODE[code];

      if (apiError && KEEP_SERVER_MESSAGE.has(code) && apiError.message) {
        return {
          code,
          isOffline: false,
          title: copy ? t(copy.title) : t('errors.unknown'),
          body: apiError.message,
        };
      }

      return {
        code,
        isOffline: apiError?.isOffline ?? false,
        title: copy ? t(copy.title) : t('errors.unknown'),
        body: copy?.body ? t(copy.body) : undefined,
      };
    },
    [t],
  );
}
