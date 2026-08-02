import { Role } from '@prisma/client';

/**
 * Granular toggles stored on `users.permissions` (jsonb).
 *
 * These only ever NARROW or slightly widen what a STAFF account can do inside
 * the surface its role already allows. They can never grant a STAFF account
 * access to ADMIN-only data (cost price, margins, shop-wide revenue, reports,
 * other staff's bills) — that boundary is enforced by role, not by permission.
 */
export const PERMISSIONS = [
  'stock.in', // record stock-in entries
  'stock.adjust', // record adjustments with a reason
  'product.create',
  'product.update',
  'customer.create',
  'customer.update',
  'bill.cancel', // cancel own bill (ADMIN can cancel any)
  'payment.record', // accept a khata payment
  'ledger.view', // view customer outstanding / ageing
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);

/** Applied to newly created STAFF accounts unless ADMIN overrides them. */
export const DEFAULT_STAFF_PERMISSIONS: Record<Permission, boolean> = {
  'stock.in': false,
  'stock.adjust': false,
  'product.create': false,
  'product.update': false,
  'customer.create': true,
  'customer.update': true,
  'bill.cancel': false,
  'payment.record': true,
  'ledger.view': true,
};

/** Reads the jsonb blob defensively — bad data means "denied", never "allowed". */
export function normalisePermissions(raw: unknown): Record<Permission, boolean> {
  const source = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result = {} as Record<Permission, boolean>;
  for (const key of PERMISSIONS) {
    result[key] = source[key] === true;
  }
  return result;
}

/** ADMIN implicitly holds every permission; STAFF holds only what is toggled on. */
export function hasPermission(
  user: { role: Role; permissions: Record<Permission, boolean> },
  permission: Permission,
): boolean {
  if (user.role === Role.ADMIN) return true;
  return user.permissions[permission] === true;
}
