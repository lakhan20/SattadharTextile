import { AuditAction, Prisma, Role, type Language, type User } from '@prisma/client';
import type { Request } from 'express';
import { prisma, type PrismaClientOrTx } from '../../config/prisma';
import {
  DEFAULT_STAFF_MENUS,
  effectiveMenu,
  normaliseMenuAccess,
  type MenuKey,
  type StaffMenuKey,
} from '../../config/menus';
import {
  DEFAULT_STAFF_PERMISSIONS,
  PERMISSIONS,
  normalisePermissions,
  type Permission,
} from '../../config/permissions';
import { writeAudit } from '../../utils/audit';
import { AppError, ErrorCode, badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import { hashPassword } from '../../utils/password';
import { adminResetPassword, revokeAllSessions } from '../auth/auth.service';
import type { CreateStaffInput, ListStaffQuery, UpdateStaffInput } from './staff.schema';

/**
 * Staff accounts, and the menus assigned to them.
 *
 * Every function here is reached only through `requireRole(ADMIN)`. Nothing in
 * this file grants access to anything — it decides what a staff account may
 * SEE (menuAccess) and what it may DO (permissions); the endpoints those
 * choices describe enforce themselves.
 */

// ─────────────────────────────────────────────────────────────
// SERIALISATION
// ─────────────────────────────────────────────────────────────

/**
 * The one place a User row becomes a staff-management response. `passwordHash`
 * is not in the select and not in this type, so it cannot escape through either.
 */
export const staffSelect = {
  id: true,
  username: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  language: true,
  permissions: true,
  menuAccess: true,
  maxDiscountPercent: true,
  isActive: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

export interface StaffAccount {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  preferredLang: Language;
  permissions: Record<Permission, boolean>;
  /** What the owner assigned. Empty for an ADMIN — see `effectiveMenu`. */
  menuAccess: StaffMenuKey[];
  /** What this account will actually see once signed in. */
  effectiveMenu: MenuKey[];
  maxDiscountPercent: number;
  isActive: boolean;
  /** True while a 5-failure lockout is still running. */
  isLocked: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function serializeStaff(user: StaffRow): StaffAccount {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    preferredLang: user.language,
    permissions: normalisePermissions(user.permissions),
    menuAccess: normaliseMenuAccess(user.menuAccess),
    effectiveMenu: effectiveMenu(user),
    maxDiscountPercent: Number(user.maxDiscountPercent),
    isActive: user.isActive,
    isLocked: user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now(),
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    failedLoginAttempts: user.failedLoginAttempts,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** What the audit trail keeps. The same shape before and after, so a diff reads straight. */
const auditShape = (user: StaffRow) => ({
  username: user.username,
  name: user.name,
  role: user.role,
  isActive: user.isActive,
  language: user.language,
  maxDiscountPercent: Number(user.maxDiscountPercent),
  permissions: normalisePermissions(user.permissions),
  menuAccess: normaliseMenuAccess(user.menuAccess),
});

// ─────────────────────────────────────────────────────────────
// SAFETY RAILS
// ─────────────────────────────────────────────────────────────

/**
 * A shop with no working owner login is a shop that cannot fix itself: nobody
 * can re-activate the account, reset the password or promote a replacement,
 * because all three are owner-only. So the last active ADMIN cannot be switched
 * off or demoted — not by another owner, and not by themselves.
 *
 * Counted inside the same transaction as the write it guards, so two
 * simultaneous "demote the other one" requests cannot both see a count of two.
 */
async function assertNotLastAdmin(
  target: { id: string; role: Role; isActive: boolean },
  action: 'deactivate' | 'demote',
  tx: PrismaClientOrTx,
): Promise<void> {
  if (target.role !== Role.ADMIN || !target.isActive) return;

  const otherActiveAdmins = await tx.user.count({
    where: { role: Role.ADMIN, isActive: true, deletedAt: null, id: { not: target.id } },
  });
  if (otherActiveAdmins > 0) return;

  throw new AppError(
    409,
    ErrorCode.CONFLICT,
    action === 'deactivate'
      ? 'This is the only shop owner account left. Make someone else an owner before switching it off.'
      : 'This is the only shop owner account left. Make someone else an owner before changing this one to staff.',
  );
}

/**
 * Signing yourself out permanently, from the screen you would need in order to
 * undo it. Refused — an owner who wants to leave can sign out.
 */
function assertNotSelf(targetId: string, actorId: string): void {
  if (targetId === actorId) {
    throw forbidden('You cannot switch off the account you are signed in with.');
  }
}

async function findStaffOrThrow(id: string, client: PrismaClientOrTx = prisma): Promise<StaffRow> {
  const user = await client.user.findFirst({ where: { id, deletedAt: null }, select: staffSelect });
  if (!user) throw notFound('That staff account does not exist.');
  return user;
}

// ─────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────

export interface ListStaffResult {
  items: StaffAccount[];
  pagination: PaginationMeta;
}

export async function listStaff(query: ListStaffQuery): Promise<ListStaffResult> {
  const { page, pageSize, search, role, isActive } = query;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: staffSelect,
      // Owners first, then inactive accounts last, then by name: the list reads
      // in the order someone scanning it actually cares about.
      orderBy: [{ role: 'asc' }, { isActive: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: items.map(serializeStaff), pagination: buildPaginationMeta(page, pageSize, total) };
}

export async function getStaffById(id: string): Promise<StaffAccount> {
  return serializeStaff(await findStaffOrThrow(id));
}

/**
 * What the signed-in account may see. The app calls this at launch to build its
 * navigation; it is deliberately open to any signed-in session, because it
 * returns only that session's own menu and nothing else about the shop.
 */
export async function getMenuForUser(userId: string): Promise<{ role: Role; menu: MenuKey[] }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { role: true, menuAccess: true },
  });
  if (!user) throw notFound('That account no longer exists.');
  return { role: user.role, menu: effectiveMenu(user) };
}

// ─────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────

/**
 * Only the toggles the caller actually sent.
 *
 * `normalisePermissions` deliberately fills in EVERY key — bad data must read
 * as "denied", so it cannot leave one out. That makes it the wrong thing to
 * merge with: spreading its result over a base would overwrite every untouched
 * toggle with `false`. This keeps a partial payload partial, so an app that
 * has never heard of a permission added in a later release does not silently
 * switch it off.
 */
function presentPermissions(raw: Partial<Record<string, boolean>> | undefined): Partial<Record<Permission, boolean>> {
  const out: Partial<Record<Permission, boolean>> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean' && (PERMISSIONS as readonly string[]).includes(key)) {
      out[key as Permission] = value;
    }
  }
  return out;
}

