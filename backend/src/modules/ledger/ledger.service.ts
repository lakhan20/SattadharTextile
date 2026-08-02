import {
  AuditAction,
  BillStatus,
  LedgerEntryType,
  NoteType,
  type Customer,
  type PaymentMode,
  type Prisma,
  Role,
} from '@prisma/client';
import type { Request } from 'express';
import { Decimal } from 'decimal.js';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import { whatsAppLink } from '../../utils/phone';
import { getShopSettings } from '../../utils/shopSettings';
import { getAgeingReport, getOutstandingReport, type AgeingResult, type OutstandingResult } from '../reports/reports.service';
import { nextDocNumber } from './ledger.numbering';
import { applyToBillDue, postLedgerEntry, raisesOutstanding } from './ledger.posting';
import type { RecordNoteInput, RecordPaymentInput, StatementQuery } from './ledger.schema';

interface Actor {
  id: string;
  role: Role;
}

const money = (value: unknown): number => new Decimal(String(value)).toDecimalPlaces(2).toNumber();

// ── Serialisation ─────────────────────────────────────────────────────────

/**
 * The API speaks in a positive `amount` plus a `direction`, while the table
 * stores debit and credit columns. Both are sent: `amount`/`direction` is what
 * a statement row renders, and the raw columns keep the response auditable
 * against the database without a second request.
 */
export type LedgerDirection = 'DEBIT' | 'CREDIT';

export interface LedgerEntryResponse {
  id: string;
  type: LedgerEntryType;
  /** DEBIT raised the balance, CREDIT lowered it. */
  direction: LedgerDirection;
  /** Always positive. */
  amount: number;
  debit: number;
  credit: number;
  balanceAfter: number;
  note: string | null;
  paymentMode: PaymentMode | null;
  billId: string | null;
  billNumber: string | null;
  paymentId: string | null;
  receiptNumber: string | null;
  noteId: string | null;
  noteNumber: string | null;
  entryDate: string;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
}

const ENTRY_INCLUDE = {
  bill: { select: { billNumber: true } },
  payment: { select: { receiptNumber: true } },
  note: { select: { noteNumber: true } },
  createdBy: { select: { name: true } },
} as const;

type EntryWithRelations = Prisma.LedgerEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

function serializeEntry(entry: EntryWithRelations): LedgerEntryResponse {
  const debit = money(entry.debit);
  const credit = money(entry.credit);
  const direction: LedgerDirection = raisesOutstanding(entry.type) ? 'DEBIT' : 'CREDIT';

  return {
    id: entry.id,
    type: entry.type,
    direction,
    amount: direction === 'DEBIT' ? debit : credit,
    debit,
    credit,
    balanceAfter: money(entry.balanceAfter),
    note: entry.narration,
    paymentMode: entry.paymentMode,
    billId: entry.billId,
    billNumber: entry.bill?.billNumber ?? null,
    paymentId: entry.paymentId,
    receiptNumber: entry.payment?.receiptNumber ?? null,
    noteId: entry.noteId,
    noteNumber: entry.note?.noteNumber ?? null,
    entryDate: entry.entryDate.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    createdById: entry.createdById,
    createdByName: entry.createdBy?.name ?? null,
  };
}

async function findCustomerOrThrow(id: string): Promise<Customer> {
  const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
  if (!customer) throw notFound('That customer does not exist.');
  return customer;
}

// ── POST /ledger/payment ──────────────────────────────────────────────────

export interface PaymentAllocationResponse {
  billId: string;
  billNumber: string;
  billDate: string;
  amount: number;
  /** What is still owed on that bill after this receipt. */
  dueAfter: number;
}

export interface RecordPaymentResult {
  paymentId: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMode: PaymentMode;
  /** The customer's balance after the receipt — negative means they are in credit. */
  balanceAfter: number;
  previousBalance: number;
  allocations: PaymentAllocationResponse[];
  /**
   * Received but not attributable to any open bill: an advance, or a payment
   * against an opening balance that predates the app.
   */
  unallocated: number;
  entry: LedgerEntryResponse;
}

