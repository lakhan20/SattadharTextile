import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../utils/errors';

const rejected =
  (message: string) =>
  (_req: Request, _res: Response, next: NextFunction, _options: Options): void => {
    next(new AppError(429, ErrorCode.RATE_LIMITED, message));
  };

/**
 * Collapses an address to the unit we want to rate-limit.
 *
 * IPv4 is used as-is. IPv6 is truncated to its /64 prefix, because a single
 * client is routinely handed a whole /64 and could otherwise walk through
 * fresh addresses to reset its counter.
 */
export function ipKey(rawIp: string | undefined): string {
  if (!rawIp) return 'unknown';
  const ip = rawIp.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  if (!ip) return 'unknown';

  const unmapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!unmapped.includes(':')) return unmapped; // IPv4

  const [head = '', tail = ''] = unmapped.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const gap = Math.max(0, 8 - headParts.length - tailParts.length);
  const hextets = [...headParts, ...Array<string>(gap).fill('0'), ...tailParts];
  return `${hextets.slice(0, 4).join(':')}::/64`;
}

/** Broad safety net across the whole API. */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MIN * 60_000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  keyGenerator: (req: Request): string => ipKey(req.ip),
  handler: rejected('Too many requests. Wait a moment and try again.'),
});

/**
 * Tighter, per-IP-and-username limit on sign-in. This blunts password spraying
 * across many accounts, which the per-account 5-attempt lockout cannot see.
 * Successful sign-ins are not counted, so a busy shop is never throttled.
 */
export const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MIN * 60_000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  keyGenerator: (req: Request): string => {
    const raw: unknown = (req.body as Record<string, unknown> | undefined)?.['username'];
    const username = typeof raw === 'string' ? raw.toLowerCase().trim().slice(0, 50) : '';
    return `${ipKey(req.ip)}|${username}`;
  },
  handler: rejected('Too many sign-in attempts. Wait a few minutes and try again.'),
});

/** Applied to refresh + password reset: cheaper than login, still abusable. */
export const sensitiveLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MIN * 60_000,
  limit: env.AUTH_RATE_LIMIT_MAX * 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  keyGenerator: (req: Request): string => ipKey(req.ip),
  handler: rejected('Too many requests. Wait a moment and try again.'),
});
