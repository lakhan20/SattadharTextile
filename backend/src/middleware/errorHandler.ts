import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError, ErrorCode, type ErrorCodeValue, type ErrorDetail } from '../utils/errors';

interface Normalised {
  status: number;
  code: ErrorCodeValue;
  message: string;
  details?: ErrorDetail[];
  logContext?: Record<string, unknown>;
}

function normalise(err: unknown): Normalised {
  if (err instanceof AppError) {
    const out: Normalised = { status: err.status, code: err.code, message: err.message };
    if (err.details) out.details = err.details;
    if (err.logContext) out.logContext = err.logContext;
    return out;
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Some of the details are not right. Check the highlighted fields.',
      details: err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.['target']) ? (err.meta['target'] as string[]).join(', ') : 'value';
      return { status: 409, code: ErrorCode.CONFLICT, message: `That ${target} is already in use.` };
    }
    if (err.code === 'P2025') {
      return { status: 404, code: ErrorCode.NOT_FOUND, message: 'That record no longer exists.' };
    }
    if (err.code === 'P2003') {
      return {
        status: 409,
        code: ErrorCode.CONFLICT,
        message: 'This is still linked to other records, so it cannot be changed.',
      };
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, code: ErrorCode.INTERNAL_ERROR, message: 'The database is unreachable right now.' };
  }

  // express.json() body-parser failures
  if (err instanceof SyntaxError && 'body' in err) {
    return { status: 400, code: ErrorCode.VALIDATION_ERROR, message: 'The request body is not valid JSON.' };
  }
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    return { status: 413, code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'That upload is too large.' };
  }

  return { status: 500, code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong on our side.' };
}

/** Terminal error handler. Must be registered last. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, code, message, details, logContext } = normalise(err);

  const logPayload = {
    err,
    status,
    code,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    ...logContext,
  };
  if (status >= 500) logger.error(logPayload, 'Request failed');
  else logger.warn(logPayload, 'Request rejected');

  if (res.headersSent) return;

  // Error responses bypass the RBAC sentinel — a 401 must stay a 401 and not
  // be rewritten into 403 just because no access policy ran.
  res.locals.rbacBypass = true;

  // Never leak an internal message or stack in production.
  const safeMessage = status >= 500 && env.isProduction ? 'Something went wrong on our side.' : message;

  res.status(status).json({
    error: {
      code,
      message: safeMessage,
      ...(details ? { details } : {}),
      ...(!env.isProduction && status >= 500 && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
};

/** Anything that fell through the routers. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, ErrorCode.NOT_FOUND, `No route for ${req.method} ${req.originalUrl}.`));
};
