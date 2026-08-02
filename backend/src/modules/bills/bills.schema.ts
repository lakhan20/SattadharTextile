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
    /** PDF language. Only 'en' is implemented; 'gu' is accepted for forward-compat. */
    lang: z.enum(['en', 'gu']).default('en'),
    items: z.array(billLineItemSchema).min(1, 'At least one line item is required.'),
  })
  .refine((data) => !!data.customerId || !!data.walkInName, {
    message: 'Provide a customerId or a walk-in customer name.',
    path: ['customerId'],
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
export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;
export type SendBillInput = z.infer<typeof sendBillSchema>;
export type PdfQuery = z.infer<typeof pdfQuerySchema>;
