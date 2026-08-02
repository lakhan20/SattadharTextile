import { BillingMode, Prisma, Unit } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../../config/prisma';
import { getStockValuation, listLowStock, type LowStockResult, type StockValuationResponse } from '../stock/stock.service';
import { eachShopDay, financialYearRange, type ShopRange } from './reports.period';

/**
 * ── One source of truth ──────────────────────────────────────────────────
 *
 * Nothing in this file recalculates a total. `bills.tax.ts` worked out every
 * taxable value, CGST/SGST/IGST split, round-off and grand total once, inside
 * the bill transaction, and those numbers were written to `bills` and
 * `bill_items`. Reports SUM the stored columns and nothing else — so a report
 * can never disagree with the invoice the customer is holding.
 *
 * Two rules apply to every query below:
 *   • Only `status = 'FINAL'` bills count. A draft is not a sale and a
 *     cancelled bill is not revenue.
 *   • Money is summed in Postgres `numeric` and only converted to a JS number
 *     at the very end, at 2dp — never accumulated as a float.
 *
 * Everything here that touches cost is marked ADMIN ONLY. That is enforced by
 * the route guard, not by this layer; these functions must never be called
 * from a STAFF-reachable controller.
 */

// ── Decimal plumbing ─────────────────────────────────────────────────────

/** Raw `numeric` columns arrive as Prisma Decimals — or null from an empty SUM. */
type RawMoney = Prisma.Decimal | number | null;

const money = (value: RawMoney): number => new Decimal(value ?? 0).toDecimalPlaces(2).toNumber();
const quantity = (value: RawMoney): number => new Decimal(value ?? 0).toDecimalPlaces(3).toNumber();
const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : new Decimal(part).div(whole).mul(100).toDecimalPlaces(2).toNumber();

/**
 * The WHERE fragment every sales query shares. Built with `Prisma.sql` so the
 * optional filters stay parameterised — string interpolation into raw SQL is
 * never on the table here.
 */
function billWhere(range: ShopRange, opts: { mode?: BillingMode; staffId?: string } = {}): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`b."status" = 'FINAL'::"BillStatus"`,
    Prisma.sql`b."billDate" >= ${range.from}`,
    Prisma.sql`b."billDate" < ${range.to}`,
  ];
  if (opts.mode) clauses.push(Prisma.sql`b."billingMode" = ${opts.mode}::"BillingMode"`);
  if (opts.staffId) clauses.push(Prisma.sql`b."createdById" = ${opts.staffId}`);
  return Prisma.join(clauses, ' AND ');
}

/** SQL that renders a bill's IST calendar day as "YYYY-MM-DD". */
const IST_DAY = Prisma.sql`to_char(b."billDate" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;

// ── Shared totals ────────────────────────────────────────────────────────

export interface SalesTotals {
  billCount: number;
  /** What the shop invoiced, GST included. */
  grandTotal: number;
  /** Net of every discount, before GST — the basis for margin. */
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** CGST + SGST + IGST — what is owed to the government for the period. */
  gstCollected: number;
  discountTotal: number;
  /** Money actually taken; the rest sits on khata. */
  paidAmount: number;
  dueAmount: number;
}

interface TotalsRow {
  billCount: number;
  grandTotal: RawMoney;
  taxableValue: RawMoney;
  cgstAmount: RawMoney;
  sgstAmount: RawMoney;
  igstAmount: RawMoney;
  discountTotal: RawMoney;
  paidAmount: RawMoney;
  dueAmount: RawMoney;
}

function toTotals(row: TotalsRow | undefined): SalesTotals {
  const cgst = money(row?.cgstAmount ?? 0);
  const sgst = money(row?.sgstAmount ?? 0);
  const igst = money(row?.igstAmount ?? 0);
  return {
    billCount: row?.billCount ?? 0,
    grandTotal: money(row?.grandTotal ?? 0),
    taxableValue: money(row?.taxableValue ?? 0),
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    gstCollected: new Decimal(cgst).add(sgst).add(igst).toDecimalPlaces(2).toNumber(),
    discountTotal: money(row?.discountTotal ?? 0),
    paidAmount: money(row?.paidAmount ?? 0),
    dueAmount: money(row?.dueAmount ?? 0),
  };
}

const TOTALS_SELECT = Prisma.sql`
  COUNT(*)::int                                       AS "billCount",
  SUM(b."grandTotal")                                 AS "grandTotal",
  SUM(b."taxableValue")                               AS "taxableValue",
  SUM(b."cgstAmount")                                 AS "cgstAmount",
  SUM(b."sgstAmount")                                 AS "sgstAmount",
  SUM(b."igstAmount")                                 AS "igstAmount",
  SUM(b."lineDiscountTotal" + b."billDiscountAmount") AS "discountTotal",
  SUM(b."paidAmount")                                 AS "paidAmount",
  SUM(b."dueAmount")                                  AS "dueAmount"