/**
 * Records money received against a khata.
 *
 * Two books move together and must not drift:
 *   · the customer balance, via `postLedgerEntry`;
 *   · the per-bill `dueAmount`, allocated oldest-first.
 *
 * The second is not optional bookkeeping. `/ledger/ageing` buckets by bill
 * date using `bills.dueAmount`, because that is the only column that says
 * *which* sale is still owed — a customer-level balance cannot be aged. If a
 * receipt lowered the balance without touching the bills behind it, every
 * settled sale would sit in the 60+ bucket for good.
 */
export async function recordPayment(
  input: RecordPaymentInput,
  actor: Actor,
  req: Request,
): Promise<RecordPaymentResult> {
  const customer = await findCustomerOrThrow(input.customerId);
  if (!customer.isActive) throw badRequest('That customer is inactive.');

  if (input.refBillId) {
    const bill = await prisma.bill.findUnique({
      where: { id: input.refBillId },
      select: { customerId: true, status: true },
    });
    if (!bill) throw notFound('That bill does not exist.');
    if (bill.customerId !== customer.id) throw badRequest('That bill belongs to a different customer.');
    if (bill.status !== BillStatus.FINAL) throw badRequest('That bill is not a final bill.');
  }

  const previousBalance = money(customer.outstanding);

  const result = await prisma.$transaction(async (tx) => {
    const receiptNumber = await nextDocNumber(tx, 'RCPT');

    const payment = await tx.payment.create({
      data: {
        receiptNumber,
        customerId: customer.id,
        amount: input.amount,
        mode: input.paymentMode,
        notes: input.note ?? null,
        receivedById: actor.id,
      },
    });

    // Oldest first, so the money lands on the debt that has been waiting
    // longest — which is also what makes the ageing buckets drain in order.
    const openBills = await tx.bill.findMany({
      where: { customerId: customer.id, status: BillStatus.FINAL, dueAmount: { gt: 0 } },
      orderBy: { billDate: 'asc' },
      select: { id: true, billNumber: true, billDate: true, dueAmount: true },
    });

    // A named bill jumps the queue — the customer said what they were paying
    // for, and the shop should honour that over pure FIFO.
    const ordered = input.refBillId
      ? [...openBills.filter((b) => b.id === input.refBillId), ...openBills.filter((b) => b.id !== input.refBillId)]
      : openBills;

    let remaining = new Decimal(input.amount).toDecimalPlaces(2);
    const allocations: PaymentAllocationResponse[] = [];

    for (const bill of ordered) {
      if (remaining.lte(0)) break;
      const due = new Decimal(String(bill.dueAmount)).toDecimalPlaces(2);
      const applied = Decimal.min(remaining, due).toDecimalPlaces(2);
      if (applied.lte(0)) continue;

      const { dueAmount } = await applyToBillDue(tx, bill.id, applied.toNumber());
      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, billId: bill.id, amount: applied.toNumber() },
      });

      allocations.push({
        billId: bill.id,
        billNumber: bill.billNumber,
        billDate: bill.billDate.toISOString(),
        amount: applied.toNumber(),
        dueAfter: dueAmount,
      });
      remaining = remaining.sub(applied);
    }

    const narration =
      input.note?.trim() ||
      (allocations.length > 0
        ? `Payment received — ${receiptNumber} (${allocations.map((a) => a.billNumber).join(', ')})`
        : `Payment received — ${receiptNumber}`);

    const posted = await postLedgerEntry(tx, {
      customerId: customer.id,
      type: LedgerEntryType.PAYMENT,
      amount: input.amount,
      narration,
      paymentMode: input.paymentMode,
      // The named bill, when there is one — so the statement row links back to
      // what the customer thought they were settling.
      billId: input.refBillId ?? allocations[0]?.billId ?? null,
      paymentId: payment.id,
      createdById: actor.id,
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Payment',
      entityId: payment.id,
      after: {
        receiptNumber,
        customerId: customer.id,
        amount: input.amount,
        mode: input.paymentMode,
        previousBalance,
        balanceAfter: posted.balanceAfter,
        allocations,
      },
      req,
      tx,
    });

    const entry = await tx.ledgerEntry.findUniqueOrThrow({
      where: { id: posted.entry.id },
      include: ENTRY_INCLUDE,
    });

    return {
      paymentId: payment.id,
      receiptNumber,
      customerId: customer.id,
      customerName: customer.name,
      amount: money(input.amount),
      paymentMode: input.paymentMode,
      balanceAfter: posted.balanceAfter,
      previousBalance,
      allocations,
      unallocated: remaining.toDecimalPlaces(2).toNumber(),
      entry: serializeEntry(entry),
    };
  });

  return result;
}

