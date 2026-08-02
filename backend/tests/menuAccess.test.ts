import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  ADMIN_MENUS,
  ADMIN_ONLY_MENUS,
  DEFAULT_STAFF_MENUS,
  STAFF_ELIGIBLE_MENUS,
  canSeeMenu,
  effectiveMenu,
  normaliseMenuAccess,
} from '../src/config/menus';
import { normalisePermissions } from '../src/config/permissions';
import { createStaffSchema, updateStaffSchema } from '../src/modules/staff/staff.schema';

/**
 * Menu assignment is a convenience layer, and these tests are about proving it
 * stays one: nothing an owner can save, and nothing already sitting in the
 * column, may put an owner-only screen in front of a staff account.
 */
describe('menu assignment cannot reach owner-only screens', () => {
  it('keeps the assignable set and the owner-only set disjoint', () => {
    const assignable = new Set<string>(STAFF_ELIGIBLE_MENUS);
    for (const key of ADMIN_ONLY_MENUS) {
      expect(assignable.has(key)).toBe(false);
    }
  });

  it.each(ADMIN_ONLY_MENUS)('rejects "%s" on create with a message naming the reason', (key) => {
    const result = createStaffSchema.safeParse({
      name: 'Test Staff',
      username: 'teststaff',
      password: 'Passw0rd123',
      menuAccess: ['BILLING', key],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('shop-owner area');
    }
  });

  it.each(ADMIN_ONLY_MENUS)('rejects "%s" on update — the curl path, not just the form', (key) => {
    expect(updateStaffSchema.safeParse({ menuAccess: [key] }).success).toBe(false);
  });

  it('rejects a key the app does not have at all', () => {
    expect(updateStaffSchema.safeParse({ menuAccess: ['STOCK_VALUATION'] }).success).toBe(false);
  });

  it('drops an owner-only key that somehow reached the column', () => {
    // A hand-edited row, or a restore from a build that spelled things
    // differently. A read must not resurrect it.
    expect(normaliseMenuAccess(['BILLING', 'REPORTS', 'STAFF'])).toEqual(['BILLING']);
  });

  it('treats a malformed column as "nothing assigned" rather than "everything"', () => {
    expect(normaliseMenuAccess(null)).toEqual([]);
    expect(normaliseMenuAccess('BILLING')).toEqual([]);
    expect(normaliseMenuAccess({ BILLING: true })).toEqual([]);
  });

  it('refuses khata without the customer screen it opens from', () => {
    expect(updateStaffSchema.safeParse({ menuAccess: ['KHATA'] }).success).toBe(false);
    expect(updateStaffSchema.safeParse({ menuAccess: ['CUSTOMERS', 'KHATA'] }).success).toBe(true);
  });
});

/**
 * `normalisePermissions` fills in every key by design — bad data must read as
 * denied. That makes it the wrong thing to spread over a base, and the staff
 * service uses a partial-only helper instead. These guard the distinction.
 */
describe('permission payloads stay partial', () => {
  it('accepts a partial permissions map without inventing the rest', () => {
    const parsed = updateStaffSchema.safeParse({ permissions: { 'stock.in': true } });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data.permissions ?? {})).toEqual(['stock.in']);
    }
  });

  it('rejects a permission this app does not have, rather than ignoring it', () => {
    // A typo must fail at the form, not become a toggle that is never granted.
    expect(updateStaffSchema.safeParse({ permissions: { 'stock.inn': true } }).success).toBe(false);
  });

  it('still fills in every key when READING a stored blob', () => {
    // The defensive read is unchanged: anything absent or non-boolean is false.
    const read = normalisePermissions({ 'stock.in': true, 'bill.edit': 'yes' });
    expect(read['stock.in']).toBe(true);
    expect(read['bill.edit']).toBe(false);
    expect(read['payment.record']).toBe(false);
  });
});

describe('effective menu', () => {
  it('gives an owner everything, whatever the column says', () => {
    expect(effectiveMenu({ role: Role.ADMIN, menuAccess: [] })).toEqual([...ADMIN_MENUS]);
    expect(effectiveMenu({ role: Role.ADMIN, menuAccess: ['BILLING'] })).toEqual([...ADMIN_MENUS]);
  });

  it('intersects a staff assignment with what staff may ever see', () => {
    expect(effectiveMenu({ role: Role.STAFF, menuAccess: ['BILLING', 'REPORTS'] })).toEqual(['BILLING']);
  });

  it('falls back to the default rather than a blank app for an unassigned staff row', () => {
    expect(effectiveMenu({ role: Role.STAFF, menuAccess: [] })).toEqual([...DEFAULT_STAFF_MENUS]);
  });

  it('returns keys in a stable order regardless of how they were saved', () => {
    expect(effectiveMenu({ role: Role.STAFF, menuAccess: ['STOCK', 'BILLING', 'STOCK'] })).toEqual([
      'BILLING',
      'STOCK',
    ]);
  });

  it('never reports an owner-only screen as visible to staff', () => {
    const staff = { role: Role.STAFF, menuAccess: ['BILLING', 'CUSTOMERS'] };
    for (const key of ADMIN_ONLY_MENUS) {
      expect(canSeeMenu(staff, key)).toBe(false);
    }
    expect(canSeeMenu(staff, 'BILLING')).toBe(true);
  });
});