`;

async function salesTotals(range: ShopRange, opts: { mode?: BillingMode; staffId?: string } = {}): Promise<SalesTotals> {
  const rows = await prisma.$queryRaw<TotalsRow[]>(
    Prisma.sql`SELECT ${TOTALS_SELECT} FROM bills b WHERE ${billWhere(range, opts)}`,
  );
  return toTotals(rows[0]);
}

// ── Sales trend ──────────────────────────────────────────────────────────

export interface SalesTrendPoint {
  /** IST calendar date, "YYYY-MM-DD". */
  date: string;
  total: number;
  billCount: number;
}

/**
 * Daily grand totals across the range, zero-filled.
 *
 * The zero-fill matters: a chart drawn only from days that had a sale would
 * silently close the gap where a shop was shut, turning a quiet Sunday into a
 * straight line between Saturday and Monday.
 */
export async function getSalesTrend(range: ShopRange, staffId?: string): Promise<SalesTrendPoint[]> {
  const rows = await prisma.$queryRaw<{ day: string; total: RawMoney; billCount: number }[]>(
    Prisma.sql`
      SELECT ${IST_DAY} AS day, SUM(b."grandTotal") AS total, COUNT(*)::int AS "billCount"
      FROM bills b
      WHERE ${billWhere(range, staffId ? { staffId } : {})}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  );

  const byDay = new Map(rows.map((row) => [row.day, row]));
  return eachShopDay(range).map((date) => {
    const row = byDay.get(date);
    return { date, total: money(row?.total ?? 0), billCount: row?.billCount ?? 0 };
  });
}

// ── Top lists ────────────────────────────────────────────────────────────

export interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  unit: Unit;
  qty: number;
  /** Net of discount, before GST. */
  value: number;
}

export async function getTopProducts(range: ShopRange, limit = 5): Promise<TopProduct[]> {
  const rows = await prisma.$queryRaw<
    { productId: string; name: string; sku: string; unit: Unit; qty: RawMoney; value: RawMoney }[]
  >(
    Prisma.sql`
      SELECT bi."productId"        AS "productId",
             MAX(bi."productName") AS name,
             MAX(p.sku)            AS sku,
             MAX(bi.unit::text)::"Unit" AS unit,
             SUM(bi.qty)           AS qty,
             SUM(bi."taxableValue") AS value
      FROM bill_items bi
      JOIN bills b    ON b.id = bi."billId"
      JOIN products p ON p.id = bi."productId"
      WHERE ${billWhere(range)}
      GROUP BY bi."productId"
      ORDER BY SUM(bi."taxableValue") DESC
      LIMIT ${limit}
    `,
  );

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    qty: quantity(row.qty),
    value: money(row.value),
  }));
}

export interface TopCustomer {
  customerId: string;
  name: string;
  phone: string | null;
  billCount: number;
  value: number;
  outstanding: number;
}

/**
 * Walk-in sales have no `customerId`, so they cannot be ranked here — this is
 * a list of *saved* customers, which is what "top customers" means to a shop
 * running khata accounts.
 */
export async function getTopCustomers(range: ShopRange, limit = 5): Promise<TopCustomer[]> {
  const rows = await prisma.$queryRaw<
    { customerId: string; name: string; phone: string | null; billCount: number; value: RawMoney; outstanding: RawMoney }[]
  >(
    Prisma.sql`
      SELECT c.id                AS "customerId",
             c.name              AS name,
             c.phone             AS phone,
             COUNT(*)::int       AS "billCount",
             SUM(b."grandTotal") AS value,
             MAX(c.outstanding)  AS outstanding
      FROM bills b
      JOIN customers c ON c.id = b."customerId"
      WHERE ${billWhere(range)}
      GROUP BY c.id, c.name, c.phone
      ORDER BY SUM(b."grandTotal") DESC
      LIMIT ${limit}
    `,
  );

  return rows.map((row) => ({
    customerId: row.customerId,
    name: row.name,
    phone: row.phone,
    billCount: row.billCount,
    value: money(row.value),
    outstanding: money(row.outstanding),
  }));
}

// ── /reports/sales ───────────────────────────────────────────────────────

export interface SalesReportDay extends SalesTrendPoint {
  gstTotal: number;
  estimateTotal: number;
}

export interface SalesReportBill {
  id: string;
  billNumber: string;
  billDate: string;
  billingMode: BillingMode;
  customerName: string | null;
  staffName: string;
  itemCount: number;
  taxableValue: number;
  gstAmount: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
}

export interface SalesReportResult {
  range: { from: string; to: string };
  totals: SalesTotals;
  /** The same totals split by document type, because a shop reconciles them separately. */
  byMode: { mode: BillingMode; billCount: number; grandTotal: number; taxableValue: number; gstCollected: number }[];
  byDay: SalesReportDay[];
  bills: SalesReportBill[];
  /** True when `bills` was capped — the day summary and totals still cover everything. */
  truncated: boolean;
}

/** Per-bill detail is capped so a full-FY export cannot return 40,000 rows. */
const BILL_DETAIL_LIMIT = 500;