// ── POST /ledger/note ─────────────────────────────────────────────────────

export interface RecordNoteResult {
  noteId: string;
  noteNumber: string;
  type: NoteType;
  customerId: string;
  customerName: string;
  amount: number;
  reason: string;
  balanceAfter: number;
  previousBalance: number;
  /** Set when a CREDIT note was applied against a named bill's due amount. */
  billDueAfter: number | null;
  entry: LedgerEntryResponse;
}

/**
 * ADMIN-only. A debit note charges the customer more (a short payment
 * recovered, a delivery charge); a credit note forgives part of what they owe
 * (returned cloth, a rate correction after the bill was printed).
 */
export async function recordNote(input: RecordNoteInput, actor: Actor, req: Request): Promise<RecordNoteResult> {
  const customer = await findCustomerOrThrow(input.customerId);

  if (input.refBillId) {
    const bill = await prisma.bill.findUnique({
      where: { id: input.refBillId },
      select: { customerId: true, status: true },
    });
    if (!bill) throw notFound('That bill does not exist.');
    if (bill.customerId !== customer.id) throw badRequest('That bill belongs to a different customer.');
    if (bill.status !== BillStatus.FINAL) throw badRequest('That bill is not a final bill.');
  }

  const previousBalance = money(customer.outstanding);
  const isCredit = input.type === NoteType.CREDIT;

  return prisma.$transaction(async (tx) => {
    const noteNumber = await nextDocNumber(tx, isCredit ? 'CN' : 'DN');

    const note = await tx.creditDebitNote.create({
      data: {
        noteNumber,
        type: input.type,
        customerId: customer.id,
        billId: input.refBillId ?? null,
        amount: input.amount,
        reason: input.reason,
        createdById: actor.id,
      },
    });

    // A credit note against a named bill reduces that bill's due, so the
    // ageing report stops chasing money the shop has written off. A note with
    // no bill behind it cannot be aged — it lands in the ageing report's
    // `unbucketed` figure, which is exactly what that field is for.
    let billDueAfter: number | null = null;
    if (isCredit && input.refBillId) {
      const bill = await tx.bill.findUniqueOrThrow({
        where: { id: input.refBillId },
        select: { dueAmount: true },
      });
      const applied = Decimal.min(new Decimal(input.amount), new Decimal(String(bill.dueAmount)));
      if (applied.gt(0)) {
        billDueAfter = (await applyToBillDue(tx, input.refBillId, applied.toDecimalPlaces(2).toNumber())).dueAmount;
      } else {
        billDueAfter = money(bill.dueAmount);
      }
    }

    const posted = await postLedgerEntry(tx, {
      customerId: customer.id,
      type: isCredit ? LedgerEntryType.CREDIT_NOTE : LedgerEntryType.DEBIT_NOTE,
      amount: input.amount,
      narration: `${noteNumber} — ${input.reason}`,
      billId: input.refBillId ?? null,
      noteId: note.id,
      createdById: actor.id,
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'CreditDebitNote',
      entityId: note.id,
      after: {
        noteNumber,
        type: input.type,
        customerId: customer.id,
        amount: input.amount,
        reason: input.reason,
        previousBalance,
        balanceAfter: posted.balanceAfter,
      },
      req,
      tx,
    });

    const entry = await tx.ledgerEntry.findUniqueOrThrow({
      where: { id: posted.entry.id },
      include: ENTRY_INCLUDE,
    });

    return {
      noteId: note.id,
      noteNumber,
      type: input.type,
      customerId: customer.id,
      customerName: customer.name,
      amount: money(input.amount),
      reason: input.reason,
      balanceAfter: posted.balanceAfter,
      previousBalance,
      billDueAfter,
      entry: serializeEntry(entry),
    };
  });
}

// ── GET /ledger/customer/:customerId ──────────────────────────────────────

export interface KhataCustomer {
  id: string;
  name: string;
  phone: string;
  type: Customer['type'];
  creditLimit: number;
  /** What they owe right now. Negative means the shop holds their money. */
  outstanding: number;
  /** How much more they may take on credit. Null when no limit is set. */
  availableCredit: number | null;
  isActive: boolean;
}

