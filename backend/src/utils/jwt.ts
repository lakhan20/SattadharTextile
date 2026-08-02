import jwt, { type JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { parseDurationMs } from './duration';
import { AppError, ErrorCode, unauthenticated } from './errors';

const ISSUER = 'sattadhar-textile';
const AUDIENCE = 'sattadhar-app';

export const ACCESS_TTL_MS = parseDurationMs(env.JWT_ACCESS_TTL);
export const REFRESH_TTL_MS = parseDurationMs(env.JWT_REFRESH_TTL);

export type TokenType = 'access' | 'refresh';

export interface TokenClaims {
  /** userId */
  sub: string;
  role: Role;
  /** Session id. The access token and the refresh token that issued it share it. */
  jti: string;
  typ: TokenType;
}

interface SignInput {
  userId: string;
  role: Role;
  jti: string;
}

function sign(input: SignInput, typ: TokenType, secret: string, ttlMs: number): string {
  return jwt.sign({ role: input.role, typ }, secret, {
    subject: input.userId,
    jwtid: input.jti,
    expiresIn: Math.floor(ttlMs / 1000),
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

/** Creates the session id shared by an access/refresh token pair. */
export const newJti = (): string => randomUUID();

export const signAccess = (input: SignInput): string =>
  sign(input, 'access', env.JWT_ACCESS_SECRET, ACCESS_TTL_MS);

export const signRefresh = (input: SignInput): string =>
  sign(input, 'refresh', env.JWT_REFRESH_SECRET, REFRESH_TTL_MS);

function verify(token: string, typ: TokenType, secret: string): TokenClaims {
  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw unauthenticated('Your session has expired. Sign in again.', ErrorCode.TOKEN_EXPIRED);
    }
    throw unauthenticated('That sign-in token is not valid.', ErrorCode.TOKEN_INVALID);
  }

  if (typeof decoded === 'string' || !decoded.sub || !decoded.jti) {
    throw unauthenticated('That sign-in token is not valid.', ErrorCode.TOKEN_INVALID);
  }

  const claimedType = (decoded as JwtPayload & { typ?: unknown }).typ;
  if (claimedType !== typ) {
    // A refresh token presented as an access token (or vice versa) is a
    // misuse, not an expiry — refuse it outright.
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'That sign-in token is not valid.', {
      logContext: { expected: typ, received: claimedType },
    });
  }

  const role = (decoded as JwtPayload & { role?: unknown }).role;
  if (role !== 'ADMIN' && role !== 'STAFF') {
    throw unauthenticated('That sign-in token is not valid.', ErrorCode.TOKEN_INVALID);
  }

  return { sub: decoded.sub, role, jti: decoded.jti, typ };
}

export const verifyAccess = (token: string): TokenClaims => verify(token, 'access', env.JWT_ACCESS_SECRET);

export const verifyRefresh = (token: string): TokenClaims => verify(token, 'refresh', env.JWT_REFRESH_SECRET);
