import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { badRequest, type ErrorDetail } from '../utils/errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

const toDetails = (err: ZodError): ErrorDetail[] =>
  err.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

/**
 * Validates and coerces the request, then stashes the parsed values on
 * `req.valid`. Controllers read `req.valid.body` — never the raw `req.body` —
 * so an unvalidated field can never reach a service by accident.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const valid: NonNullable<Request['valid']> = {};
    try {
      if (schemas.body) valid.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) valid.query = schemas.query.parse(req.query ?? {});
      if (schemas.params) valid.params = schemas.params.parse(req.params ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        next(badRequest('Some of the details are not right. Check the highlighted fields.', toDetails(err)));
        return;
      }
      next(err);
      return;
    }
    req.valid = valid;
    next();
  };
}

/** Typed accessors so controllers stay free of casts. */
export const body = <T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> => req.valid?.body as z.infer<T>;
export const query = <T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> => req.valid?.query as z.infer<T>;
export const params = <T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> => req.valid?.params as z.infer<T>;
