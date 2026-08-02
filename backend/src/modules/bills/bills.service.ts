import fs from 'node:fs';
import path from 'node:path';
import {
  AuditAction,
  BillingMode,
  type Bill,
  type BillItem,
  type BillStatus,
  CustomerType,
  DiscountType,
  DispatchChannel,
  DispatchStatus,
  LedgerEntryType,
  type PaymentMode,
  PaymentStatus,
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
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import { getShopSettings } from '../../utils/shopSettings';
import { generateInvoicePdfFile, type InvoiceLang } from '../../pdf/invoice.pdf';
import { calculateBill, type BillLineInput } from './bills.tax';
import { nextBillNumber } from './bills.numbering';
import type { CreateBillInput, ListBillsQuery, SendBillInput } from './bills.schema';

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
  pdfPathEn: string | null;
  pdfPathGu: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  items?: BillItemResponse[];
  itemCount?: number;
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
    pdfPathEn: bill.pdfPathEn,
    pdfPathGu: bill.pdfPathGu,
    createdById: bill.createdById,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
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
  if (input.paymentMode === 'CREDIT' && !input.customerId) {
    throw badRequest('Credit sales require a saved customer, not a walk-in.');
  }

  const shop = await getShopSettings();

  const customer = input.customerId
    ? await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } })
    : null;
  if (input.customerId && !customer) throw notFound('That customer does not exist.');
  if (customer && !customer.isActive) throw badRequest('That customer is inactive.');

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

  const created = await prisma.$transaction(async (tx) => {
    const { fy, seq, billNumber } = await nextBillNumber(tx, input.billingMode);

    const bill = await tx.bill.create({
      data: {
        billNumber,
        billingMode: input.billingMode,
        fy,
        seq,
        customerId: customer?.id ?? null,
        walkInName: customer ? null : (input.walkInName ?? null),
        walkInPhone: customer ? null : (input.walkInPhone ?? null),
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

    if (input.paymentMode === 'CREDIT' && customer && dueAmount > 0) {
      const newOutstanding = new Decimal(customer.outstanding).add(dueAmount).toDecimalPlaces(2).toNumber();
      await tx.ledgerEntry.create({
        data: {
          customerId: customer.id,
          type: LedgerEntryType.SALE,
          debit: dueAmount,
          credit: 0,
          balanceAfter: newOutstanding,
          narration: `Credit sale — ${billNumber}`,
          billId: bill.id,
        },
      });
      await tx.customer.update({ where: { id: customer.id }, data: { outstanding: newOutstanding } });
    }

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Bill',
      entityId: bill.id,
      after: bill,
      req,
      tx,
    });

    return bill;
  });

  // Best-effort, post-commit: a PDF failure must not undo a valid sale.
  try {
    const pdfPath = await generateInvoicePdfFile({ bill: created, items: created.items, shop, lang: input.lang });
    await prisma.bill.update({ where: { id: created.id }, data: { pdfPathEn: pdfPath } });
    created.pdfPathEn = pdfPath;
  } catch (err) {
    logger.error({ err, billId: created.id }, 'Failed to generate invoice PDF');
  }

  return serializeBill(created, actor.role);
}

export interface ListBillsResult {
  items: BillResponse[];
  pagination: PaginationMeta;
}

export async function listBills(query: ListBillsQuery, actor: Actor): Promise<ListBillsResult> {
  const { page, pageSize, customerId, billingMode, dateFrom, dateTo } = query;

  const where = {
    ...(actor.role !== Role.ADMIN ? { createdById: actor.id } : {}),
    ...(customerId ? { customerId } : {}),
    ...(billingMode ? { billingMode } : {}),
    ...(dateFrom || dateTo
      ? { billDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.bill.findMany({
      where,
      orderBy: { billDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { items: true } } },
    }),
    prisma.bill.count({ where }),
  ]);

  return {
    items: items.map((b) => serializeBill(b, actor.role)),
    pagination: buildPaginationMeta(page, pageSize, total),
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

async function ensureBillPdf(bill: Bill & { items: BillItem[] }): Promise<string> {
  if (bill.pdfPathEn && fs.existsSync(path.resolve(process.cwd(), bill.pdfPathEn))) {
    return bill.pdfPathEn;
  }
  const shop = await getShopSettings();
  const pdfPath = await generateInvoicePdfFile({ bill, items: bill.items, shop, lang: 'en' });
  await prisma.bill.update({ where: { id: bill.id }, data: { pdfPathEn: pdfPath } });
  return pdfPath;
}

export async function getBillPdfPath(
  id: string,
  actor: Actor,
  req: Request,
  lang: InvoiceLang,
): Promise<{ absolutePath: string; fileName: string }> {
  if (lang === 'gu') throw badRequest('Gujarati invoices are not available yet.');

  const bill = await findBillOrThrow(id);
  assertCanAccessOwnedBy(req, bill.createdById);

  const relativePath = await ensureBillPdf(bill);
  return { absolutePath: path.resolve(process.cwd(), relativePath), fileName: path.basename(relativePath) };
}

function normalisePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export interface SendBillResult {
  whatsappUrl: string;
  message: string;
  pdfPath: string;
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

  const relativePath = await ensureBillPdf(bill);
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

  const whatsappUrl = `https://wa.me/${normalisePhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`;

  await prisma.billDispatch.create({
    data: {
      billId: bill.id,
      channel: DispatchChannel.WHATSAPP,
      status: DispatchStatus.QUEUED,
      toTarget: phone,
      sentById: actor.id,
    },
  });

  return { whatsappUrl, message, pdfPath: relativePath };
}
