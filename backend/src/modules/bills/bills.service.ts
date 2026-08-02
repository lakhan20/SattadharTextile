import {
  AuditAction,
  BillingMode,
  type Bill,
  type BillItem,
  BillStatus,
  CustomerType,
  DiscountType,
  DispatchChannel,
  DispatchStatus,
  LedgerEntryType,
  type PaymentMode,
  PaymentStatus,
  Prisma,
  Role,
  StockMovementType,
  TaxType,
  Unit,
} from '@prisma/client';
import type { Request } from 'express';
import { Decimal } from 'decimal.js';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { assertCanAccessOwnedBy } from '../../middleware/rbac';
import { badRequest, conflict, creditLimitExceeded, forbidden, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import { toWhatsAppNumber } from '../../utils/phone';
import { getShopSettings } from '../../utils/shopSettings';
import { resolveRange } from '../reports/reports.period';
import { assertWithinCreditLimit, postLedgerEntry } from '../ledger/ledger.posting';
import { findActiveByPhone, resolveOrCreateByPhone } from '../customers/customers.service';
import type { InvoiceLang, InvoicePdfData } from '../../pdf/invoice.pdf';
import { calculateBill, type BillLineInput } from './bills.tax';
import { nextBillNumber } from './bills.numbering';
import type {
  CreateBillInput,
  ListBillsQuery,
  ListRevisionsQuery,
  SendBillInput,
  UpdateBillInput,
} from './bills.schema';

export interface BillItemResponse {
  id: string;
  productId: string;
  productName: string;
  hsnCode: string | null;
  colour: string | null;
  unit: Unit;
  qty: number;
  rate: number;
  discountType: DiscountType | null;
  discountValue: number;
  discountAmount: number;
  taxableValue: number;
  gstPercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
  /** ADMIN-only. */
  costPriceSnapshot?: number;
}

export interface BillResponse {
  id: string;
  billNumber: string;
  billingMode: BillingMode;
  fy: string;
  seq: number;
  customerId: string | null;
  walkInName: string | null;
  walkInPhone: string | null;
  billDate: string;
  customerNameSnapshot: string | null;
  customerGstin: string | null;
  placeOfSupplyState: string;
  taxType: TaxType;
  subTotal: number;
  lineDiscountTotal: number;
  billDiscountType: DiscountType | null;
  billDiscountValue: number;
  billDiscountAmount: number;
  effectiveDiscountPercent: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  grandTotal: number;
  /** ADMIN-only — powers the profit-margin report, never sent to STAFF. */
  costTotal?: number;
  paymentMode: PaymentMode;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: PaymentStatus;
  status: BillStatus;
  notes: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /**
   * How many times this bill has been revised, and when it last was. Sent to
   * every viewer, not just an owner: a customer holding a printed copy that no
   * longer matches the screen is the whole reason editing needed a paper trail,
   * so the fact that a bill was rewritten must be visible on the bill itself.
   */
  revisionCount: number;
  lastRevisedAt: string | null;
  items?: BillItemResponse[];
  itemCount?: number;
  /**
   * Only on the create response. Tells the counter what happened to the
   * walk-in's phone number: a new customer was registered, or an existing one
   * was recognised. Absent when the sale was anonymous or the customer was
   * picked deliberately.
   */
  walkInCustomer?: { customerId: string; name: string; outcome: 'registered' | 'matched' };
}

function serializeBillItem(item: BillItem, viewerRole: Role): BillItemResponse {
  const response: BillItemResponse = {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    hsnCode: item.hsnCode,
    colour: item.colour,
    unit: item.unit,
    qty: Number(item.qty),
    rate: Number(item.rate),
    discountType: item.discountType,
    discountValue: Number(item.discountValue),
    discountAmount: Number(item.discountAmount),
    taxableValue: Number(item.taxableValue),
    gstPercent: Number(item.gstPercent),
    cgstAmount: Number(item.cgstAmount),
    sgstAmount: Number(item.sgstAmount),
    igstAmount: Number(item.igstAmount),
    lineTotal: Number(item.lineTotal),
  };
  if (viewerRole === Role.ADMIN) response.costPriceSnapshot = Number(item.costPriceSnapshot);
  return response;
}

function serializeBill(
  bill: Bill & { items?: BillItem[]; _count?: { items: number } },
  viewerRole: Role,
): BillResponse {
  const response: BillResponse = {
    id: bill.id,
    billNumber: bill.billNumber,
    billingMode: bill.billingMode,
    fy: bill.fy,
    seq: bill.seq,
    customerId: bill.customerId,
    walkInName: bill.walkInName,
    walkInPhone: bill.walkInPhone,
    billDate: bill.billDate.toISOString(),
    customerNameSnapshot: bill.customerNameSnapshot,
    customerGstin: bill.customerGstin,
    placeOfSupplyState: bill.placeOfSupplyState,
    taxType: bill.taxType,
    subTotal: Number(bill.subTotal),
    lineDiscountTotal: Number(bill.lineDiscountTotal),
    billDiscountType: bill.billDiscountType,
    billDiscountValue: Number(bill.billDiscountValue),
    billDiscountAmount: Number(bill.billDiscountAmount),
    effectiveDiscountPercent: Number(bill.effectiveDiscountPercent),
    taxableValue: Number(bill.taxableValue),
    cgstAmount: Number(bill.cgstAmount),
    sgstAmount: Number(bill.sgstAmount),
    igstAmount: Number(bill.igstAmount),
    roundOff: Number(bill.roundOff),
    grandTotal: Number(bill.grandTotal),
    paymentMode: bill.paymentMode,
    paidAmount: Number(bill.paidAmount),
    dueAmount: Number(bill.dueAmount),
    paymentStatus: bill.paymentStatus,
    status: bill.status,
    notes: bill.notes,
    createdById: bill.createdById,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    revisionCount: bill.revisionCount,
    lastRevisedAt: bill.lastRevisedAt?.toISOString() ?? null,
  };
  if (viewerRole === Role.ADMIN) response.costTotal = Number(bill.costTotal);
  if (bill.items) response.items = bill.items.map((item) => serializeBillItem(item, viewerRole));
  if (bill._count) response.itemCount = bill._count.items;
  return response;
}

interface Actor {
  id: string;
  role: Role;
  maxDiscountPercent: number;
}

export async function createBill(input: CreateBillInput, actor: Actor, req: Request): Promise<BillResponse> {
  const shop = await getShopSettings();

  let customer = input.customerId
    ? await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } })
    : null;
  if (input.customerId && !customer) throw notFound('That customer does not exist.');
  if (customer && !customer.isActive) throw badRequest('That customer is inactive.');

  /**
   * ── A walk-in who leaves a number is not a stranger ──────────────────
   *
   * A phone number is the shop's identity for a person, so a walk-in bill
   * carrying one is either a customer already on file or a customer about to
   * be. Matching happens HERE, before the rates are worked out, because the
   * match changes the arithmetic: a wholesale regular who gives their number
   * at the counter must be billed at wholesale rates, and an out-of-state
   * customer must get IGST rather than CGST+SGST. Resolving after the
   * calculation would quietly charge them the wrong price.
   *
   * Only the *match* runs here. Registering a genuinely new number happens
   * inside the bill transaction below, so a bill that fails leaves no
   * half-created customer behind.
   */
  const walkInPhone = !input.customerId ? input.walkInPhone?.trim() : undefined;
  let matchedWalkIn = false;
  if (walkInPhone) {
    const existing = await findActiveByPhone(walkInPhone);
    if (existing && existing.isActive) {
      customer = existing;
      matchedWalkIn = true;
    }
  }

  /**
   * Credit needs somebody the shop can chase, which means a phone number.
   *
   * It does NOT require the customer to have been registered beforehand: a
   * walk-in who gives a name and a number is registered as part of this sale
   * (below, inside the transaction), and the khata entry lands on that new
   * record. Forcing a separate trip to the customer form first was a workflow
   * imposed by the code, not by the shop.
   *
   * What is still refused is credit with no number at all. There would be
   * nobody to send the reminder to, and no record to carry the balance.
   */
  if (input.paymentMode === 'CREDIT' && !customer && !walkInPhone) {
    throw badRequest('A credit sale needs a phone number, so the balance has someone to sit against.');
  }
  // A newly registered walk-in is RETAIL in Gujarat — identical to the
  // assumption an anonymous walk-in already got — so nothing below changes
  // for them, and no rate or tax decision depends on the registration.

  // Walk-ins are assumed local (in-state) — there is no address to compare.
  const customerState = customer?.state ?? shop.state;
  const taxType =
    input.billingMode === BillingMode.NON_GST
      ? TaxType.NONE
      : customerState.trim().toLowerCase() === shop.state.trim().toLowerCase()
        ? TaxType.CGST_SGST
        : TaxType.IGST;

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, deletedAt: null } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const lineInputs: BillLineInput[] = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw notFound(`Product ${line.productId} does not exist.`);
    if (!product.isActive) throw badRequest(`${product.name} is inactive and cannot be billed.`);

    if (product.unit === Unit.PIECE && !Number.isInteger(line.qty)) {
      throw badRequest(`${product.name} is sold by piece — quantity must be a whole number.`);
    }
    if (product.unit === Unit.METER) {
      const rounded = Math.round(line.qty * 1000) / 1000;
      if (Math.abs(rounded - line.qty) > 1e-9) {
        throw badRequest(`${product.name} quantity supports up to 3 decimal places.`);
      }
    }

    const defaultRate =
      customer?.type === CustomerType.WHOLESALE ? Number(product.wholesaleRate) : Number(product.retailRate);

    return {
      productId: product.id,
      qty: line.qty,
      rate: line.rate ?? defaultRate,
      discountType: line.discountType,
      discountValue: line.discountValue,
      productName: product.name,
      hsnCode: product.hsnCode,
      colour: product.colour,
      unit: product.unit,
      gstPercent: Number(product.gstPercent),
      costPrice: Number(product.costPrice),
    };
  });

  const calc = calculateBill(lineInputs, {
    billingMode: input.billingMode,
    taxType,
    billDiscountType: input.billDiscountType,
    billDiscountValue: input.billDiscountValue,
    roundOffEnabled: shop.roundOffEnabled,
  });

  if (calc.effectiveDiscountPercent > actor.maxDiscountPercent + 0.0001) {
    throw forbidden(
      `This discount (${calc.effectiveDiscountPercent.toFixed(2)}%) exceeds your limit of ${actor.maxDiscountPercent}%. Ask the shop owner to raise it.`,
    );
  }

  const paidAmount = input.paidAmount ?? (input.paymentMode === 'CREDIT' ? 0 : calc.grandTotal);
  const dueAmountDecimal = new Decimal(calc.grandTotal).sub(paidAmount);
  const dueAmount = Math.max(0, dueAmountDecimal.toDecimalPlaces(2).toNumber());
  const paymentStatus =
    dueAmount <= 0 ? PaymentStatus.PAID : paidAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID;

  // Only the owner may knowingly sell past a customer's limit, and only by
  // saying so explicitly. A staff account cannot set this flag.
  const overrideCreditLimit = input.overrideCreditLimit === true && actor.role === Role.ADMIN;
  const wantsKhata = input.paymentMode === 'CREDIT' && dueAmount > 0;

  // Checked here so the sale is refused before any stock moves — the person at
  // the counter finds out immediately, not after the bill has half happened.
  // Only possible for a customer already on file; one registered during this
  // sale starts at zero, so there is nothing yet to exceed. Either way the
  // authoritative check runs inside the transaction, against the balance
  // Postgres actually commits.
  if (wantsKhata && !overrideCreditLimit && customer) {
    assertWithinCreditLimit(customer, dueAmount);
  }

  const created = await prisma.$transaction(async (tx) => {
    const { fy, seq, billNumber } = await nextBillNumber(tx, input.billingMode);

    // An unmatched walk-in number gets registered now, inside the transaction:
    // if anything below fails — not enough stock, a bad line — the customer
    // rolls back with the bill rather than lingering as a record of a sale
    // that never happened.
    let registeredWalkIn = false;
    if (walkInPhone && !customer) {
      const resolved = await resolveOrCreateByPhone(
        tx,
        {
          name: input.walkInName?.trim() || `Walk-in ${walkInPhone}`,
          phone: walkInPhone,
          state: customerState,
          notes: `Registered from counter sale ${billNumber}`,
        },
        actor,
        req,
      );
      customer = resolved.customer;
      registeredWalkIn = resolved.created;
    }

    const bill = await tx.bill.create({
      data: {
        billNumber,
        billingMode: input.billingMode,
        fy,
        seq,
        customerId: customer?.id ?? null,
        // Kept even once a customer is attached, whenever the sale began at
        // the counter: the bill should still record that it was a walk-in and
        // exactly what was typed, which the customer record no longer shows
        // once the owner tidies up the name. Nulled only when a customer was
        // picked deliberately, which is the pre-existing behaviour.
        walkInName: input.customerId ? null : (input.walkInName ?? null),
        walkInPhone: input.customerId ? null : (input.walkInPhone ?? null),
        customerNameSnapshot: customer?.name ?? input.walkInName ?? null,
        customerGstin: input.billingMode === BillingMode.GST ? (customer?.gstin ?? null) : null,
        placeOfSupplyState: customerState,
        taxType,
        subTotal: calc.subTotal,
        lineDiscountTotal: calc.lineDiscountTotal,
        billDiscountType: input.billDiscountType ?? null,
        billDiscountValue: input.billDiscountValue,
        billDiscountAmount: calc.billDiscountAmount,
        effectiveDiscountPercent: calc.effectiveDiscountPercent,
        taxableValue: calc.taxableValue,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        roundOff: calc.roundOff,
        grandTotal: calc.grandTotal,
        costTotal: calc.costTotal,
        paymentMode: input.paymentMode,
        paidAmount,
        dueAmount,
        paymentStatus,
        notes: input.notes ?? null,
        createdById: actor.id,
        items: {
          create: calc.lines.map((line, idx) => ({
            productId: line.productId,
            productName: line.productName,
            hsnCode: line.hsnCode,
            colour: line.colour,
            unit: line.unit,
            qty: line.qty,
            rate: line.rate,
            discountType: line.discountType,
            discountValue: line.discountValue,
            discountAmount: line.discountAmount,
            taxableValue: line.taxableValue,
            gstPercent: line.gstPercent,
            cgstAmount: line.cgstAmount,
            sgstAmount: line.sgstAmount,
            igstAmount: line.igstAmount,
            lineTotal: line.lineTotal,
            costPriceSnapshot: line.costPriceSnapshot,
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    // Stock deduction for every line, GST or estimate. The conditional UPDATE
    // (currentStock >= qty) is the atomicity boundary: two staff selling the
    // last of a product at the same instant cannot both succeed.
    for (const line of calc.lines) {
      const rows = await tx.$queryRaw<{ currentStock: Decimal }[]>`
        UPDATE products SET "currentStock" = "currentStock" - ${line.qty}, "updatedAt" = now()
        WHERE id = ${line.productId} AND "currentStock" >= ${line.qty} AND "deletedAt" IS NULL
        RETURNING "currentStock"
      `;
      if (rows.length === 0) {
        throw conflict(`Not enough stock for ${line.productName}.`);
      }
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          type: StockMovementType.SALE,
          qty: new Decimal(line.qty).neg(),
          balanceAfter: rows[0]!.currentStock,
          rate: line.rate,
          billId: bill.id,
          createdById: actor.id,
        },
      });
    }

    // A credit sale is a khata entry, so it goes through the same posting
    // helper as a payment or a note — never a direct write to
    // `customers.outstanding`. That helper moves the balance with an UPDATE …
    // RETURNING and writes `balanceAfter` from what Postgres committed, so the
    // ledger cannot record a balance that was already stale when it was read.
    // Evaluated here, not before the transaction: a walk-in registered a few
    // lines above is a perfectly good khata customer, and `customer` only
    // became non-null inside this block.
    if (wantsKhata && customer) {
      const posted = await postLedgerEntry(tx, {
        customerId: customer.id,
        type: LedgerEntryType.CREDIT_SALE,
        amount: dueAmount,
        narration: `Credit sale — ${billNumber}`,
        billId: bill.id,
        createdById: actor.id,
      });

      // The real limit check: `assertWithinCreditLimit` above ran against a
      // balance read before the transaction opened, so a concurrent credit
      // sale to the same customer could slip both past it. This one reads the
      // committed balance, and throwing here rolls the whole bill back.
      const creditLimit = Number(customer.creditLimit);
      if (!overrideCreditLimit && creditLimit > 0 && posted.balanceAfter > creditLimit) {
        throw creditLimitExceeded(
          `${customer.name} would owe Rs ${posted.balanceAfter.toFixed(2)} after this sale, which is over their ` +
            `Rs ${creditLimit.toFixed(2)} limit.`,
        );
      }
    }

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Bill',
      entityId: bill.id,
      after: { ...bill, walkInRegisteredCustomerId: registeredWalkIn ? customer?.id : undefined },
      req,
      tx,
    });

    return bill;
  });

  // No PDF is written here: `GET /bills/:id/pdf` renders one on demand from the
  // row that was just committed, so a sale never waits on pdfkit and nothing
  // has to be cleaned up later.
  const response = serializeBill(created, actor.role);
  if (walkInPhone && customer) {
    response.walkInCustomer = {
      customerId: customer.id,
      name: customer.name,
      outcome: matchedWalkIn ? 'matched' : 'registered',
    };
  }
  return response;
}

// ── Editing an issued bill ────────────────────────────────────────────────

/**
 * ── What "editing a bill" has to mean here ───────────────────────────────
 *
 * A bill is not a form the shop is still filling in. It has been printed,
 * WhatsApped, and possibly paid, and three other sets of books already point
 * at it: stock moved, the khata moved, and payments may be allocated to it. So
 * an edit cannot simply overwrite the row.
 *
 * The rule this module follows everywhere applies here too — **the ledgers are
 * append-only**:
 *
 *   · Stock is not rewritten. The difference per product is posted as new
 *     movements: a `SALE` for extra quantity going out, a `SALE_RETURN` for
 *     quantity coming back. `products.currentStock` moves through the same
 *     conditional UPDATE that guards oversell, so a revision that would take a
 *     product negative is refused exactly as a sale would be.
 *
 *   · The khata is not rewritten. The change in what is owed is posted as a
 *     new ledger entry against the same bill, so `balanceAfter` on every
 *     earlier line stays true and the statement still reconciles.
 *
 *   · The bill row itself IS updated in place — a shopkeeper expects
 *     FY27/T/00007 to stay FY27/T/00007 — but the whole previous state is
 *     copied into `bill_revisions` first, with a required reason.
 *
 * A note on GST: revising an issued tax invoice is not how GST expects
 * corrections to be made — a credit note against the original is. This is
 * built because it is what the shop asked for and it is honest about itself
 * (every version is retained and attributable), but for a filed period, a
 * credit note is the safer instrument.
 */

/** Only a FINAL bill can be revised, and only into another FINAL bill. */
function assertEditable(bill: Bill): void {
  if (bill.status === 'CANCELLED') {
    throw badRequest('This bill was cancelled. Write a new one rather than editing it.');
  }
  if (bill.status !== 'FINAL') {
    throw badRequest('Only a finalised bill can be edited.');
  }
}

interface BillChange {
  field: string;
  before: string;
  after: string;
}

/**
 * A readable account of what moved, computed at write time rather than
 * diffed later. The point is that an owner scanning the edit log can see
 * "qty on Cotton Shirting: 12 → 2" without opening two JSON blobs.
 */
function summariseChanges(
  before: Bill & { items: BillItem[] },
  after: { grandTotal: number; paymentMode: PaymentMode; paidAmount: number; dueAmount: number; notes: string | null },
  beforeLines: BillItem[],
  afterLines: { productId: string; productName: string; qty: number; rate: number; lineTotal: number }[],
): BillChange[] {
  const changes: BillChange[] = [];
  const money = (v: unknown): string => new Decimal(String(v)).toDecimalPlaces(2).toFixed(2);

  if (money(before.grandTotal) !== money(after.grandTotal)) {
    changes.push({ field: 'Total', before: money(before.grandTotal), after: money(after.grandTotal) });
  }
  if (before.paymentMode !== after.paymentMode) {
    changes.push({ field: 'Payment mode', before: before.paymentMode, after: after.paymentMode });
  }
  if (money(before.paidAmount) !== money(after.paidAmount)) {
    changes.push({ field: 'Paid', before: money(before.paidAmount), after: money(after.paidAmount) });
  }
  if (money(before.dueAmount) !== money(after.dueAmount)) {
    changes.push({ field: 'Due', before: money(before.dueAmount), after: money(after.dueAmount) });
  }
  if ((before.notes ?? '') !== (after.notes ?? '')) {
    changes.push({ field: 'Notes', before: before.notes ?? '—', after: after.notes ?? '—' });
  }

  // Line-level: keyed by product, since that is how a shopkeeper reads a bill.
  const beforeByProduct = new Map(beforeLines.map((l) => [l.productId, l]));
  const afterByProduct = new Map(afterLines.map((l) => [l.productId, l]));

  for (const [productId, line] of afterByProduct) {
    const old = beforeByProduct.get(productId);
    if (!old) {
      changes.push({ field: `Added: ${line.productName}`, before: '—', after: `${line.qty} × ${money(line.rate)}` });
      continue;
    }
    if (Number(old.qty) !== line.qty || money(old.rate) !== money(line.rate)) {
      changes.push({
        field: line.productName,
        before: `${Number(old.qty)} × ${money(old.rate)}`,
        after: `${line.qty} × ${money(line.rate)}`,
      });
    }
  }
  for (const [productId, old] of beforeByProduct) {
    if (!afterByProduct.has(productId)) {
      changes.push({
        field: `Removed: ${old.productName}`,
        before: `${Number(old.qty)} × ${money(old.rate)}`,
        after: '—',
      });
    }
  }

  return changes;
}

/** Moves a product's stock by a signed delta and records why. */
async function applyStockDelta(
  tx: Prisma.TransactionClient,
  line: { productId: string; productName: string; rate: number },
  delta: Decimal,
  billId: string,
  billNumber: string,
  actorId: string,
): Promise<void> {
  if (delta.isZero()) return;

  const outward = delta.gt(0);
  const magnitude = delta.abs();

  // Extra quantity leaving the shelf is guarded exactly as a sale is: the
  // WHERE clause is the boundary, so a revision cannot oversell.
  const rows = outward
    ? await tx.$queryRaw<{ currentStock: Decimal }[]>`
        UPDATE products SET "currentStock" = "currentStock" - ${magnitude.toFixed(3)}::numeric, "updatedAt" = now()
        WHERE id = ${line.productId} AND "currentStock" >= ${magnitude.toFixed(3)}::numeric AND "deletedAt" IS NULL
        RETURNING "currentStock"
      `
    : await tx.$queryRaw<{ currentStock: Decimal }[]>`
        UPDATE products SET "currentStock" = "currentStock" + ${magnitude.toFixed(3)}::numeric, "updatedAt" = now()
        WHERE id = ${line.productId} AND "deletedAt" IS NULL
        RETURNING "currentStock"
      `;

  if (rows.length === 0) {
    throw conflict(`Not enough stock for ${line.productName} to make that change.`);
  }

  await tx.stockMovement.create({
    data: {
      productId: line.productId,
      // SALE_RETURN is the honest type for goods coming back off a bill —
      // it already exists for exactly this, and keeps revisions distinguishable
      // from an ordinary sale in the movement ledger.
      type: outward ? StockMovementType.SALE : StockMovementType.SALE_RETURN,
      qty: outward ? magnitude.neg() : magnitude,
      balanceAfter: rows[0]!.currentStock,
      rate: line.rate,
      billId,
      reason: `Bill ${billNumber} revised`,
      createdById: actorId,
    },
  });
}

export async function updateBill(
  id: string,
  input: UpdateBillInput,
  actor: Actor,
  req: Request,
): Promise<BillResponse> {
  const existing = await prisma.bill.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw notFound('That bill does not exist.');

  // STAFF holding `bill.edit` may revise their own bills; ADMIN may revise any.
  assertCanAccessOwnedBy(req, existing.createdById);
  assertEditable(existing);

  const shop = await getShopSettings();
  const customer = existing.customerId
    ? await prisma.customer.findFirst({ where: { id: existing.customerId, deletedAt: null } })
    : null;

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, deletedAt: null } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const lineInputs: BillLineInput[] = input.items.map((line) => {
    const product = productById.get(line.productId);
    if (!product) throw notFound(`Product ${line.productId} does not exist.`);

    if (product.unit === Unit.PIECE && !Number.isInteger(line.qty)) {
      throw badRequest(`${product.name} is sold by piece — quantity must be a whole number.`);
    }
    if (product.unit === Unit.METER) {
      const rounded = Math.round(line.qty * 1000) / 1000;
      if (Math.abs(rounded - line.qty) > 1e-9) {
        throw badRequest(`${product.name} quantity supports up to 3 decimal places.`);
      }
    }

    const defaultRate =
      customer?.type === CustomerType.WHOLESALE ? Number(product.wholesaleRate) : Number(product.retailRate);

    return {
      productId: product.id,
      qty: line.qty,
      rate: line.rate ?? defaultRate,
      discountType: line.discountType,
      discountValue: line.discountValue,
      productName: product.name,
      hsnCode: product.hsnCode,
      colour: product.colour,
      unit: product.unit,
      gstPercent: Number(product.gstPercent),
      costPrice: Number(product.costPrice),
    };
  });

  // The tax treatment is the one the bill was issued under, not whatever the
  // customer's address says today — a reprint must stay faithful.
  const calc = calculateBill(lineInputs, {
    billingMode: existing.billingMode,
    taxType: existing.taxType,
    billDiscountType: input.billDiscountType,
    billDiscountValue: input.billDiscountValue,
    roundOffEnabled: shop.roundOffEnabled,
  });

  if (calc.effectiveDiscountPercent > actor.maxDiscountPercent + 0.0001) {
    throw forbidden(
      `This discount (${calc.effectiveDiscountPercent.toFixed(2)}%) exceeds your limit of ${actor.maxDiscountPercent}%. Ask the shop owner to raise it.`,
    );
  }

  const previousPaid = Number(existing.paidAmount);
  const paymentMode = input.paymentMode ?? existing.paymentMode;
  const paidAmount = input.paidAmount ?? previousPaid;

  // Money already banked against this bill cannot be edited away. Reducing the
  // total below it would mean the shop owes a refund, which is a credit note —
  // a different instrument with its own trail — not a quiet edit.
  if (new Decimal(calc.grandTotal).lt(paidAmount)) {
    throw badRequest(
      `Rs ${previousPaid.toFixed(2)} has already been received against this bill, so it cannot be revised below that. ` +
        `Raise a credit note for the difference instead.`,
    );
  }

  const dueAmount = Math.max(
    0,
    new Decimal(calc.grandTotal).sub(paidAmount).toDecimalPlaces(2).toNumber(),
  );
  const paymentStatus =
    dueAmount <= 0 ? PaymentStatus.PAID : paidAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID;

  const previousDue = Number(existing.dueAmount);
  const dueDelta = new Decimal(dueAmount).sub(previousDue).toDecimalPlaces(2);
  const overrideCreditLimit = input.overrideCreditLimit === true && actor.role === Role.ADMIN;

  const beforeSnapshot = { ...existing, items: existing.items };

  const updated = await prisma.$transaction(async (tx) => {
    // ── Stock: post the difference, never rewrite history ────────────────
    const oldQty = new Map<string, Decimal>();
    for (const item of existing.items) {
      oldQty.set(item.productId, (oldQty.get(item.productId) ?? new Decimal(0)).add(item.qty));
    }
    const newQty = new Map<string, Decimal>();
    for (const line of calc.lines) {
      newQty.set(line.productId, (newQty.get(line.productId) ?? new Decimal(0)).add(line.qty));
    }

    for (const productId of new Set([...oldQty.keys(), ...newQty.keys()])) {
      const delta = (newQty.get(productId) ?? new Decimal(0)).sub(oldQty.get(productId) ?? new Decimal(0));
      const line =
        calc.lines.find((l) => l.productId === productId) ??
        existing.items.find((i) => i.productId === productId)!;
      await applyStockDelta(
        tx,
        { productId, productName: line.productName, rate: Number(line.rate) },
        delta,
        existing.id,
        existing.billNumber,
        actor.id,
      );
    }

    // ── Lines: replaced wholesale, since the previous set is preserved in
    // the revision snapshot rather than in the live rows.
    await tx.billItem.deleteMany({ where: { billId: existing.id } });

    const bill = await tx.bill.update({
      where: { id: existing.id },
      data: {
        subTotal: calc.subTotal,
        lineDiscountTotal: calc.lineDiscountTotal,
        billDiscountType: input.billDiscountType ?? null,
        billDiscountValue: input.billDiscountValue,
        billDiscountAmount: calc.billDiscountAmount,
        effectiveDiscountPercent: calc.effectiveDiscountPercent,
        taxableValue: calc.taxableValue,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        roundOff: calc.roundOff,
        grandTotal: calc.grandTotal,
        costTotal: calc.costTotal,
        paymentMode,
        paidAmount,
        dueAmount,
        paymentStatus,
        notes: input.notes ?? existing.notes,
        revisionCount: { increment: 1 },
        lastRevisedAt: new Date(),
        items: {
          create: calc.lines.map((line, idx) => ({
            productId: line.productId,
            productName: line.productName,
            hsnCode: line.hsnCode,
            colour: line.colour,
            unit: line.unit,
            qty: line.qty,
            rate: line.rate,
            discountType: line.discountType,
            discountValue: line.discountValue,
            discountAmount: line.discountAmount,
            taxableValue: line.taxableValue,
            gstPercent: line.gstPercent,
            cgstAmount: line.cgstAmount,
            sgstAmount: line.sgstAmount,
            igstAmount: line.igstAmount,
            lineTotal: line.lineTotal,
            costPriceSnapshot: line.costPriceSnapshot,
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    // ── Khata: post the difference as its own entry ──────────────────────
    // Every earlier line's `balanceAfter` stays true, so the statement still
    // reconciles line by line. A cash bill turning into a credit one is the
    // same arithmetic: its old due was 0.
    if (existing.customerId && !dueDelta.isZero()) {
      const increased = dueDelta.gt(0);
      const posted = await postLedgerEntry(tx, {
        customerId: existing.customerId,
        type: increased ? LedgerEntryType.CREDIT_SALE : LedgerEntryType.CREDIT_NOTE,
        amount: dueDelta.abs().toNumber(),
        narration: `Bill ${existing.billNumber} revised — amount due ${increased ? 'increased' : 'reduced'}`,
        billId: existing.id,
        createdById: actor.id,
      });

      if (increased && customer && !overrideCreditLimit) {
        const creditLimit = Number(customer.creditLimit);
        if (creditLimit > 0 && posted.balanceAfter > creditLimit) {
          throw creditLimitExceeded(
            `${customer.name} would owe Rs ${posted.balanceAfter.toFixed(2)} after this change, which is over ` +
              `their Rs ${creditLimit.toFixed(2)} limit.`,
          );
        }
      }
    }

    const changes = summariseChanges(
      beforeSnapshot,
      { grandTotal: calc.grandTotal, paymentMode, paidAmount, dueAmount, notes: bill.notes },
      existing.items,
      calc.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        qty: l.qty,
        rate: l.rate,
        lineTotal: l.lineTotal,
      })),
    );

    await tx.billRevision.create({
      data: {
        billId: existing.id,
        revision: existing.revisionCount + 1,
        reason: input.reason,
        before: serialiseForLog(beforeSnapshot),
        after: serialiseForLog(bill),
        changes: changes as unknown as Prisma.InputJsonValue,
        amountDelta: new Decimal(calc.grandTotal).sub(Number(existing.grandTotal)).toDecimalPlaces(2).toNumber(),
        changedById: actor.id,
      },
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'Bill',
      entityId: existing.id,
      before: beforeSnapshot,
      after: { ...bill, revisionReason: input.reason, changes },
      req,
      tx,
    });

    return bill;
  });

  // Nothing to invalidate: the next download renders from these revised rows,
  // so a stale copy of the old figures cannot be served by mistake.
  return serializeBill(updated, actor.role);
}

/** Decimals and Dates through JSON.stringify would lose precision or type. */
function serialiseForLog(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => {
      if (v instanceof Date) return v.toISOString();
      if (Prisma.Decimal.isDecimal(v)) return v.toString();
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

export interface BillRevisionResponse {
  id: string;
  billId: string;
  billNumber: string;
  revision: number;
  reason: string;
  changes: BillChange[];
  amountDelta: number;
  changedById: string;
  changedByName: string;
  createdAt: string;
}

export interface ListRevisionsResult {
  items: BillRevisionResponse[];
  pagination: PaginationMeta;
}

/**
 * The edit log.
 *
 * With no `billId` this is the shop-wide view and is ADMIN-only at the route —
 * "who has been editing bills, and why" is a supervision question. Scoped to
 * one bill, it is open to whoever may already see that bill.
 */
export async function listBillRevisions(
  query: ListRevisionsQuery & { billId?: string },
  actor: Actor,
): Promise<ListRevisionsResult> {
  const { page, pageSize, billId, changedById, from, to } = query;

  const where: Prisma.BillRevisionWhereInput = {
    ...(billId ? { billId } : {}),
    ...(changedById ? { changedById } : {}),
    // A staff member sees their own edits, never the shop's.
    ...(actor.role !== Role.ADMIN ? { changedById: actor.id } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.billRevision.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { bill: { select: { billNumber: true } }, changedBy: { select: { name: true } } },
    }),
    prisma.billRevision.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      billId: r.billId,
      billNumber: r.bill.billNumber,
      revision: r.revision,
      reason: r.reason,
      changes: (r.changes as unknown as BillChange[]) ?? [],
      amountDelta: Number(r.amountDelta),
      changedById: r.changedById,
      changedByName: r.changedBy.name,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: buildPaginationMeta(page, pageSize, total),
  };
}

export interface ListBillsResult {
  items: BillResponse[];
  pagination: PaginationMeta;
  /**
   * Totals for the WHOLE filter, not the page in `items` — "today's bills"
   * is a question about the day, and a footer that only added up the first
   * twenty would be quietly wrong on a busy one.
   *
   * Scoped by exactly the same `where`, so a STAFF caller gets their own
   * figures and never the shop's. The staff dashboard already shows the same
   * account its own daily total, so this discloses nothing new.
   */
  summary: { billCount: number; grandTotal: number; paidTotal: number; dueTotal: number };
  /** The IST calendar dates actually queried, echoed back so the UI can label itself. */
  range: { from: string; to: string } | null;
}

export async function listBills(query: ListBillsQuery, actor: Actor): Promise<ListBillsResult> {
  const { page, pageSize, customerId, billingMode, dateFrom, dateTo } = query;

  /**
   * `dateFrom` / `dateTo` are IST *calendar dates* with `to` INCLUSIVE, the
   * way a shopkeeper means them. Comparing the raw values would use midnight
   * UTC as the upper bound, so asking for "today" would drop every bill
   * written after 05:30 IST — which is all of them.
   */
  const range = dateFrom || dateTo ? resolveRange(dateFrom, dateTo) : null;

  const where = {
    ...(actor.role !== Role.ADMIN ? { createdById: actor.id } : {}),
    ...(customerId ? { customerId } : {}),
    ...(billingMode ? { billingMode } : {}),
    // `lt` on the exclusive bound, never `lte` — the bound IS the next midnight.
    ...(range ? { billDate: { gte: range.from, lt: range.to } } : {}),
  };

  const [items, total, totals] = await prisma.$transaction([
    prisma.bill.findMany({
      where,
      orderBy: { billDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { items: true } } },
    }),
    prisma.bill.count({ where }),
    prisma.bill.aggregate({
      // A cancelled bill is not a sale, so it must not swell the day's total.
      where: { ...where, status: BillStatus.FINAL },
      _sum: { grandTotal: true, paidAmount: true, dueAmount: true },
      _count: true,
    }),
  ]);

  return {
    items: items.map((b) => serializeBill(b, actor.role)),
    pagination: buildPaginationMeta(page, pageSize, total),
    summary: {
      billCount: totals._count,
      grandTotal: Number(totals._sum.grandTotal ?? 0),
      paidTotal: Number(totals._sum.paidAmount ?? 0),
      dueTotal: Number(totals._sum.dueAmount ?? 0),
    },
    range: range ? { from: range.fromLabel, to: range.toLabel } : null,
  };
}

async function findBillOrThrow(id: string): Promise<Bill & { items: BillItem[] }> {
  const bill = await prisma.bill.findUnique({ where: { id }, include: { items: true } });
  if (!bill) throw notFound('That bill does not exist.');
  return bill;
}

export async function getBillById(id: string, actor: Actor, req: Request): Promise<BillResponse> {
  const bill = await findBillOrThrow(id);
  assertCanAccessOwnedBy(req, bill.createdById);
  return serializeBill(bill, actor.role);
}

/**
 * Gathers everything the renderer needs. Invoices are never stored — the
 * controller streams the result of this straight to the client, so a bill that
 * was revised (or a shop that changed its GSTIN) always prints as it stands now.
 */
export async function getBillPdfData(
  id: string,
  actor: Actor,
  req: Request,
  lang: InvoiceLang,
): Promise<InvoicePdfData> {
  if (lang === 'gu') throw badRequest('Gujarati invoices are not available yet.');

  const bill = await findBillOrThrow(id);
  assertCanAccessOwnedBy(req, bill.createdById);

  const shop = await getShopSettings();
  return { bill, items: bill.items, shop, lang };
}

export interface SendBillResult {
  whatsappUrl: string;
  message: string;
}

export async function sendBillStub(id: string, actor: Actor, req: Request, input: SendBillInput): Promise<SendBillResult> {
  if (input.lang === 'gu') throw badRequest('Gujarati invoices are not available yet.');

  const bill = await findBillOrThrow(id);
  assertCanAccessOwnedBy(req, bill.createdById);

  let customerPhone: string | null = bill.walkInPhone;
  if (bill.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: bill.customerId }, select: { phone: true } });
    customerPhone = customer?.phone ?? null;
  }
  const phone = input.phone ?? customerPhone;
  if (!phone) throw badRequest('No phone number on file for this bill. Pass one in the request body.');

  // The download link points at an authenticated endpoint — fine for the
  // shop's own reference, but a customer tapping it in WhatsApp will hit a
  // login wall. A public, signed share link is a future enhancement.
  const pdfUrl = `${env.PUBLIC_BASE_URL}${env.API_PREFIX}/bills/${bill.id}/pdf`;

  const docLabel = bill.billingMode === BillingMode.GST ? 'invoice' : 'estimate';
  const dueNote = Number(bill.dueAmount) > 0 ? ` Balance due: Rs ${Number(bill.dueAmount).toFixed(2)}.` : '';
  const message =
    `Hello ${bill.customerNameSnapshot ?? ''}, your ${docLabel} ${bill.billNumber} ` +
    `dated ${bill.billDate.toLocaleDateString('en-IN')} for Rs ${Number(bill.grandTotal).toFixed(2)} is ready.` +
    `${dueNote} Download: ${pdfUrl}`;

  const whatsappUrl = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;

  await prisma.billDispatch.create({
    data: {
      billId: bill.id,
      channel: DispatchChannel.WHATSAPP,
      status: DispatchStatus.QUEUED,
      toTarget: phone,
      sentById: actor.id,
    },
  });

  return { whatsappUrl, message };
}
