import { BillingMode, DiscountType, PaymentMode } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const billIdParamsSchema = z.object({
  id: z.string().uuid('Invalid bill id.'),
});

const billLineItemSchema = z.object({
  productId: z.string().uuid('Pick a valid product.'),
  qty: z.coerce.number().positive('Quantity must be greater than 0.'),
  /** Omit to default to the customer's rate (wholesale/retail); pass to override. */
  rate: z.coerce.number().nonnegative('Rate must be 0 or more.').optional(),
  discountType: z.nativeEnum(DiscountType).optional(),
  discountValue: z.coerce.number().nonnegative('Discount must be 0 or more.').default(0),
});

export const createBillSchema = z
  .object({
    billingMode: z.nativeEnum(BillingMode),
    customerId: z.string().uuid('Pick a valid customer.').optional(),
    walkInName: z.string().trim().min(1).max(100).optional(),
    walkInPhone: z.string().trim().max(20).optional(),
    paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.CASH),
    /** Omit to default to fully paid (or 0 for CREDIT). */
    paidAmount: z.coerce.number().nonnegative('Paid amount must be 0 or more.').optional(),
    billDiscountType: z.nativeEnum(DiscountType).optional(),
    billDiscountValue: z.coerce.number().nonnegative('Discount must be 0 or more.').default(0),
    notes: z.string().trim().max(500).optional(),
    /**
     * Sell past the customer's credit limit anyway. Honoured for ADMIN only —
     * the service drops it for a STAFF actor, the same way `stock.in` drops a
     * staff-supplied purchase rate.
     */
    // Not `z.coerce.boolean()` — that turns the string "false" into true.
    overrideCreditLimit: z.boolean().default(false),
    /** PDF language. Only 'en' is implemented; 'gu' is accepted for forward-compat. */
    lang: z.enum(['en', 'gu']).default('en'),
    items: z.array(billLineItemSchema).min(1, 'At least one line item is required.'),
  })
  .refine((data) => !!data.customerId || !!data.walkInName, {
    message: 'Provide a customerId or a walk-in customer name.',
    path: ['customerId'],
  });

/**
 * Revising an already-issued bill.
 *
 * What is deliberately NOT editable, and why:
 *   · `billNumber` / `billDate` — the document's identity. Changing either
 *     makes the invoice series meaningless.
 *   · `billingMode` — GST and non-GST draw from separate number series, so a
 *     switch is a different document, not an edit of this one.
 *   · `customerId` — moving an issued bill onto a different person is not a
 *     correction, it is two corrections: cancel this one, write another.
 *
 * Everything the counter actually gets wrong — a quantity, a rate, a line that
 * should not be there, how it was paid — is here.
 */
export const updateBillSchema = z.object({
  /** Required, and stored on the revision. An unexplained edit reads as tampering. */
  reason: z
    .string()
    .trim()
    .min(3, 'Say why this bill is being changed.')
    .max(300, 'Keep the reason under 300 characters.'),
  paymentMode: z.nativeEnum(PaymentMode).optional(),
  /** Omit to keep what has already been received against this bill. */
  paidAmount: z.coerce.number().nonnegative('Paid amount must be 0 or more.').optional(),
  billDiscountType: z.nativeEnum(DiscountType).optional(),
  billDiscountValue: z.coerce.number().nonnegative('Discount must be 0 or more.').default(0),
  notes: z.string().trim().max(500).optional(),
  overrideCreditLimit: z.boolean().default(false),
  items: z.array(billLineItemSchema).min(1, 'A bill needs at least one line.'),
});

export const listRevisionsQuerySchema = paginationQuerySchema.extend({
  /** Owner-only shop-wide view: narrow to one staff account. */
  changedById: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const listBillsQuerySchema = paginationQuerySchema.extend({
  customerId: z.string().uuid().optional(),
  billingMode: z.nativeEnum(BillingMode).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const sendBillSchema = z.object({
  /** Override the recipient — useful for a walk-in bill with no phone on file. */
  phone: z.string().trim().max(20).optional(),
  lang: z.enum(['en', 'gu']).default('en'),
});

export const pdfQuerySchema = z.object({
  lang: z.enum(['en', 'gu']).default('en'),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
export type ListRevisionsQuery = z.infer<typeof listRevisionsQuerySchema>;
export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;
export type SendBillInput = z.infer<typeof sendBillSchema>;
export type PdfQuery = z.infer<typeof pdfQuerySchema>;
