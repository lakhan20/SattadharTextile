import { Decimal } from 'decimal.js';
import { BillingMode, DiscountType, TaxType, type Unit } from '@prisma/client';

/**
 * Pure calculation engine for a bill — no I/O, fully unit-testable.
 *
 * Rounding choice: every line's taxable value, discount, and each of
 * CGST/SGST/IGST is rounded to 2dp *first*, then the bill totals are the sum
 * of those already-rounded per-line figures ("round per line, then sum").
 * A single additional round-to-nearest-rupee is applied to the bill grand
 * total when `roundOffEnabled` (standard Indian retail practice); the
 * difference is kept in `roundOff` rather than silently dropped.
 */

function r2(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
function r3(d: Decimal): Decimal {
  return d.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** FLAT/PERCENT discount, capped so a line or bill can never go negative. */
function computeDiscount(base: Decimal, type: DiscountType | undefined, value: Decimal): Decimal {
  if (!type || value.lte(0) || base.lte(0)) return new Decimal(0);
  const raw = type === DiscountType.PERCENT ? base.mul(value).div(100) : value;
  return Decimal.min(raw, base);
}

export interface BillLineInput {
  productId: string;
  qty: number;
  rate: number;
  discountType?: DiscountType;
  discountValue: number;
  productName: string;
  hsnCode: string | null;
  colour: string | null;
  unit: Unit;
  gstPercent: number;
  costPrice: number;
}

export interface BillCalcOptions {
  billingMode: BillingMode;
  taxType: TaxType;
  billDiscountType?: DiscountType;
  billDiscountValue: number;
  roundOffEnabled: boolean;
}

export interface CalculatedLine {
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
  costPriceSnapshot: number;
}

export interface BillCalcResult {
  lines: CalculatedLine[];
  subTotal: number;
  lineDiscountTotal: number;
  billDiscountAmount: number;
  effectiveDiscountPercent: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  grandTotal: number;
  costTotal: number;
}

export function calculateBill(inputLines: BillLineInput[], opts: BillCalcOptions): BillCalcResult {
  const isGst = opts.billingMode === BillingMode.GST;

  // Pass 1: gross and line-level discount, per line.
  const pass1 = inputLines.map((line) => {
    const qty = r3(new Decimal(line.qty));
    const rate = r2(new Decimal(line.rate));
    const gross = r2(qty.mul(rate));
    const discountAmount = r2(computeDiscount(gross, line.discountType, new Decimal(line.discountValue)));
    return { line, qty, rate, gross, discountAmount, taxableBeforeBillDiscount: gross.sub(discountAmount) };
  });

  const subTotal = pass1.reduce((sum, p) => sum.add(p.gross), new Decimal(0));
  const lineDiscountTotal = pass1.reduce((sum, p) => sum.add(p.discountAmount), new Decimal(0));
  const preBillDiscountTaxable = subTotal.sub(lineDiscountTotal);

  const billDiscountAmount = r2(
    computeDiscount(preBillDiscountTaxable, opts.billDiscountType, new Decimal(opts.billDiscountValue)),
  );

  // Pass 2: allocate the bill-level discount proportionally across lines,
  // then compute tax. The last line absorbs the rounding remainder so the
  // per-line shares always sum exactly to billDiscountAmount.
  let allocatedSoFar = new Decimal(0);
  const lines: CalculatedLine[] = pass1.map((p, idx) => {
    const isLast = idx === pass1.length - 1;
    let share: Decimal;
    if (preBillDiscountTaxable.isZero()) {
      share = new Decimal(0);
    } else if (isLast) {
      share = billDiscountAmount.sub(allocatedSoFar);
    } else {
      share = r2(billDiscountAmount.mul(p.taxableBeforeBillDiscount).div(preBillDiscountTaxable));
      allocatedSoFar = allocatedSoFar.add(share);
    }

    const netTaxable = Decimal.max(0, r2(p.taxableBeforeBillDiscount.sub(share)));

    const gstPercent = isGst ? new Decimal(p.line.gstPercent) : new Decimal(0);
    let cgst = new Decimal(0);
    let sgst = new Decimal(0);
    let igst = new Decimal(0);
    if (isGst && opts.taxType === TaxType.CGST_SGST) {
      cgst = r2(netTaxable.mul(gstPercent).div(200));
      sgst = cgst;
    } else if (isGst && opts.taxType === TaxType.IGST) {
      igst = r2(netTaxable.mul(gstPercent).div(100));
    }

    const lineTotal = r2(netTaxable.add(cgst).add(sgst).add(igst));

    return {
      productId: p.line.productId,
      productName: p.line.productName,
      hsnCode: isGst ? p.line.hsnCode : null,
      colour: p.line.colour,
      unit: p.line.unit,
      qty: p.qty.toNumber(),
      rate: p.rate.toNumber(),
      discountType: p.line.discountType ?? null,
      discountValue: p.line.discountValue,
      discountAmount: p.discountAmount.toNumber(),
      taxableValue: netTaxable.toNumber(),
      gstPercent: gstPercent.toNumber(),
      cgstAmount: cgst.toNumber(),
      sgstAmount: sgst.toNumber(),
      igstAmount: igst.toNumber(),
      lineTotal: lineTotal.toNumber(),
      costPriceSnapshot: p.line.costPrice,
    };
  });

  const sumField = (key: keyof CalculatedLine): Decimal =>
    lines.reduce((s, l) => s.add(new Decimal(l[key] as number)), new Decimal(0));

  const taxableValueD = sumField('taxableValue');
  const cgstD = sumField('cgstAmount');
  const sgstD = sumField('sgstAmount');
  const igstD = sumField('igstAmount');
  const costTotalD = lines.reduce((s, l) => s.add(new Decimal(l.costPriceSnapshot).mul(l.qty)), new Decimal(0));

  const preRoundGrandTotal = taxableValueD.add(cgstD).add(sgstD).add(igstD);
  let roundOff = new Decimal(0);
  let grandTotal = r2(preRoundGrandTotal);
  if (opts.roundOffEnabled) {
    const nearestRupee = preRoundGrandTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    roundOff = r2(nearestRupee.sub(preRoundGrandTotal));
    grandTotal = nearestRupee;
  }

  const totalDiscount = lineDiscountTotal.add(billDiscountAmount);
  const effectiveDiscountPercent = subTotal.isZero() ? new Decimal(0) : r2(totalDiscount.div(subTotal).mul(100));

  return {
    lines,
    subTotal: subTotal.toNumber(),
    lineDiscountTotal: lineDiscountTotal.toNumber(),
    billDiscountAmount: billDiscountAmount.toNumber(),
    effectiveDiscountPercent: effectiveDiscountPercent.toNumber(),
    taxableValue: taxableValueD.toNumber(),
    cgstAmount: cgstD.toNumber(),
    sgstAmount: sgstD.toNumber(),
    igstAmount: igstD.toNumber(),
    roundOff: roundOff.toNumber(),
    grandTotal: grandTotal.toNumber(),
    costTotal: costTotalD.toNumber(),
  };
}
