import { Language, Role } from '@prisma/client';
import { z } from 'zod';
import { ADMIN_ONLY_MENUS, STAFF_ELIGIBLE_MENUS } from '../../config/menus';
import { PERMISSIONS } from '../../config/permissions';
import { passwordField, usernameField } from '../auth/auth.schema';
import { booleanQueryParam, paginationQuerySchema } from '../../utils/pagination';

/**
 * `permissions` arrives as a flat map of the known toggles. Unknown keys are
 * rejected rather than ignored, so a typo'd permission fails loudly at the form
 * instead of silently never being granted.
 */
const permissionsField = z
  .object(Object.fromEntries(PERMISSIONS.map((key) => [key, z.boolean().optional()])))
  .strict('That is not a permission this app has.')
  .partial();

const ADMIN_ONLY_SET = new Set<string>(ADMIN_ONLY_MENUS);

/**
 * The menu assignment.
 *
 * `z.enum` over the staff-eligible keys is the whole safety rail: an owner-only
 * key is not merely filtered out, it fails validation with a message naming the
 * problem, so an owner who tries it is told why rather than left wondering why
 * the tick did not stick. Duplicates collapse in the service via
 * `normaliseMenuAccess`.
 */
const menuAccessField = z
  .array(
    z.string().superRefine((value, ctx) => {
      if (ADMIN_ONLY_SET.has(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${value}" is a shop-owner area and cannot be given to a staff account.`,
        });
        return;
      }
      if (!(STAFF_ELIGIBLE_MENUS as readonly string[]).includes(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${value}" is not a screen this app has.` });
      }
    }),
  )
  .max(STAFF_ELIGIBLE_MENUS.length, 'That is more screens than the app has.')
  /**
   * Khata is opened FROM a customer's record — there is no other way in — so
   * assigning it without Customers produces a setting that does nothing. Caught
   * here rather than left as a puzzle for the owner to work out later.
   */
  .superRefine((keys, ctx) => {
    if (keys.includes('KHATA') && !keys.includes('CUSTOMERS')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Khata opens from a customer, so Customers has to be on as well.',
      });
    }
  })
  .transform((keys) => keys as string[]);

const maxDiscountField = z.coerce
  .number()
  .min(0, 'A discount limit cannot be negative.')
  .max(100, 'A discount limit cannot be over 100%.');

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name.').max(120, 'That name is too long.'),
  username: usernameField,
  password: passwordField,
  role: z.nativeEnum(Role).default(Role.STAFF),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email('That email does not look right.').max(160).optional(),
  preferredLang: z.nativeEnum(Language).default(Language.EN),
  maxDiscountPercent: maxDiscountField.default(0),
  permissions: permissionsField.optional(),
  /** Omitted means "the sensible default" — dashboard, billing, customers. */
  menuAccess: menuAccessField.optional(),
});

/**
 * Everything an owner may change afterwards. The username is absent on purpose:
 * it is how the account signs in and how it reads in the audit trail, so
 * renaming it would quietly rewrite history. The password is absent too — that
 * is `/reset-password`, which also ends their sessions.
 */
export const updateStaffSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the full name.').max(120, 'That name is too long.'),
    role: z.nativeEnum(Role),
    phone: z.string().trim().max(20).nullable(),
    email: z.string().trim().email('That email does not look right.').max(160).nullable(),
    preferredLang: z.nativeEnum(Language),
    maxDiscountPercent: maxDiscountField,
    permissions: permissionsField,
    menuAccess: menuAccessField,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change.');

export const listStaffQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(80).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: booleanQueryParam,
});

export const staffIdParamsSchema = z.object({
  id: z.string().uuid('Pick a valid staff account.'),
});

export const resetStaffPasswordSchema = z.object({
  newPassword: passwordField,
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;
