import { NoteType, PaymentMode } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

export const customerIdParamsSchema = z.object({
  customerId: z.string().uuid('Pick a valid customer.'),
});

/**
 * Money the shop actually receives over the counter. Deliberately narrower
 * than the `PaymentMode` enum: CHEQUE and CARD are not settled at the moment
 * they are handed over, and CREDIT is the absence of a payment, so none of the
 * three belongs on a receipt that reduces a khata balance the same second.
 */
export const receiptModeSchema = z.enum([PaymentMode.CASH, PaymentMode.UPI, PaymentMode.BANK]);

const amountSchema = z.coerce
  .number()
  .positive('Enter an amount greater than zero.')
  .max(99_999_999.99, 'That amount is larger than this shop can record.')
  // numeric(14,2) — anything finer is a typo, not a rupee value.
  .refine((v) => Math.round(v * 100) / 100 === v, 'Amounts go up to two decimal places.');

export const recordPaymentSchema = z.object({
  customerId: z.string().uuid('Pick a valid customer.'),
  amount: amountSchema,
  paymentMode: receiptModeSchema,
  note: z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
  /**
   * Settle this bill first; whatever is left flows to the customer's other
   * unpaid bills oldest-first. Omit to allocate purely oldest-first.
   */
  refBillId: z.string().uuid('Pick a valid bill.').optional(),
});

export const recordNoteSchema = z.object({
  customerId: z.string().uuid('Pick a valid customer.'),
  /** DEBIT raises what the customer owes; CREDIT lowers it. */
  type: z.nativeEnum(NoteType),
  amount: amountSchema,
  /**
   * Required, and not defaulted. A note is the one entry with no bill and no
   * receipt behind it — without a reason it is indistinguishable from an
   * unexplained adjustment to the shop's books.
   */
  reason: z
    .string()
    .trim()
    .min(3, 'Say what this note is for.')
    .max(300, 'Keep the reason under 300 characters.'),
  refBillId: z.string().uuid('Pick a valid bill.').optional(),
});

export const statementQuerySchema = paginationQuerySchema.extend({
  /** `asc` reads the khata the way a paper book does: oldest entry first. */
  sort: z.enum(['asc', 'desc']).default('desc'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RecordNoteInput = z.infer<typeof recordNoteSchema>;
export type StatementQuery = z.infer<typeof statementQuerySchema>;
