import { CustomerType } from '@prisma/client';
import { z } from 'zod';
import { booleanQueryParam, paginationQuerySchema } from '../../utils/pagination';

export const customerIdParamsSchema = z.object({
  id: z.string().uuid('Invalid customer id.'),
});

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  /** Matches against name or phone. */
  search: z.string().trim().max(100).optional(),
  type: z.nativeEnum(CustomerType).optional(),
  isActive: booleanQueryParam,
});

/**
 * Accepts a number however the counter types it — with spaces, dashes, a
 * leading 0, or a +91 — and lets `normalisePhone` settle on one spelling.
 * Validating the shape rather than a strict format keeps a legitimate
 * out-of-state or landline number from being refused at the counter.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, 'Enter a phone number.')
  .max(20, 'That phone number is too long.')
  .refine((v) => (v.match(/\d/g) ?? []).length >= 6, 'That does not look like a phone number.');

/** 24AAAAA0000A1Z5 — 15 characters, state code first. */
const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'That GSTIN does not look right.');

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the customer’s name.').max(120, 'Keep the name under 120 characters.'),
  phone: phoneSchema,
  email: z.string().trim().email('That email does not look right.').max(120).optional(),
  gstin: gstinSchema.optional(),
  addressLine: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  /** Drives CGST+SGST (Gujarat) vs IGST on every bill this customer is given. */
  state: z.string().trim().min(2).max(60).default('Gujarat'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'A pincode is 6 digits.').optional(),
  type: z.nativeEnum(CustomerType).default(CustomerType.RETAIL),
  /** 0 means "no limit set", not "no credit allowed" — see `checkCreditLimit`. */
  creditLimit: z.coerce.number().nonnegative('A credit limit cannot be negative.').max(99_999_999.99).default(0),
  /**
   * What they already owed before the shop started using the app. Posted as an
   * OPENING ledger entry so the khata is complete from its first line.
   */
  openingBalance: z.coerce
    .number()
    .nonnegative('An opening balance cannot be negative.')
    .max(99_999_999.99)
    .default(0),
  notes: z.string().trim().max(500).optional(),
});

export const lookupByPhoneQuerySchema = z.object({
  phone: phoneSchema,
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type LookupByPhoneQuery = z.infer<typeof lookupByPhoneQuerySchema>;