/**
 * An ADMIN's menu is derived from the role, never stored, so writing one would
 * only create a value that disagrees with what they actually see. Store the
 * empty array for owners and let `effectiveMenu` answer.
 */
const menuToStore = (role: Role, requested: string[] | undefined, fallback: readonly StaffMenuKey[]): StaffMenuKey[] =>
  role === Role.ADMIN ? [] : normaliseMenuAccess(requested ?? fallback);

export async function createStaff(
  input: CreateStaffInput,
  actor: { id: string },
  req: Request,
): Promise<StaffAccount> {
  const existing = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
  if (existing) throw conflict('That username is already taken. Pick another one.');

  const passwordHash = await hashPassword(input.password);
  // The sensible default for anything the owner did not decide, overlaid with
  // what they did. Omitting `permissions` entirely gets the full default, not
  // an account that may do nothing.
  const permissions = { ...DEFAULT_STAFF_PERMISSIONS, ...presentPermissions(input.permissions) };

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        passwordHash,
        role: input.role,
        language: input.preferredLang,
        maxDiscountPercent: new Prisma.Decimal(input.maxDiscountPercent),
        // An owner holds every permission implicitly (see `hasPermission`), so
        // storing toggles for one would be decoration that later reads as fact.
        permissions: input.role === Role.ADMIN ? {} : permissions,
        menuAccess: menuToStore(input.role, input.menuAccess, DEFAULT_STAFF_MENUS),
        createdById: actor.id,
      },
      select: staffSelect,
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: user.id,
      after: auditShape(user),
      req,
      tx,
    });

    return user;
  });

  return serializeStaff(created);
}

/**
 * Editing an account. The whole change happens in one transaction with the
 * last-admin count and the audit row, so a demotion cannot slip past the guard
 * and cannot be recorded as having happened if it did not.
 */
