import { Role } from '@prisma/client';

/**
 * ── Menu assignment ──────────────────────────────────────────────────────
 *
 * Which SCREENS an account sees. This is the owner's convenience layer: a
 * staffer who never touches the shelf should not have a Stock tab in the way.
 *
 * It is NOT a security boundary, and it cannot become one:
 *
 *   · The assignable set (`STAFF_ELIGIBLE_MENUS`) contains no owner-only key.
 *     There is no value an owner can type into the staff form that names
 *     Reports, stock valuation, the shop-wide debtor book or this very screen.
 *   · `assertAssignableMenuKeys()` rejects anything outside that set, so the
 *     API refuses an owner-only key even when it is sent by hand with curl.
 *   · Every owner-only endpoint is gated by `requireRole(ADMIN)` regardless.
 *     Turning a menu key on grants nothing; turning one off protects nothing.
 *
 * ── How this relates to `permissions` ────────────────────────────────────
 *
 * Two different questions, and both are asked:
 *
 *   menuAccess  — "can this person GET TO the screen?"   (visibility)
 *   permissions — "can this person DO the thing on it?"  (action)
 *
 * They compose by AND, and neither implies the other. `BILLING` in menuAccess
 * puts the Billing tab on screen; it does not let that staffer cancel a bill —
 * that is `bill.cancel`. Conversely `payment.record` lets someone take money
 * on the khata; without `KHATA` (and `CUSTOMERS`, which is how a khata is
 * reached) they have no screen to do it from, though the endpoint would still
 * accept the call. Only `permissions` is consulted server-side when an action
 * is attempted — menuAccess never reaches an authorisation decision.
 */

/**
 * The complete set of keys an owner may tick for a staff account. Adding a key
 * here makes it assignable, so nothing owner-only may ever be added.
 */
export const STAFF_ELIGIBLE_MENUS = [
  /** The staff dashboard — their own bills and the low-stock count. Never shop totals. */
  'DASHBOARD',
  'BILLING',
  /** The catalog, read-only unless `product.create` / `product.update` say otherwise. */
  'PRODUCTS',
  'CUSTOMERS',
  /** What is on the shelf. Valuation and cost stay owner-only whatever this says. */
  'STOCK',
  /** One customer's book, opened from that customer. Needs `CUSTOMERS` to be reachable. */
  'KHATA',
] as const;

/**
 * Owner-only areas. Deliberately a separate list that the staff form never
 * renders and `assertAssignableMenuKeys` never accepts — an owner cannot assign
 * one by accident, by mistyping, or by crafting the request themselves.
 */
export const ADMIN_ONLY_MENUS = [
  /** Sales, GST, profit margin, stock valuation, ageing. */
  'REPORTS',
  /** The shop-wide debtor book and ageing buckets. */
  'OUTSTANDING',
  /** This feature: staff accounts and their menu assignment. */
  'STAFF',
] as const;

export type StaffMenuKey = (typeof STAFF_ELIGIBLE_MENUS)[number];
export type AdminMenuKey = (typeof ADMIN_ONLY_MENUS)[number];
export type MenuKey = StaffMenuKey | AdminMenuKey;

/** What an ADMIN session sees: everything, always. Never stored, always derived. */
export const ADMIN_MENUS: readonly MenuKey[] = [...STAFF_ELIGIBLE_MENUS, ...ADMIN_ONLY_MENUS];

const STAFF_ELIGIBLE_SET = new Set<string>(STAFF_ELIGIBLE_MENUS);

export const isStaffEligibleMenu = (value: unknown): value is StaffMenuKey =>
  typeof value === 'string' && STAFF_ELIGIBLE_SET.has(value);

/**
 * What a new staff account gets when the owner does not choose: the counter
 * job and nothing else. Stock and the catalog are opt-in because most staff
 * never need them, and an unused tab is one more thing to tap by mistake.
 */
export const DEFAULT_STAFF_MENUS: readonly StaffMenuKey[] = ['DASHBOARD', 'BILLING', 'CUSTOMERS'];

/**
 * Reads the jsonb column defensively. Anything that is not a recognised
 * staff-eligible key is dropped — a hand-edited row, a key removed in a later
 * release, or an owner-only key that somehow got written cannot survive a read.
 * Order follows `STAFF_ELIGIBLE_MENUS` so the UI is stable, and duplicates
 * collapse.
 */
export function normaliseMenuAccess(raw: unknown): StaffMenuKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(raw.filter(isStaffEligibleMenu));
  return STAFF_ELIGIBLE_MENUS.filter((key) => seen.has(key));
}

/**
 * The menu a session actually gets.
 *
 * ADMIN is not filtered by the stored column at all — an owner's navigation is
 * their role, not a setting someone could switch off. STAFF get their
 * assignment intersected with what STAFF may ever see, so an owner-only key
 * that reached the column by any route is dropped here too.
 *
 * A STAFF row with an empty column has never been assigned one (it predates
 * this feature, or was written by the seed), so it falls back to the default
 * rather than to a blank app.
 */
export function effectiveMenu(user: { role: Role; menuAccess: unknown }): MenuKey[] {
  if (user.role === Role.ADMIN) return [...ADMIN_MENUS];
  const assigned = normaliseMenuAccess(user.menuAccess);
  return assigned.length > 0 ? assigned : [...DEFAULT_STAFF_MENUS];
}

/** True when the session may see this screen. Visibility only — never call it to authorise an action. */
export const canSeeMenu = (user: { role: Role; menuAccess: unknown }, key: MenuKey): boolean =>
  effectiveMenu(user).includes(key);
