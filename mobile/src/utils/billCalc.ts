import type { BillingMode, DiscountType, TaxType, Unit } from '../api/types';

/**
 * A screen-only preview of what the bill will total. It mirrors
 * `backend/src/modules/bills/bills.tax.ts` — round each line to 2dp first,
 * then sum — so the dock does not jump when the server's figures come back.
 * The server remains the source of truth: `POST /bills` recomputes everything
 * and the response replaces these numbers.
 *
 * Round-off to the nearest rupee is a shop setting the mobile app cannot read
 * yet, so it is deliberately not previewed; the grand total may land within a
 * rupee of the printed one.
 */

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

export interface DraftLine {
  productId: string;
  productName: string;
  unit: Unit;
  qty: number;
  rate: number;
  gstPercent: number;
  discountType: DiscountType;
  discountValue: number;
}

function discountAmount(base: number, type: DiscountType, value: number): number {
  if (value <= 0 || base <= 0) return 0;
  return Math.min(type === 'PERCENT' ? (base * value) / 100 : value, base);
}

export interface LinePreview {
  gross: number;
  discountAmount: number;
  lineTotal: number;
}

/** What a single row shows as its own total — before any bill-level discount or tax. */
export function previewLine(line: DraftLine): LinePreview {
  const gross = r2(r3(line.qty) * r2(line.rate));
  const discount = r2(discountAmount(gross, line.discountType, line.discountValue));
  return { gross, discountAmount: discount, lineTotal: r2(gross - discount) };
}

export interface BillPreview {
  subTotal: number;
  lineDiscountTotal: number;
  billDiscountAmount: number;
  totalDiscount: number;
  effectiveDiscountPercent: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  grandTotal: number;
}

export function previewBill(
  lines: DraftLine[],
  opts: {
    billingMode: BillingMode;
    taxType: TaxType;
    billDiscountType: DiscountType;
    billDiscountValue: number;
  },
): BillPreview {
  const isGst = opts.billingMode === 'GST';

  const pass1 = lines.map((line) => {
    const { gross, discountAmount: discount } = previewLine(line);
    return { line, gross, discountAmount: discount, taxableBeforeBillDiscount: gross - discount };
  });

  const subTotal = r2(pass1.reduce((sum, p) => sum + p.gross, 0));
  const lineDiscountTotal = r2(pass1.reduce((sum, p) => sum + p.discountAmount, 0));
  const preBillDiscountTaxable = r2(subTotal - lineDiscountTotal);
  const billDiscount = r2(discountAmount(preBillDiscountTaxable, opts.billDiscountType, opts.billDiscountValue));

  // The bill-level discount is spread across lines in proportion to their
  // value, with the last line absorbing the rounding remainder — the same
  // allocation the server performs, so per-line tax matches.
  let allocated = 0;
  let taxableValue = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  pass1.forEach((p, idx) => {
    const isLast = idx === pass1.length - 1;
    let share: number;
    if (preBillDiscountTaxable === 0) share = 0;
    else if (isLast) share = r2(billDiscount - allocated);
    else {
      share = r2((billDiscount * p.taxableBeforeBillDiscount) / preBillDiscountTaxable);
      allocated = r2(allocated + share);
    }

    const netTaxable = Math.max(0, r2(p.taxableBeforeBillDiscount - share));
    taxableValue = r2(taxableValue + netTaxable);

    if (!isGst) return;
    const gstPercent = p.line.gstPercent;
    if (opts.taxType === 'CGST_SGST') {
      const half = r2((netTaxable * gstPercent) / 200);
      cgst = r2(cgst + half);
      sgst = r2(sgst + half);
    } else if (opts.taxType === 'IGST') {
      igst = r2(igst + r2((netTaxable * gstPercent) / 100));
    }
  });

  const totalDiscount = r2(lineDiscountTotal + billDiscount);

  return {
    subTotal,
    lineDiscountTotal,
    billDiscountAmount: billDiscount,
    totalDiscount,
    effectiveDiscountPercent: subTotal === 0 ? 0 : r2((totalDiscount / subTotal) * 100),
    taxableValue,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    grandTotal: r2(taxableValue + cgst + sgst + igst),
  };
}
