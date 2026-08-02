import { AuditAction, Prisma, type Language, type Role, type User } from '@prisma/client';
import type { Request } from 'express';
import { env } from '../../config/env';
import { prisma, type PrismaClientOrTx } from '../../config/prisma';
import { normalisePermissions } from '../../config/permissions';
import type { PublicUser } from '../../types/auth';
import { writeAudit } from '../../utils/audit';
import { AppError, ErrorCode, notFound, unauthenticated } from '../../utils/errors';
import {
  ACCESS_TTL_MS,
  REFRESH_TTL_MS,
  newJti,
  signAccess,
  signRefresh,
  verifyRefresh,
} from '../../utils/jwt';
import { burnTimingBudget, hashPassword, verifyPassword } from '../../utils/password';
import type { AdminResetPasswordInput, LoginInput, LogoutInput, RefreshInput } from './auth.schema';

const LOCK_MS = env.LOGIN_LOCK_MINUTES * 60_000;

/** Identical for an unknown username and a wrong password — no account enumeration. */
const invalidCredentials = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Username or password is incorrect.');

type UserForPublic = Pick<
  User,
  | 'id'
  | 'username'
  | 'name'
  | 'phone'
  | 'email'
  | 'role'
  | 'language'
  | 'permissions'
  | 'maxDiscountPercent'
  | 'isActive'
  | 'lastLoginAt'
>;

/** The only place a User row becomes an API response. The hash cannot escape through it. */
export function toPublicUser(user: UserForPublic): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    preferredLang: user.language,
    permissions: normalisePermissions(user.permissions),
    maxDiscountPercent: Number(user.maxDiscountPercent),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export const publicUserSelect = {
  id: true,
  username: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  language: true,
  permissions: true,
  maxDiscountPercent: true,
  isActive: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

/**
 * Revokes every live session for a user. Called on password reset and (from
 * the staff module) on deactivation — the tokens stop working immediately
 * because requireAuth re-checks the `jti` on every request.
 */
export async function revokeAllSessions(
  userId: string,
  client: PrismaClientOrTx = prisma,
  exceptJti?: string,
): Promise<number> {
  const result = await client.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptJti ? { jti: { not: exceptJti } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  /** Seconds. */
  accessExpiresIn: number;
  refreshExpiresIn: number;
  user: PublicUser;
}

export async function login(input: LoginInput, req: Request): Promise<LoginResult> {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { username: input.username } });

  if (!user) {
    // Same wall-clock cost as a real comparison, so response time reveals nothing.
    await burnTimingBudget(input.password);
    await writeAudit({
      userId: null,
      action: AuditAction.LOGIN_FAILED,
      entity: 'User',
      after: { username: input.username, reason: 'UNKNOWN_USERNAME' },
      req,
    });
    throw invalidCredentials();
  }

  if (user.deletedAt || !user.isActive) {
    await writeAudit({
      userId: user.id,
      action: AuditAction.LOGIN_FAILED,
      entity: 'User',
      entityId: user.id,
      after: { reason: 'ACCOUNT_INACTIVE' },
      req,
    });
    throw new AppError(
      403,
      ErrorCode.ACCOUNT_INACTIVE,
      'This account is no longer active. Contact the shop owner.',
    );
  }

  const lockActive = user.lockedUntil !== null && user.lockedUntil > now;
  if (lockActive) {
    const minutesLeft = Math.max(1, Math.ceil((user.lockedUntil!.getTime() - now.getTime()) / 60_000));
    await writeAudit({
      userId: user.id,
      action: AuditAction.LOGIN_FAILED,
      entity: 'User',
      entityId: user.id,
      after: { reason: 'ACCOUNT_LOCKED', minutesLeft },
      req,
    });
    throw new AppError(
      423,
      ErrorCode.ACCOUNT_LOCKED,
      `Account locked after ${env.LOGIN_MAX_ATTEMPTS} failed attempts. Try again in ${minutesLeft} minute${
        minutesLeft === 1 ? '' : 's'
      }, or ask the shop owner to reset your password.`,
    );
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);

  if (!passwordOk) {
    // A lock that has run out resets the count — "5 consecutive failures"
    // means 5 since the last success or the last expired lock.
    const lockHadExpired = user.lockedUntil !== null && user.lockedUntil <= now;
    const attempts = (lockHadExpired ? 0 : user.failedLoginAttempts) + 1;
    const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + LOCK_MS) : null,
      },
    });

    await writeAudit({
      userId: user.id,
      action: AuditAction.LOGIN_FAILED,
      entity: 'User',
      entityId: user.id,
      after: { reason: 'BAD_PASSWORD', attempts, locked: shouldLock },
      req,
    });

    if (shouldLock) {
      throw new AppError(
        423,
        ErrorCode.ACCOUNT_LOCKED,
        `Account locked after ${env.LOGIN_MAX_ATTEMPTS} failed attempts. Try again in ${env.LOGIN_LOCK_MINUTES} minutes, or ask the shop owner to reset your password.`,
      );
    }
    throw invalidCredentials();
  }

  // ── Success ────────────────────────────────────────────────
  const jti = newJti();
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
      select: publicUserSelect,
    }),
    prisma.refreshToken.create({
      data: {
        jti,
        userId: user.id,
        expiresAt,
        userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
        ip: req.ip ?? null,
      },
    }),
    // Housekeeping: drop this user's dead sessions so the table stays small.
    prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: now } },
    }),
  ]);

  await writeAudit({
    userId: user.id,
    action: AuditAction.LOGIN,
    entity: 'User',
    entityId: user.id,
    after: { jti, role: user.role },
    req,
  });

  const signInput = { userId: user.id, role: user.role, jti };
  return {
    accessToken: signAccess(signInput),
    refreshToken: signRefresh(signInput),
    accessExpiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    refreshExpiresIn: Math.floor(REFRESH_TTL_MS / 1000),
    user: toPublicUser(updated),
  };
}

