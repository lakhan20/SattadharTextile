import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { normalisePermissions } from '../config/permissions';
import { ErrorCode, unauthenticated } from '../utils/errors';
import { verifyAccess } from '../utils/jwt';

function readBearer(req: Request): string {
  const header = req.get('authorization');
  if (!header) throw unauthenticated('Sign in to continue.');
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    throw unauthenticated('Sign in to continue.');
  }
  return token.trim();
}

/**
 * Verifies the access token, then re-reads the session and the user from the
 * database on every request. The token alone is never trusted: a staff member
 * deactivated one minute ago is refused on their next tap, because the session
 * row behind their `jti` was revoked at that moment.
 *
 * One query does all of it — the refresh-token row keyed by `jti`, with the
 * user joined.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const claims = verifyAccess(readBearer(req));

    const session = await prisma.refreshToken.findUnique({
      where: { jti: claims.jti },
      select: {
        jti: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            language: true,
            permissions: true,
            maxDiscountPercent: true,
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!session) {
      throw unauthenticated('This session has ended. Sign in again.', ErrorCode.TOKEN_REVOKED);
    }
    if (session.revokedAt) {
      throw unauthenticated('This session was signed out. Sign in again.', ErrorCode.TOKEN_REVOKED);
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw unauthenticated('Your session has expired. Sign in again.', ErrorCode.TOKEN_EXPIRED);
    }

    const user = session.user;
    if (!user.isActive || user.deletedAt) {
      throw unauthenticated('This account is no longer active. Contact the shop owner.', ErrorCode.ACCOUNT_INACTIVE);
    }
    if (user.role !== claims.role) {
      // Role changed since the token was signed — force a fresh sign-in
      // rather than honour a stale privilege claim.
      throw unauthenticated('Your access level changed. Sign in again.', ErrorCode.TOKEN_REVOKED);
    }

    req.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      language: user.language,
      permissions: normalisePermissions(user.permissions),
      maxDiscountPercent: Number(user.maxDiscountPercent),
      jti: session.jti,
    };

    next();
  } catch (err) {
    next(err);
  }
}
