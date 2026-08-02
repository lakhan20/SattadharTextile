import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role } from '@prisma/client';
import { logger } from '../config/logger';
import { hasPermission, type Permission } from '../config/permissions';
import { ErrorCode, forbidden, unauthenticated } from '../utils/errors';

/**
 * ── Default-deny ─────────────────────────────────────────────────────────
 *
 * Every route under the API router must declare an access policy by running
 * exactly one of: publicRoute(), authenticated(), requireRole(), or
 * requirePermission(). Each of those stamps `req.rbac`.
 *
 * This sentinel wraps the response so that a route which somehow responds
 * WITHOUT having declared a policy — a new endpoint where the guard was
 * forgotten — returns 403 and shouts in the log, instead of quietly leaking
 * data. Forgetting a guard becomes a visible failure, not a silent hole.
 */
export function rbacSentinel(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  const allowed = (): boolean => req.rbac?.checked === true || res.locals.rbacBypass === true;

  const deny = (): Response => {
    // Set before responding so the nested res.send() inside res.json() is not
    // intercepted a second time.
    res.locals.rbacBypass = true;
    logger.error(
      { method: req.method, path: req.originalUrl, userId: req.user?.id },
      'RBAC sentinel blocked a route that declared no access policy',
    );
    res.status(403);
    return originalJson({
      error: {
        code: ErrorCode.FORBIDDEN,
        message: 'You do not have access to this.',
      },
    });
  };

  res.json = ((bodyValue: unknown) => (allowed() ? originalJson(bodyValue) : deny())) as Response['json'];
  res.send = ((bodyValue: unknown) => (allowed() ? originalSend(bodyValue) : deny())) as Response['send'];

  next();
}

function stamp(req: Request, policy: string): void {
  req.rbac = { checked: true, policy };
}

/** Deliberately open to anyone: login, refresh, health. */
export const publicRoute = (): RequestHandler => (req, _res, next) => {
  stamp(req, 'public');
  next();
};

/** Any signed-in account, ADMIN or STAFF. Must follow requireAuth. */
export const authenticated = (): RequestHandler => (req, _res, next) => {
  if (!req.user) {
    next(unauthenticated('Sign in to continue.'));
    return;
  }
  stamp(req, 'authenticated');
  next();
};

/**
 * Restricts a route to the listed roles. `requireRole(Role.ADMIN)` is the
 * boundary that keeps cost price, margins, shop-wide revenue, reports and
 * other staff's bills away from STAFF accounts.
 */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(unauthenticated('Sign in to continue.'));
      return;
    }
    if (!roles.includes(user.role)) {
      logger.warn(
        { userId: user.id, role: user.role, required: roles, path: req.originalUrl },
        'Role check refused',
      );
      next(forbidden('This is limited to the shop owner.'));
      return;
    }
    stamp(req, `role:${roles.join('|')}`);
    next();
  };

export const requireAdmin = (): RequestHandler => requireRole(Role.ADMIN);

/**
 * Gates an action behind a granular toggle on `users.permissions`.
 * ADMIN passes implicitly. Pass several to require all of them.
 */
export const requirePermission =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(unauthenticated('Sign in to continue.'));
      return;
    }
    const missing = permissions.filter((p) => !hasPermission(user, p));
    if (missing.length > 0) {
      logger.warn({ userId: user.id, missing, path: req.originalUrl }, 'Permission check refused');
      next(forbidden('You do not have permission for this. Ask the shop owner to enable it.'));
      return;
    }
    stamp(req, `permission:${permissions.join('+')}`);
    next();
  };

/**
 * True when the caller may act on records belonging to `ownerId`.
 * ADMIN sees everything; STAFF only their own. Used by list/detail services
 * (own bills only) once those modules land.
 */
export const canAccessOwnedBy = (req: Request, ownerId: string | null | undefined): boolean => {
  const user = req.user;
  if (!user) return false;
  if (user.role === Role.ADMIN) return true;
  return !!ownerId && ownerId === user.id;
};

/** Throws 403 unless the caller owns the record (or is ADMIN). */
export function assertCanAccessOwnedBy(req: Request, ownerId: string | null | undefined): void {
  if (!canAccessOwnedBy(req, ownerId)) {
    throw forbidden('You can only view your own records.');
  }
}
