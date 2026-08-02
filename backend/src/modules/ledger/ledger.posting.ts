import { LedgerEntryType, type LedgerEntry, type PaymentMode } from '@prisma/client';
import { Decimal } from 'decimal.js';
import type { PrismaClientOrTx } from '../../config/prisma';
import { badRequest, conflict, creditLimitExceeded, notFound } from '../../utils/errors';

/**
 * ── One source of truth for what a customer owes ─────────────────────────
 *
 * `ledger_entries` is the book; `customers.outstanding` is the running total on
 * its last line. Every rupee of that total must be explained by an entry, so
 * NOTHING may move the balance except `postLedgerEntry` — not billing, not the
 * payment endpoint, not a note. This mirrors how `stock_movements` and
 * `products.currentStock` are kept in step by the stock module.
 *
 * The balance is moved by a raw UPDATE that returns the committed value, and
 * `balanceAfter` is written from what came back. That matters: the previous
 * inline version in `bills.service` read `customer.outstanding` *before*
 * opening the transaction and added to that number, so two staff recording a
 * credit sale and a payment for the same customer at the same instant could
 * each write a `balanceAfter` computed from a balance that no longer existed.
 * Reading the value out of the UPDATE itself removes that window entirely.
 */

/**
 * Direction is a property of the entry type, never of the sign of an input.
 * Callers always pass a positive `amount`; this table decides which way it
 * moves the balance, so no endpoint can invert a payment by passing −500.
 */
const RAISES_OUTSTANDING: Record<LedgerEntryType, boolean> = {
  [LedgerEntryType.OPENING]: true,
  [LedgerEntryType.CREDIT_SALE]: true,
  [LedgerEntryType.DEBIT_NOTE]: true,
  [LedgerEntryType.PAYMENT]: false,
  [LedgerEntryType.CREDIT_NOTE]: false,
};

export const raisesOutstanding = (type: LedgerEntryType): boolean => RAISES_OUTSTANDING[type];

export interface PostLedgerEntryInput {
  customerId: string;
  type: LedgerEntryType;
  /** Always positive. The type decides the direction — see `RAISES_OUTSTANDING`. */
  amount: number;
  narration?: string | null;
  /** PAYMENT rows only. */
  paymentMode?: PaymentMode | null;
  billId?: string | null;
  paymentId?: string | null;
  noteId?: string | null;
  /** The signed-in user behind the entry. Null only for system-generated rows. */
  createdById: string | null;
  entryDate?: Date;
}

export interface PostedEntry {
  entry: LedgerEntry;
  /** The balance Postgres committed — the same value written to the entry. */
  balanceAfter: number;
}

/**
 * Appends one ledger row and moves `customers.outstanding` by the same amount,
 * inside the caller's transaction. Must never be called outside one.
 */
export async function postLedgerEntry(
  tx: PrismaClientOrTx,
  input: PostLedgerEntryInput,
): Promise<PostedEntry> {
  const amount = new Decimal(input.amount).toDecimalPlaces(2);
  if (amount.lte(0)) throw badRequest('The amount must be greater than zero.');

  const raises = RAISES_OUTSTANDING[input.type];
  const delta = raises ? amount : amount.neg();

  // Bound as text and cast, not as a JS float: `numeric + float8` in Postgres
  // resolves to double precision, which is the one arithmetic that must never
  // touch money.
  const rows = await tx.$queryRaw<{ outstanding: unknown }[]>`
    UPDATE customers
       SET outstanding = outstanding + ${delta.toFixed(2)}::numeric,
           "updatedAt" = now()
     WHERE id = ${input.customerId} AND "deletedAt" IS NULL
    RETURNING outstanding
  `;
  if (rows.length === 0) throw notFound('That customer does not exist.');

  const balanceAfter = new Decimal(String(rows[0]!.outstanding)).toDecimalPlaces(2);

  const entry = await tx.ledgerEntry.create({
    data: {
      customerId: input.customerId,
      type: input.type,
      debit: raises ? amount.toNumber() : 0,
      credit: raises ? 0 : amount.toNumber(),
      balanceAfter: balanceAfter.toNumber(),
      narration: input.narration ?? null,
      paymentMode: input.paymentMode ?? null,
      billId: input.billId ?? null,
      paymentId: input.paymentId ?? null,
      noteId: input.noteId ?? null,
      createdById: input.createdById,
      ...(input.entryDate ? { entryDate: input.entryDate } : {}),
    },
  });

  return { entry, balanceAfter: balanceAfter.toNumber() };
}

