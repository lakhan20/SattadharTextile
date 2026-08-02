/**
 * Every error the API emits uses one shape:
 *
 *   { "error": { "code": "SCREAMING_SNAKE", "message": "human readable", "details"?: [...] } }
 *
 * `details` appears only on validation failures. Clients switch on `code`,
 * never on `message` (messages get translated / reworded).
 */

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCodeValue;
  readonly details?: ErrorDetail[];
  /** Extra context for the server log only — never serialised to the client. */
  readonly logContext?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCodeValue,
    message: string,
    options?: { details?: ErrorDetail[]; logContext?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (options?.details) this.details = options.details;
    if (options?.logContext) this.logContext = options.logContext;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new AppError(400, ErrorCode.VALIDATION_ERROR, message, details ? { details } : undefined);

export const unauthenticated = (
  message = 'Sign in to continue.',
  code: ErrorCodeValue = ErrorCode.UNAUTHENTICATED,
) => new AppError(401, code, message);

export const forbidden = (message = 'You do not have access to this.', logContext?: Record<string, unknown>) =>
  new AppError(403, ErrorCode.FORBIDDEN, message, logContext ? { logContext } : undefined);

export const notFound = (message = 'Not found.') => new AppError(404, ErrorCode.NOT_FOUND, message);

export const conflict = (message: string) => new AppError(409, ErrorCode.CONFLICT, message);

export const internal = (message = 'Something went wrong on our side.') =>
  new AppError(500, ErrorCode.INTERNAL_ERROR, message);