export async function updateStaff(
  id: string,
  input: UpdateStaffInput,
  actor: { id: string },
  req: Request,
): Promise<StaffAccount> {
  const updated = await prisma.$transaction(async (tx) => {
    const before = await findStaffOrThrow(id, tx);

    const nextRole = input.role ?? before.role;
    if (before.role === Role.ADMIN && nextRole === Role.STAFF) {
      await assertNotLastAdmin(before, 'demote', tx);
    }

    // Merging rather than replacing: the form sends the toggles it rendered,
    // and a permission added in a later release must not be silently cleared by
    // an app that has never heard of it.
    const nextPermissions = {
      ...normalisePermissions(before.permissions),
      ...presentPermissions(input.permissions),
    };

    const data: Prisma.UserUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.preferredLang !== undefined ? { language: input.preferredLang } : {}),
      ...(input.maxDiscountPercent !== undefined
        ? { maxDiscountPercent: new Prisma.Decimal(input.maxDiscountPercent) }
        : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.permissions !== undefined || input.role !== undefined
        ? { permissions: nextRole === Role.ADMIN ? {} : nextPermissions }
        : {}),
      ...(input.menuAccess !== undefined || input.role !== undefined
        ? {
            menuAccess: menuToStore(
              nextRole,
              input.menuAccess ?? normaliseMenuAccess(before.menuAccess),
              DEFAULT_STAFF_MENUS,
            ),
          }
        : {}),
    };

    const after = await tx.user.update({ where: { id: before.id }, data, select: staffSelect });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: before.id,
      before: auditShape(before),
      after: auditShape(after),
      req,
      tx,
    });

    return after;
  });

  return serializeStaff(updated);
}

export interface StaffStateChangeResult {
  staff: StaffAccount;
  /** How many live sessions were killed. Non-zero means somebody was using the app. */
  revokedSessions: number;
}

/**
 * Switching an account off. The sessions go with it: `requireAuth` re-reads the
 * refresh-token row on every request, so revoking here means their very next
 * tap returns 401 — not "next time they sign in".
 */
export async function deactivateStaff(
  id: string,
  actor: { id: string },
  req: Request,
): Promise<StaffStateChangeResult> {
  const result = await prisma.$transaction(async (tx) => {
    const before = await findStaffOrThrow(id, tx);
    assertNotSelf(before.id, actor.id);

    if (!before.isActive) {
      throw badRequest('That account is already switched off.');
    }
    await assertNotLastAdmin(before, 'deactivate', tx);

    const after = await tx.user.update({
      where: { id: before.id },
      data: { isActive: false },
      select: staffSelect,
    });
    const revokedSessions = await revokeAllSessions(before.id, tx);

    await writeAudit({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: before.id,
      before: auditShape(before),
      after: { ...auditShape(after), revokedSessions },
      req,
      tx,
    });

    return { staff: after, revokedSessions };
  });

  return { staff: serializeStaff(result.staff), revokedSessions: result.revokedSessions };
}

/** Switching one back on. Sessions are not restored — they sign in again. */
export async function activateStaff(id: string, actor: { id: string }, req: Request): Promise<StaffAccount> {
  const updated = await prisma.$transaction(async (tx) => {
    const before = await findStaffOrThrow(id, tx);
    if (before.isActive) throw badRequest('That account is already active.');

    const after = await tx.user.update({
      where: { id: before.id },
      // A dormant lockout would meet them at the door otherwise.
      data: { isActive: true, failedLoginAttempts: 0, lockedUntil: null },
      select: staffSelect,
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: before.id,
      before: auditShape(before),
      after: auditShape(after),
      req,
      tx,
    });

    return after;
  });

  return serializeStaff(updated);
}

/**
 * Clearing a lockout without changing the password — for the far commoner case
 * of someone fat-fingering their own password five times, where a reset would
 * mean inventing and communicating a new one for no reason.
 */
export async function unlockStaff(id: string, actor: { id: string }, req: Request): Promise<StaffAccount> {
  const updated = await prisma.$transaction(async (tx) => {
    const before = await findStaffOrThrow(id, tx);

    const after = await tx.user.update({
      where: { id: before.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: staffSelect,
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: before.id,
      before: { failedLoginAttempts: before.failedLoginAttempts, lockedUntil: before.lockedUntil },
      after: { failedLoginAttempts: 0, lockedUntil: null },
      req,
      tx,
    });

    return after;
  });

  return serializeStaff(updated);
}

export interface ResetStaffPasswordResult {
  staff: StaffAccount;
  revokedSessions: number;
}

/**
 * Delegates to the auth module's existing reset — same hashing, same session
 * revocation, same PASSWORD_RESET audit row. Duplicating it here would give the
 * shop two password paths that could drift apart.
 */
export async function resetStaffPassword(
  id: string,
  newPassword: string,
  actor: { id: string },
  req: Request,
): Promise<ResetStaffPasswordResult> {
  await findStaffOrThrow(id);
  const result = await adminResetPassword({ userId: id, newPassword }, actor, req);
  return { staff: await getStaffById(id), revokedSessions: result.revokedSessions };
}