export async function getSalesReport(
  range: ShopRange,
  opts: { mode?: BillingMode; staffId?: string } = {},
): Promise<SalesReportResult> {
  const where = billWhere(range, opts);

  const [totals, modeRows, dayRows, billRows] = await Promise.all([
    salesTotals(range, opts),

    prisma.$queryRaw<
      { mode: BillingMode; billCount: number; grandTotal: RawMoney; taxableValue: RawMoney; gst: RawMoney }[]
    >(Prisma.sql`
      SELECT b."billingMode" AS mode,
             COUNT(*)::int   AS "billCount",
             SUM(b."grandTotal")   AS "grandTotal",
             SUM(b."taxableValue") AS "taxableValue",
             SUM(b."cgstAmount" + b."sgstAmount" + b."igstAmount") AS gst
      FROM bills b WHERE ${where}
      GROUP BY b."billingMode"
      ORDER BY b."billingMode"
    `),

    prisma.$queryRaw<
      { day: string; total: RawMoney; billCount: number; gstTotal: RawMoney; estimateTotal: RawMoney }[]
    >(Prisma.sql`
      SELECT ${IST_DAY} AS day,
             SUM(b."grandTotal") AS total,
             COUNT(*)::int       AS "billCount",
             SUM(CASE WHEN b."billingMode" = 'GST'::"BillingMode"     THEN b."grandTotal" ELSE 0 END) AS "gstTotal",
             SUM(CASE WHEN b."billingMode" = 'NON_GST'::"BillingMode" THEN b."grandTotal" ELSE 0 END) AS "estimateTotal"
      FROM bills b WHERE ${where}
      GROUP BY 1 ORDER BY 1 ASC
    `),

    prisma.$queryRaw<
      {
        id: string;
        billNumber: string;
        billDate: Date;
        billingMode: BillingMode;
        customerName: string | null;
        staffName: string;
        itemCount: number;
        taxableValue: RawMoney;
        gstAmount: RawMoney;
        grandTotal: RawMoney;
        paidAmount: RawMoney;
        dueAmount: RawMoney;
      }[]
    >(Prisma.sql`
      SELECT b.id, b."billNumber", b."billDate", b."billingMode",
             b."customerNameSnapshot" AS "customerName",
             u.name                   AS "staffName",
             (SELECT COUNT(*)::int FROM bill_items bi WHERE bi."billId" = b.id) AS "itemCount",
             b."taxableValue",
             (b."cgstAmount" + b."sgstAmount" + b."igstAmount") AS "gstAmount",
             b."grandTotal", b."paidAmount", b."dueAmount"
      FROM bills b
      JOIN users u ON u.id = b."createdById"
      WHERE ${where}
      ORDER BY b."billDate" DESC, b."billNumber" DESC
      LIMIT ${BILL_DETAIL_LIMIT + 1}
    `),
  ]);

  const truncated = billRows.length > BILL_DETAIL_LIMIT;

  const byDayMap = new Map(dayRows.map((row) => [row.day, row]));

  return {
    range: { from: range.fromLabel, to: range.toLabel },
    totals,
    byMode: modeRows.map((row) => ({
      mode: row.mode,
      billCount: row.billCount,
      grandTotal: money(row.grandTotal),
      taxableValue: money(row.taxableValue),
      gstCollected: money(row.gst),
    })),
    byDay: eachShopDay(range).map((date) => {
      const row = byDayMap.get(date);
      return {
        date,
        total: money(row?.total ?? 0),
        billCount: row?.billCount ?? 0,
        gstTotal: money(row?.gstTotal ?? 0),
        estimateTotal: money(row?.estimateTotal ?? 0),
      };
    }),
    bills: billRows.slice(0, BILL_DETAIL_LIMIT).map((row) => ({
      id: row.id,
      billNumber: row.billNumber,
      billDate: row.billDate.toISOString(),
      billingMode: row.billingMode,
      customerName: row.customerName,
      staffName: row.staffName,
      itemCount: row.itemCount,
      taxableValue: money(row.taxableValue),
      gstAmount: money(row.gstAmount),
      grandTotal: money(row.grandTotal),
      paidAmount: money(row.paidAmount),
      dueAmount: money(row.dueAmount),
    })),
    truncated,
  };
}

// ── /reports/gst-summary ─────────────────────────────────────────────────