export interface CreditLimitCheck {
  creditLimit: number;
  outstanding: number;
  /** What the balance would become if this sale went through. */
  projected: number;
  exceedsBy: number;
}

/**
 * A `creditLimit` of 0 means "no limit set", not "no credit allowed" — that is
 * how the column already defaults, and treating 0 as a hard block would refuse
 * every credit sale in a shop that has never filled the field in.
 */
export function checkCreditLimit(
  customer: { creditLimit: unknown; outstanding: unknown },
  addedAmount: number,
): CreditLimitCheck {
  const creditLimit = new Decimal(String(customer.creditLimit)).toDecimalPlaces(2);
  const outstanding = new Decimal(String(customer.outstanding)).toDecimalPlaces(2);
  const projected = outstanding.add(addedAmount).toDecimalPlaces(2);
  const exceedsBy = creditLimit.gt(0) ? Decimal.max(0, projected.sub(creditLimit)) : new Decimal(0);

  return {
    creditLimit: creditLimit.toNumber(),
    outstanding: outstanding.toNumber(),
    projected: projected.toNumber(),
    exceedsBy: exceedsBy.toDecimalPlaces(2).toNumber(),
  };
}

/**
 * Throws `CREDIT_LIMIT_EXCEEDED` when a credit sale would push the customer
 * past their limit. The message names all three figures because the person
 * hearing it is standing at the counter with the customer in front of them.
 */
export function assertWithinCreditLimit(
  customer: { name: string; creditLimit: unknown; outstanding: unknown },
  addedAmount: number,
): CreditLimitCheck {
  const check = checkCreditLimit(customer, addedAmount);
  if (check.exceedsBy > 0) {
    throw creditLimitExceeded(
      `${customer.name} already owes Rs ${check.outstanding.toFixed(2)}. This sale would take them to ` +
        `Rs ${check.projected.toFixed(2)}, which is Rs ${check.exceedsBy.toFixed(2)} over their ` +
        `Rs ${check.creditLimit.toFixed(2)} limit.`,
    );
  }
  return check;
}

/**
 * Reduces a bill's outstanding amount and re-derives its payment status, in one
 * statement. The `dueAmount >= amount` guard is the atomicity boundary — two
 * receipts allocated against the same bill at the same instant cannot both
 * succeed and drive it negative.
 */
export async function applyToBillDue(
  tx: PrismaClientOrTx,
  billId: string,
  amount: number,
): Promise<{ dueAmount: number; paidAmount: number }> {
  const value = new Decimal(amount).toDecimalPlaces(2).toFixed(2);

  const rows = await tx.$queryRaw<{ dueAmount: unknown; paidAmount: unknown }[]>`
    UPDATE bills
       SET "dueAmount"  = "dueAmount" - ${value}::numeric,
           "paidAmount" = "paidAmount" + ${value}::numeric,
           "paymentStatus" = CASE
             WHEN "dueAmount" - ${value}::numeric <= 0 THEN 'PAID'::"PaymentStatus"
             ELSE 'PARTIAL'::"PaymentStatus"
           END,
           "updatedAt" = now()
     WHERE id = ${billId} AND "dueAmount" >= ${value}::numeric
    RETURNING "dueAmount", "paidAmount"
  `;
  if (rows.length === 0) {
    throw conflict('That bill was settled by someone else while this was being recorded. Check it and try again.');
  }

  return {
    dueAmount: new Decimal(String(rows[0]!.dueAmount)).toDecimalPlaces(2).toNumber(),
    paidAmount: new Decimal(String(rows[0]!.paidAmount)).toDecimalPlaces(2).toNumber(),
  };
}