export interface RefreshResult {
  accessToken: string;
  accessExpiresIn: number;
  user: PublicUser;
}

/**
 * Exchanges a live refresh token for a fresh access token. The session `jti`
 * is deliberately unchanged, so access tokens already in flight keep working;
 * the session dies only on logout, deactivation or password reset.
 */
export async function refresh(input: RefreshInput): Promise<RefreshResult> {
  const claims = verifyRefresh(input.refreshToken);

  const session = await prisma.refreshToken.findUnique({
    where: { jti: claims.jti },
    select: {
      jti: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { ...publicUserSelect, deletedAt: true } },
    },
  });

  if (!session || session.userId !== claims.sub) {
    throw unauthenticated('This session has ended. Sign in again.', ErrorCode.TOKEN_REVOKED);
  }
  if (session.revokedAt) {
    throw unauthenticated('This session was signed out. Sign in again.', ErrorCode.TOKEN_REVOKED);
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw unauthenticated('Your session has expired. Sign in again.', ErrorCode.TOKEN_EXPIRED);
  }

  const { deletedAt, ...user } = session.user;
  if (!user.isActive || deletedAt) {
    throw new AppError(
      403,
      ErrorCode.ACCOUNT_INACTIVE,
      'This account is no longer active. Contact the shop owner.',
    );
  }

  // Signed with the CURRENT role, so a role change takes effect on next refresh.
  const accessToken = signAccess({ userId: user.id, role: user.role, jti: session.jti });

  return {
    accessToken,
    accessExpiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    user: toPublicUser(user),
  };
}

export interface LogoutResult {
  revokedSessions: number;
}

export async function logout(
  input: LogoutInput,
  currentUser: { id: string; jti: string },
  req: Request,
): Promise<LogoutResult> {
  if (input.allDevices) {
    const count = await revokeAllSessions(currentUser.id);
    await writeAudit({
      userId: currentUser.id,
      action: AuditAction.LOGOUT,
      entity: 'User',
      entityId: currentUser.id,
      after: { scope: 'ALL_DEVICES', revokedSessions: count },
      req,
    });
    return { revokedSessions: count };
  }

  // Default to the session the access token belongs to. If a refresh token was
  // sent, it must belong to the same user — you cannot sign out someone else.
  let targetJti = currentUser.jti;
  if (input.refreshToken) {
    const claims = verifyRefresh(input.refreshToken);
    if (claims.sub !== currentUser.id) {
      throw unauthenticated('That token does not belong to this account.', ErrorCode.TOKEN_INVALID);
    }
    targetJti = claims.jti;
  }

  const result = await prisma.refreshToken.updateMany({
    where: { jti: targetJti, userId: currentUser.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await writeAudit({
    userId: currentUser.id,
    action: AuditAction.LOGOUT,
    entity: 'User',
    entityId: currentUser.id,
    after: { scope: 'SESSION', jti: targetJti, revokedSessions: result.count },
    req,
  });

  return { revokedSessions: result.count };
}

export interface AdminResetPasswordResult {
  userId: string;
  username: string;
  revokedSessions: number;
}

/** ADMIN-only. Sets a new password and kills every live session for that user. */
export async function adminResetPassword(
  input: AdminResetPasswordInput,
  actor: { id: string },
  req: Request,
): Promise<AdminResetPasswordResult> {
  const target = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: { id: true, username: true, name: true, role: true, passwordChangedAt: true },
  });

  if (!target) throw notFound('That staff account does not exist.');

  const passwordHash = await hashPassword(input.newPassword);
  const now = new Date();

  const revokedSessions = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        passwordHash,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    const count = await revokeAllSessions(target.id, tx);

    await writeAudit({
      userId: actor.id,
      action: AuditAction.PASSWORD_RESET,
      entity: 'User',
      entityId: target.id,
      before: {
        username: target.username,
        passwordChangedAt: target.passwordChangedAt,
        lockedUntil: 'cleared-if-set',
      },
      after: {
        username: target.username,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
        revokedSessions: count,
      },
      req,
      tx,
    });

    return count;
  });

  return { userId: target.id, username: target.username, revokedSessions };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: publicUserSelect,
  });
  if (!user) throw notFound('That account no longer exists.');
  return toPublicUser(user);
}

/** Used by the seed + (later) the staff module. */
export interface CreateUserInput {
  username: string;
  name: string;
  password: string;
  role: Role;
  phone?: string | null;
  email?: string | null;
  language?: Language;
  maxDiscountPercent?: number;
  permissions?: Record<string, boolean>;
}