export interface GstRateRow {
  gstPercent: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

export interface GstSummaryResult {
  range: { from: string; to: string };
  byRate: GstRateRow[];
  totals: Omit<GstRateRow, 'gstPercent'>;
  /** Estimates carry no GST but are money that moved — shown so the two reconcile. */
  estimateValueExcluded: number;
  gstBillCount: number;
}

/**
 * Grouped by GST rate, which is the shape a GSTR-1/GSTR-3B summary is filed
 * in. Only `billingMode = GST` rows are included — an estimate is not a tax
 * invoice and must never appear in a return.
 */
export async function getGstSummary(range: ShopRange): Promise<GstSummaryResult> {
  const gstWhere = billWhere(range, { mode: BillingMode.GST });

  const [rateRows, countRow, estimateRow] = await Promise.all([
    prisma.$queryRaw<
      { gstPercent: RawMoney; taxableValue: RawMoney; cgst: RawMoney; sgst: RawMoney; igst: RawMoney }[]
    >(Prisma.sql`
      SELECT bi."gstPercent"          AS "gstPercent",
             SUM(bi."taxableValue")   AS "taxableValue",
             SUM(bi."cgstAmount")     AS cgst,
             SUM(bi."sgstAmount")     AS sgst,
             SUM(bi."igstAmount")     AS igst
      FROM bill_items bi
      JOIN bills b ON b.id = bi."billId"
      WHERE ${gstWhere}
      GROUP BY bi."gstPercent"
      ORDER BY bi."gstPercent" ASC
    `),
    prisma.$queryRaw<{ billCount: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS "billCount" FROM bills b WHERE ${gstWhere}`,
    ),
    prisma.$queryRaw<{ total: RawMoney }[]>(
      Prisma.sql`
        SELECT SUM(b."grandTotal") AS total FROM bills b
        WHERE ${billWhere(range, { mode: BillingMode.NON_GST })}
      `,
    ),
  ]);

  const byRate: GstRateRow[] = rateRows.map((row) => {
    const cgst = money(row.cgst);
    const sgst = money(row.sgst);
    const igst = money(row.igst);
    return {
      gstPercent: new Decimal(row.gstPercent ?? 0).toDecimalPlaces(2).toNumber(),
      taxableValue: money(row.taxableValue),
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      totalTax: new Decimal(cgst).add(sgst).add(igst).toDecimalPlaces(2).toNumber(),
    };
  });

  const sum = (key: keyof Omit<GstRateRow, 'gstPercent'>): number =>
    byRate.reduce((acc, row) => new Decimal(acc).add(row[key]).toDecimalPlaces(2).toNumber(), 0);

  return {
    range: { from: range.fromLabel, to: range.toLabel },
    byRate,
    totals: {
      taxableValue: sum('taxableValue'),
      cgstAmount: sum('cgstAmount'),
      sgstAmount: sum('sgstAmount'),
      igstAmount: sum('igstAmount'),
      totalTax: sum('totalTax'),
    },
    estimateValueExcluded: money(estimateRow[0]?.total ?? 0),
    gstBillCount: countRow[0]?.billCount ?? 0,
  };
}

// ── /reports/stock-valuation · /reports/low-stock ────────────────────────

/**
 * ADMIN ONLY — delegates wholesale to the stock module rather than writing a
 * second costPrice query. One valuation figure exists in this codebase.
 */
export async function getStockValuationReport(): Promise<StockValuationResponse> {
  return getStockValuation();
}

/** Open to STAFF. `listLowStock` selects no cost columns at all — see stock.service. */
export async function getLowStockReport(query: { page: number; pageSize: number; search?: string }): Promise<LowStockResult> {
  return listLowStock(query);
}

// ── /reports/outstanding ─────────────────────────────────────────────────

export interface OutstandingCustomer {
  customerId: string;
  name: string;
  phone: string;
  type: string;
  creditLimit: number;
  outstanding: number;
  /** How far past the credit limit they are. 0 when within it or no limit set. */
  overLimitBy: number;
  lastBillDate: string | null;
  unpaidBillCount: number;
}

export interface OutstandingResult {
  asOf: string;
  totalOutstanding: number;
  customerCount: number;
  overLimitCount: number;
  customers: OutstandingCustomer[];
}

/**
 * Reads `customers.outstanding` — the running balance `bills.service` keeps in
 * step with `ledger_entries` inside the bill transaction. Re-deriving it by
 * summing the ledger here would be a second, competing answer to the same
 * question; if the two ever disagreed the shop would have no way to tell which
 * to believe.
 */
export async function getOutstandingReport(): Promise<OutstandingResult> {
  const rows = await prisma.$queryRaw<
    {
      customerId: string;
      name: string;
      phone: string;
      type: string;
      creditLimit: RawMoney;
      outstanding: RawMoney;
      lastBillDate: Date | null;
      unpaidBillCount: number;
    }[]
  >(Prisma.sql`
    SELECT c.id AS "customerId", c.name, c.phone, c.type::text AS type,
           c."creditLimit", c.outstanding,
           (SELECT MAX(b."billDate") FROM bills b
             WHERE b."customerId" = c.id AND b."status" = 'FINAL'::"BillStatus") AS "lastBillDate",
           (SELECT COUNT(*)::int FROM bills b
             WHERE b."customerId" = c.id AND b."status" = 'FINAL'::"BillStatus" AND b."dueAmount" > 0) AS "unpaidBillCount"
    FROM customers c
    WHERE c."deletedAt" IS NULL AND c.outstanding > 0
    ORDER BY c.outstanding DESC
  `);

  const customers: OutstandingCustomer[] = rows.map((row) => {
    const outstanding = money(row.outstanding);
    const creditLimit = money(row.creditLimit);
    return {
      customerId: row.customerId,
      name: row.name,
      phone: row.phone,
      type: row.type,
      creditLimit,
      outstanding,
      overLimitBy: creditLimit > 0 ? Math.max(0, new Decimal(outstanding).sub(creditLimit).toDecimalPlaces(2).toNumber()) : 0,
      lastBillDate: row.lastBillDate?.toISOString() ?? null,
      unpaidBillCount: row.unpaidBillCount,
    };
  });

  return {
    asOf: new Date().toISOString(),
    totalOutstanding: customers.reduce(
      (sum, c) => new Decimal(sum).add(c.outstanding).toDecimalPlaces(2).toNumber(),
      0,
    ),
    customerCount: customers.length,
    overLimitCount: customers.filter((c) => c.overLimitBy > 0).length,
    customers,
  };
}

/** Just the shop-wide figure, for the dashboard KPI. */
export async function getTotalOutstanding(): Promise<{ total: number; customerCount: number }> {
  const rows = await prisma.$queryRaw<{ total: RawMoney; customerCount: number }[]>`
    SELECT SUM(outstanding) AS total, COUNT(*)::int AS "customerCount"
    FROM customers
    WHERE "deletedAt" IS NULL AND outstanding > 0
  `;
  return { total: money(rows[0]?.total ?? 0), customerCount: rows[0]?.customerCount ?? 0 };
}

// ── /reports/ageing ──────────────────────────────────────────────────────

export interface AgeingCustomer {
  customerId: string;
  name: string;
  phone: string;
  bucket0to30: number;
  bucket31to60: number;
  bucket60Plus: number;
  /** Sum of the three buckets — what is owed against actual bills. */
  billDue: number;
  /** The running balance on the customer record. */
  outstanding: number;
  oldestBillDays: number;
}

export interface AgeingResult {
  asOf: string;
  buckets: { bucket0to30: number; bucket31to60: number; bucket60Plus: number; total: number };
  totalOutstanding: number;
  /**
   * `totalOutstanding` − bucket total. Opening balances and any adjustment not
   * tied to a bill cannot be aged, so they are reported here rather than
   * quietly folded into the 60+ column.
   */
  unbucketed: number;
  customers: AgeingCustomer[];
}

/**
 * Buckets unpaid bill balances by how long they have been outstanding, counted
 * in IST calendar days from the bill date.
 *
 * Ageing is computed from `bills.dueAmount` rather than the ledger because
 * `dueAmount` is per-bill: it is the only column that says *which* sale is
 * still owed. A customer-level balance alone cannot be aged.
 */
export async function getAgeingReport(): Promise<AgeingResult> {
  const rows = await prisma.$queryRaw<
    {
      customerId: string;
      name: string;
      phone: string;
      b0: RawMoney;
      b31: RawMoney;
      b60: RawMoney;
      outstanding: RawMoney;
      oldestBillDays: number | null;
    }[]
  >`
    WITH aged AS (
      SELECT b."customerId",
             b."dueAmount",
             (DATE(now() AT TIME ZONE 'Asia/Kolkata') - DATE(b."billDate" AT TIME ZONE 'Asia/Kolkata')) AS days
      FROM bills b
      WHERE b."status" = 'FINAL'::"BillStatus" AND b."dueAmount" > 0 AND b."customerId" IS NOT NULL
    )
    SELECT c.id AS "customerId", c.name, c.phone,
           SUM(CASE WHEN a.days <= 30                      THEN a."dueAmount" ELSE 0 END) AS b0,
           SUM(CASE WHEN a.days > 30 AND a.days <= 60      THEN a."dueAmount" ELSE 0 END) AS b31,
           SUM(CASE WHEN a.days > 60                       THEN a."dueAmount" ELSE 0 END) AS b60,
           MAX(c.outstanding)  AS outstanding,
           MAX(a.days)::int    AS "oldestBillDays"
    FROM aged a
    JOIN customers c ON c.id = a."customerId"
    WHERE c."deletedAt" IS NULL
    GROUP BY c.id, c.name, c.phone
    ORDER BY SUM(a."dueAmount") DESC
  `;

  const customers: AgeingCustomer[] = rows.map((row) => {
    const bucket0to30 = money(row.b0);
    const bucket31to60 = money(row.b31);
    const bucket60Plus = money(row.b60);
    return {
      customerId: row.customerId,
      name: row.name,
      phone: row.phone,
      bucket0to30,
      bucket31to60,
      bucket60Plus,
      billDue: new Decimal(bucket0to30).add(bucket31to60).add(bucket60Plus).toDecimalPlaces(2).toNumber(),
      outstanding: money(row.outstanding),
      oldestBillDays: row.oldestBillDays ?? 0,
    };
  });

  const sum = (pick: (c: AgeingCustomer) => number): number =>
    customers.reduce((acc, c) => new Decimal(acc).add(pick(c)).toDecimalPlaces(2).toNumber(), 0);

  const bucket0to30 = sum((c) => c.bucket0to30);
  const bucket31to60 = sum((c) => c.bucket31to60);
  const bucket60Plus = sum((c) => c.bucket60Plus);
  const bucketTotal = new Decimal(bucket0to30).add(bucket31to60).add(bucket60Plus).toDecimalPlaces(2).toNumber();

  const { total: totalOutstanding } = await getTotalOutstanding();

  return {
    asOf: new Date().toISOString(),
    buckets: { bucket0to30, bucket31to60, bucket60Plus, total: bucketTotal },
    totalOutstanding,
    unbucketed: new Decimal(totalOutstanding).sub(bucketTotal).toDecimalPlaces(2).toNumber(),
    customers,
  };
}

// ── /reports/product-sales ───────────────────────────────────────────────

export interface ProductSalesRow {
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  unit: Unit;
  qty: number;
  billCount: number;
  /** Net of discount, before GST. */
  value: number;
  discountGiven: number;
  /** Weighted average selling rate over the period. */
  averageRate: number;
}

export interface ProductSalesResult {
  range: { from: string; to: string };
  rows: ProductSalesRow[];
  totals: { productCount: number; value: number; discountGiven: number };
}

export async function getProductSalesReport(range: ShopRange): Promise<ProductSalesResult> {
  const rows = await prisma.$queryRaw<
    {
      productId: string;
      name: string;
      sku: string;
      categoryName: string;
      unit: Unit;
      qty: RawMoney;
      billCount: number;
      value: RawMoney;
      discountGiven: RawMoney;
    }[]
  >(Prisma.sql`
    SELECT bi."productId"          AS "productId",
           MAX(bi."productName")   AS name,
           MAX(p.sku)              AS sku,
           MAX(cat.name)           AS "categoryName",
           MAX(bi.unit::text)::"Unit" AS unit,
           SUM(bi.qty)             AS qty,
           COUNT(DISTINCT bi."billId")::int AS "billCount",
           SUM(bi."taxableValue")  AS value,
           SUM(bi."discountAmount") AS "discountGiven"
    FROM bill_items bi
    JOIN bills b        ON b.id = bi."billId"
    JOIN products p     ON p.id = bi."productId"
    JOIN categories cat ON cat.id = p."categoryId"
    WHERE ${billWhere(range)}
    GROUP BY bi."productId"
    ORDER BY SUM(bi."taxableValue") DESC
  `);

  const mapped: ProductSalesRow[] = rows.map((row) => {
    const qty = quantity(row.qty);
    const value = money(row.value);
    return {
      productId: row.productId,
      name: row.name,
      sku: row.sku,
      categoryName: row.categoryName,
      unit: row.unit,
      qty,
      billCount: row.billCount,
      value,
      discountGiven: money(row.discountGiven),
      averageRate: qty === 0 ? 0 : new Decimal(value).div(qty).toDecimalPlaces(2).toNumber(),
    };
  });

  return {
    range: { from: range.fromLabel, to: range.toLabel },
    rows: mapped,
    totals: {
      productCount: mapped.length,
      value: mapped.reduce((acc, r) => new Decimal(acc).add(r.value).toDecimalPlaces(2).toNumber(), 0),
      discountGiven: mapped.reduce((acc, r) => new Decimal(acc).add(r.discountGiven).toDecimalPlaces(2).toNumber(), 0),
    },
  };
}

// ── /reports/category-sales ──────────────────────────────────────────────

export interface CategorySalesRow {
  categoryId: string;
  name: string;
  code: string;
  productCount: number;
  qty: number;
  value: number;
  /** Share of the period's total sales value. */
  sharePercent: number;
}

export interface CategorySalesResult {
  range: { from: string; to: string };
  rows: CategorySalesRow[];
  totalValue: number;
}

export async function getCategorySalesReport(range: ShopRange): Promise<CategorySalesResult> {
  const rows = await prisma.$queryRaw<
    { categoryId: string; name: string; code: string; productCount: number; qty: RawMoney; value: RawMoney }[]
  >(Prisma.sql`
    SELECT cat.id   AS "categoryId",
           MAX(cat.name) AS name,
           MAX(cat.code) AS code,
           COUNT(DISTINCT bi."productId")::int AS "productCount",
           SUM(bi.qty)            AS qty,
           SUM(bi."taxableValue") AS value
    FROM bill_items bi
    JOIN bills b        ON b.id = bi."billId"
    JOIN products p     ON p.id = bi."productId"
    JOIN categories cat ON cat.id = p."categoryId"
    WHERE ${billWhere(range)}
    GROUP BY cat.id
    ORDER BY SUM(bi."taxableValue") DESC
  `);

  const totalValue = rows.reduce((acc, r) => new Decimal(acc).add(money(r.value)).toDecimalPlaces(2).toNumber(), 0);

  return {
    range: { from: range.fromLabel, to: range.toLabel },
    totalValue,
    rows: rows.map((row) => {
      const value = money(row.value);
      return {
        categoryId: row.categoryId,
        name: row.name,
        code: row.code,
        productCount: row.productCount,
        qty: quantity(row.qty),
        value,
        sharePercent: percent(value, totalValue),
      };
    }),
  };
}

// ── /reports/payment-collection ──────────────────────────────────────────

export interface CollectionRow {
  mode: string;
  count: number;
  amount: number;
}

export interface PaymentCollectionResult {
  range: { from: string; to: string };
  /**
   * Money taken at the counter *on the bill itself*, grouped by the bill's
   * payment mode. This is the real cash-in for the period.
   */
  billCollection: CollectionRow[];
  billCollectionTotal: number;
  /**
   * Standalone khata receipts from the `payments` table. The payments module
   * is not built yet, so this is empty on a current database — the query is
   * here so the report starts working the moment receipts exist, rather than
   * needing a revisit.
   */
  receipts: CollectionRow[];
  receiptsTotal: number;
  /** Invoiced in the period but not paid within it. */
  creditGiven: number;
  grandTotal: number;
}

export async function getPaymentCollectionReport(range: ShopRange): Promise<PaymentCollectionResult> {
  const [billRows, receiptRows, dueRow] = await Promise.all([
    prisma.$queryRaw<{ mode: string; count: number; amount: RawMoney }[]>(Prisma.sql`
      SELECT b."paymentMode"::text AS mode, COUNT(*)::int AS count, SUM(b."paidAmount") AS amount
      FROM bills b
      WHERE ${billWhere(range)} AND b."paidAmount" > 0
      GROUP BY b."paymentMode"
      ORDER BY SUM(b."paidAmount") DESC
    `),

    prisma.$queryRaw<{ mode: string; count: number; amount: RawMoney }[]>`
      SELECT p.mode::text AS mode, COUNT(*)::int AS count, SUM(p.amount) AS amount
      FROM payments p
      WHERE p."paymentDate" >= ${range.from} AND p."paymentDate" < ${range.to}
      GROUP BY p.mode
      ORDER BY SUM(p.amount) DESC
    `,

    prisma.$queryRaw<{ due: RawMoney }[]>(
      Prisma.sql`SELECT SUM(b."dueAmount") AS due FROM bills b WHERE ${billWhere(range)}`,
    ),
  ]);

  const toRows = (rows: { mode: string; count: number; amount: RawMoney }[]): CollectionRow[] =>
    rows.map((row) => ({ mode: row.mode, count: row.count, amount: money(row.amount) }));

  const billCollection = toRows(billRows);
  const receipts = toRows(receiptRows);
  const sumAmount = (rows: CollectionRow[]): number =>
    rows.reduce((acc, r) => new Decimal(acc).add(r.amount).toDecimalPlaces(2).toNumber(), 0);

  const billCollectionTotal = sumAmount(billCollection);
  const receiptsTotal = sumAmount(receipts);

  return {
    range: { from: range.fromLabel, to: range.toLabel },
    billCollection,
    billCollectionTotal,
    receipts,
    receiptsTotal,
    creditGiven: money(dueRow[0]?.due ?? 0),
    grandTotal: new Decimal(billCollectionTotal).add(receiptsTotal).toDecimalPlaces(2).toNumber(),
  };
}

// ── /reports/profit-margin — ADMIN ONLY ──────────────────────────────────

export interface ProfitRow {
  productId: string;
  name: string;
  sku: string;
  unit: Unit;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface ProfitMarginResult {
  range: { from: string; to: string };
  overall: {
    billCount: number;
    /** Taxable value — GST is collected for the government, not shop income. */
    revenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
    discountGiven: number;
  };
  rows: ProfitRow[];
  /** Products sold at or below cost — the list an owner actually wants to see. */
  lossMakers: ProfitRow[];
}

/**
 * ADMIN ONLY, without exception. Every figure here derives from
 * `bill_items.costPriceSnapshot` / `bills.costTotal`, which are cost data.
 * Route guard is `requireRole(ADMIN)` and there is deliberately no permission
 * toggle that could open it to a STAFF account.
 *
 * Revenue is taxable value, not grand total: GST collected is a liability, and
 * counting it as income would overstate every margin by the tax rate.
 */
export async function getProfitMarginReport(range: ShopRange): Promise<ProfitMarginResult> {
  const [overallRows, rows] = await Promise.all([
    prisma.$queryRaw<
      { billCount: number; revenue: RawMoney; cost: RawMoney; discountGiven: RawMoney }[]
    >(Prisma.sql`
      SELECT COUNT(*)::int          AS "billCount",
             SUM(b."taxableValue")  AS revenue,
             SUM(b."costTotal")     AS cost,
             SUM(b."lineDiscountTotal" + b."billDiscountAmount") AS "discountGiven"
      FROM bills b WHERE ${billWhere(range)}
    `),

    prisma.$queryRaw<
      { productId: string; name: string; sku: string; unit: Unit; qty: RawMoney; revenue: RawMoney; cost: RawMoney }[]
    >(Prisma.sql`
      SELECT bi."productId"        AS "productId",
             MAX(bi."productName") AS name,
             MAX(p.sku)            AS sku,
             MAX(bi.unit::text)::"Unit" AS unit,
             SUM(bi.qty)           AS qty,
             SUM(bi."taxableValue") AS revenue,
             SUM(bi."costPriceSnapshot" * bi.qty) AS cost
      FROM bill_items bi
      JOIN bills b    ON b.id = bi."billId"
      JOIN products p ON p.id = bi."productId"
      WHERE ${billWhere(range)}
      GROUP BY bi."productId"
      ORDER BY (SUM(bi."taxableValue") - SUM(bi."costPriceSnapshot" * bi.qty)) DESC
    `),
  ]);

  const mapped: ProfitRow[] = rows.map((row) => {
    const revenue = money(row.revenue);
    const cost = money(row.cost);
    const profit = new Decimal(revenue).sub(cost).toDecimalPlaces(2).toNumber();
    return {
      productId: row.productId,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      qty: quantity(row.qty),
      revenue,
      cost,
      profit,
      marginPercent: percent(profit, revenue),
    };
  });

  const revenue = money(overallRows[0]?.revenue ?? 0);
  const cost = money(overallRows[0]?.cost ?? 0);
  const profit = new Decimal(revenue).sub(cost).toDecimalPlaces(2).toNumber();

  return {
    range: { from: range.fromLabel, to: range.toLabel },
    overall: {
      billCount: overallRows[0]?.billCount ?? 0,
      revenue,
      cost,
      profit,
      marginPercent: percent(profit, revenue),
      discountGiven: money(overallRows[0]?.discountGiven ?? 0),
    },
    rows: mapped,
    lossMakers: mapped.filter((row) => row.profit <= 0 && row.revenue > 0),
  };
}

// ── Dashboard aggregates ─────────────────────────────────────────────────

export interface AdminDashboard {
  role: 'ADMIN';
  asOf: string;
  today: { sales: number; billCount: number; collected: number };
  month: { sales: number; billCount: number; gstPayable: number; label: string };
  financialYear: { label: string; sales: number };
  totalOutstanding: number;
  outstandingCustomerCount: number;
  lowStockCount: number;
  stockValueAtCost: number;
  salesTrend: SalesTrendPoint[];
  trendRange: '7D' | '30D';
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
}

export interface StaffDashboard {
  role: 'STAFF';
  asOf: string;
  /**
   * This staff account's own bills for today, and nothing else. There is no
   * shop total, no month figure, no margin and no other staff's work anywhere
   * in this payload — not hidden, not zeroed: absent.
   */
  myBillsToday: { count: number; total: number };
  lowStockCount: number;
}

export async function getAdminDashboard(
  ranges: { today: ShopRange; month: ShopRange; trend: ShopRange },
  trendRange: '7D' | '30D',
): Promise<AdminDashboard> {
  const fy = financialYearRange();

  const [todayTotals, monthTotals, fyTotals, outstanding, valuation, trend, topProducts, topCustomers] =
    await Promise.all([
      salesTotals(ranges.today),
      salesTotals(ranges.month),
      salesTotals(fy),
      getTotalOutstanding(),
      getStockValuation(),
      getSalesTrend(ranges.trend),
      getTopProducts(ranges.month, 5),
      getTopCustomers(ranges.month, 5),
    ]);

  return {
    role: 'ADMIN',
    asOf: new Date().toISOString(),
    today: { sales: todayTotals.grandTotal, billCount: todayTotals.billCount, collected: todayTotals.paidAmount },
    month: {
      sales: monthTotals.grandTotal,
      billCount: monthTotals.billCount,
      gstPayable: monthTotals.gstCollected,
      label: ranges.month.fromLabel.slice(0, 7),
    },
    financialYear: { label: fy.label, sales: fyTotals.grandTotal },
    totalOutstanding: outstanding.total,
    outstandingCustomerCount: outstanding.customerCount,
    lowStockCount: valuation.lowStockCount,
    stockValueAtCost: valuation.costValue,
    salesTrend: trend,
    trendRange,
    topProducts,
    topCustomers,
  };
}

/**
 * The STAFF payload is built by a separate function on purpose. Filtering an
 * admin payload down would leave the shop-wide numbers one forgotten `delete`
 * away from the wire; this way they are never fetched at all.
 */
export async function getStaffDashboard(today: ShopRange, staffId: string): Promise<StaffDashboard> {
  const [own, lowStock] = await Promise.all([
    prisma.$queryRaw<{ billCount: number; total: RawMoney }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "billCount", SUM(b."grandTotal") AS total
      FROM bills b WHERE ${billWhere(today, { staffId })}
    `),
    prisma.product.count({
      where: { deletedAt: null, isActive: true, currentStock: { lte: prisma.product.fields.reorderLevel } },
    }),
  ]);

  return {
    role: 'STAFF',
    asOf: new Date().toISOString(),
    myBillsToday: { count: own[0]?.billCount ?? 0, total: money(own[0]?.total ?? 0) },
    lowStockCount: lowStock,
  };
}