export interface KhataStatement {
  customer: KhataCustomer;
  /**
   * The balance carried into the shop's books before any entry existed — the
   * `openingBalance` on the customer master, not the balance before this page.
   * Per-row `balanceAfter` already gives the running figure, so a page of the
   * statement is readable on its own without re-deriving anything.
   */
  openingBalance: number;
  /** Across the whole khata, not just this page. */
  totals: { debit: number; credit: number; entryCount: number };
  entries: LedgerEntryResponse[];
  pagination: PaginationMeta;
  sort: 'asc' | 'desc';
}

/**
 * One customer's khata. Open to STAFF: they need it at the counter to answer
 * "how much do I owe?" before taking a payment. Shop-wide figures are a
 * different question and live behind ADMIN — see `ledger.routes`.
 */
export async function getCustomerStatement(
  customerId: string,
  query: StatementQuery,
  _actor: Actor,
): Promise<KhataStatement> {
  const customer = await findCustomerOrThrow(customerId);
  const { page, pageSize, sort, from, to } = query;

  const where: Prisma.LedgerEntryWhereInput = {
    customerId,
    ...(from || to
      ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [entries, total, sums] = await prisma.$transaction([
    prisma.ledgerEntry.findMany({
      where,
      // Ordered by posting time, not entryDate: two entries made on the same
      // day must read back in the order they were actually written, or the
      // running balance column appears to jump backwards.
      orderBy: [{ createdAt: sort }, { id: sort }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ENTRY_INCLUDE,
    }),
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.aggregate({ where: { customerId }, _sum: { debit: true, credit: true }, _count: true }),
  ]);

  const creditLimit = money(customer.creditLimit);
  const outstanding = money(customer.outstanding);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
      creditLimit,
      outstanding,
      availableCredit:
        creditLimit > 0 ? new Decimal(creditLimit).sub(outstanding).toDecimalPlaces(2).toNumber() : null,
      isActive: customer.isActive,
    },
    openingBalance: money(customer.openingBalance),
    totals: {
      debit: money(sums._sum.debit ?? 0),
      credit: money(sums._sum.credit ?? 0),
      entryCount: sums._count,
    },
    entries: entries.map(serializeEntry),
    pagination: buildPaginationMeta(page, pageSize, total),
    sort,
  };
}

// ── GET /ledger/outstanding · GET /ledger/ageing ──────────────────────────

/**
 * Both delegate to the reports module rather than re-deriving the figures.
 *
 * A second query answering "who owes what" would eventually disagree with the
 * first, and the shop would have no way to tell which number to believe. The
 * khata screens and the outstanding report are two views of one answer.
 */
export const getOutstandingList = (): Promise<OutstandingResult> => getOutstandingReport();

export const getAgeing = (): Promise<AgeingResult> => getAgeingReport();

// ── POST /ledger/reminder/:customerId ─────────────────────────────────────

export interface ReminderResult {
  customerId: string;
  customerName: string;
  phone: string;
  outstanding: number;
  message: string;
  /** Opened with `Linking.openURL` — click-to-chat, no WhatsApp API account. */
  whatsappUrl: string;
}

/**
 * Builds the reminder; it does not send it. The shopkeeper opens WhatsApp with
 * the message already typed and decides whether to press send — which is both
 * the polite way to chase a regular customer and the only way to do this
 * without a Business API account.
 */
export async function buildPaymentReminder(customerId: string): Promise<ReminderResult> {
  const customer = await findCustomerOrThrow(customerId);
  const outstanding = money(customer.outstanding);

  if (outstanding <= 0) {
    throw badRequest(`${customer.name} has nothing outstanding. There is no reminder to send.`);
  }
  if (!customer.phone.trim()) {
    throw badRequest(`There is no phone number on file for ${customer.name}.`);
  }

  const shop = await getShopSettings();
  const message =
    `Namaste ${customer.name}, this is a gentle reminder from ${shop.displayName}. ` +
    `Your outstanding balance is Rs ${outstanding.toFixed(2)}. ` +
    `Kindly arrange the payment at your convenience. Thank you for your continued business.`;

  return {
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    outstanding,
    message,
    whatsappUrl: whatsAppLink(customer.phone, message),
  };
}
