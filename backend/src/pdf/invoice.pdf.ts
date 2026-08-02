import PDFDocument from 'pdfkit';
import { BillingMode, TaxType, type Bill, type BillItem, type ShopSetting } from '@prisma/client';
import type { Response } from 'express';
import { amountInWordsIndian } from '../utils/numberToWords';

export type InvoiceLang = 'en' | 'gu';

export interface InvoicePdfData {
  bill: Bill;
  items: BillItem[];
  shop: ShopSetting;
  lang: InvoiceLang;
}

/**
 * All printed labels in one place so a Gujarati translation is a matter of
 * filling in the `gu` column here — nothing else in this file changes.
 * Gujarati strings are TODO; `strings()` falls back to English until then.
 */
const STRINGS_EN = {
  taxInvoice: 'TAX INVOICE',
  estimate: 'ESTIMATE',
  gstin: 'GSTIN',
  billNo: 'Bill No',
  billDate: 'Date',
  billTo: 'Bill To',
  phone: 'Phone',
  placeOfSupply: 'Place of Supply',
  walkIn: 'Walk-in customer',
  sr: 'Sr',
  item: 'Item',
  hsn: 'HSN',
  qty: 'Qty',
  unit: 'Unit',
  rate: 'Rate',
  disc: 'Disc',
  taxable: 'Taxable',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
  total: 'Total',
  subTotal: 'Subtotal',
  lineDiscount: 'Item discounts',
  billDiscount: 'Bill discount',
  taxableValue: 'Taxable value',
  roundOff: 'Round off',
  grandTotal: 'Grand Total',
  amountInWords: 'Amount in words',
  paymentMode: 'Payment',
  paidAmount: 'Paid',
  dueAmount: 'Balance due',
  thankYou: 'Thank you for your business!',
  notATaxInvoice: 'This is an estimate, not a tax invoice. No GST is charged.',
} as const;

type StringKey = keyof typeof STRINGS_EN;

function strings(_lang: InvoiceLang): Record<StringKey, string> {
  // Gujarati copy not written yet — every lang falls back to English.
  return STRINGS_EN;
}

function money(value: unknown): string {
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function qty(value: unknown): string {
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

interface Column {
  key: string;
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

function buildColumns(isGst: boolean, taxType: TaxType, s: Record<StringKey, string>): Column[] {
  if (!isGst) {
    return [
      { key: 'sr', header: s.sr, width: 26 },
      { key: 'item', header: s.item, width: 195 },
      { key: 'qty', header: s.qty, width: 50, align: 'right' },
      { key: 'unit', header: s.unit, width: 40 },
      { key: 'rate', header: s.rate, width: 55, align: 'right' },
      { key: 'disc', header: s.disc, width: 50, align: 'right' },
      { key: 'total', header: s.total, width: 60, align: 'right' },
    ];
  }

  const base: Column[] = [
    { key: 'sr', header: s.sr, width: 22 },
    { key: 'item', header: s.item, width: 110 },
    { key: 'hsn', header: s.hsn, width: 38 },
    { key: 'qty', header: s.qty, width: 32, align: 'right' },
    { key: 'unit', header: s.unit, width: 28 },
    { key: 'rate', header: s.rate, width: 42, align: 'right' },
    { key: 'disc', header: s.disc, width: 36, align: 'right' },
    { key: 'taxable', header: s.taxable, width: 52, align: 'right' },
  ];

  const taxCols: Column[] =
    taxType === TaxType.IGST
      ? [{ key: 'igst', header: s.igst, width: 45, align: 'right' }]
      : [
          { key: 'cgst', header: s.cgst, width: 38, align: 'right' },
          { key: 'sgst', header: s.sgst, width: 38, align: 'right' },
        ];

  return [...base, ...taxCols, { key: 'total', header: s.total, width: 52, align: 'right' }];
}

function rowValues(item: BillItem, isGst: boolean): Record<string, string> {
  const itemLabel = item.colour ? `${item.productName} (${item.colour})` : item.productName;
  return {
    item: itemLabel,
    hsn: item.hsnCode ?? '-',
    qty: qty(item.qty),
    unit: item.unit,
    rate: money(item.rate),
    disc: Number(item.discountAmount) > 0 ? money(item.discountAmount) : '-',
    taxable: money(item.taxableValue),
    cgst: money(item.cgstAmount),
    sgst: money(item.sgstAmount),
    igst: money(item.igstAmount),
    total: money(item.lineTotal),
  };
}

const PAGE_MARGIN = 36;
const ROW_PADDING = 4;
const BASE_ROW_HEIGHT = 16;

function drawTable(doc: PDFKit.PDFDocument, columns: Column[], items: BillItem[], startY: number, isGst: boolean): number {
  const tableLeft = PAGE_MARGIN;
  const bottomLimit = doc.page.height - PAGE_MARGIN - 90; // leave room for totals block
  let y = startY;

  const drawHeader = (): void => {
    doc.font('Helvetica-Bold').fontSize(8);
    let x = tableLeft;
    for (const col of columns) {
      doc.text(col.header, x, y, { width: col.width, align: col.align ?? 'left' });
      x += col.width;
    }
    y += BASE_ROW_HEIGHT;
    doc
      .moveTo(tableLeft, y - 3)
      .lineTo(tableLeft + columns.reduce((s, c) => s + c.width, 0), y - 3)
      .lineWidth(0.5)
      .stroke();
    doc.font('Helvetica').fontSize(8);
  };

  drawHeader();

  items.forEach((item, idx) => {
    const values = rowValues(item, isGst);
    const rowHeight = Math.max(
      BASE_ROW_HEIGHT,
      doc.heightOfString(values['item'] ?? '', { width: columns.find((c) => c.key === 'item')!.width }) + ROW_PADDING,
    );

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = PAGE_MARGIN;
      drawHeader();
    }

    let x = tableLeft;
    for (const col of columns) {
      const text = col.key === 'sr' ? String(idx + 1) : (values[col.key] ?? '');
      doc.text(text, x, y, { width: col.width, align: col.align ?? 'left' });
      x += col.width;
    }
    y += rowHeight;
  });

  doc
    .moveTo(tableLeft, y)
    .lineTo(tableLeft + columns.reduce((s, c) => s + c.width, 0), y)
    .lineWidth(0.5)
    .stroke();

  return y + 8;
}

function drawTotals(doc: PDFKit.PDFDocument, bill: Bill, s: Record<StringKey, string>, y: number, isGst: boolean): number {
  const labelX = 360;
  const valueX = 480;
  const width = 95;
  let cursor = y;

  const row = (label: string, value: string, bold = false): void => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    doc.text(label, labelX, cursor, { width: 115 });
    doc.text(value, valueX, cursor, { width, align: 'right' });
    cursor += 14;
  };

  row(s.subTotal, money(bill.subTotal));
  if (Number(bill.lineDiscountTotal) > 0) row(s.lineDiscount, `- ${money(bill.lineDiscountTotal)}`);
  if (Number(bill.billDiscountAmount) > 0) row(s.billDiscount, `- ${money(bill.billDiscountAmount)}`);
  if (isGst) {
    row(s.taxableValue, money(bill.taxableValue));
    if (bill.taxType === TaxType.CGST_SGST) {
      row(s.cgst, money(bill.cgstAmount));
      row(s.sgst, money(bill.sgstAmount));
    } else if (bill.taxType === TaxType.IGST) {
      row(s.igst, money(bill.igstAmount));
    }
  }
  if (Number(bill.roundOff) !== 0) row(s.roundOff, money(bill.roundOff));
  row(s.grandTotal, `Rs. ${money(bill.grandTotal)}`, true);

  cursor += 4;
  doc.font('Helvetica').fontSize(9);
  row(s.paymentMode, bill.paymentMode);
  row(s.paidAmount, money(bill.paidAmount));
  if (Number(bill.dueAmount) > 0) row(s.dueAmount, money(bill.dueAmount));

  return cursor;
}

export function renderInvoicePdf(doc: PDFKit.PDFDocument, data: InvoicePdfData): void {
  const { bill, items, shop, lang } = data;
  const isGst = bill.billingMode === BillingMode.GST;
  const s = strings(lang);

  doc.font('Helvetica-Bold').fontSize(14).text(shop.displayName, PAGE_MARGIN, PAGE_MARGIN);
  doc.font('Helvetica').fontSize(9);
  const addressLines = [shop.addressLine, shop.city, shop.pincode].filter(Boolean).join(', ');
  if (addressLines) doc.text(addressLines);
  if (shop.phone) doc.text(`${s.phone}: ${shop.phone}`);
  if (isGst && shop.gstin) doc.text(`${s.gstin}: ${shop.gstin}`);

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(isGst ? s.taxInvoice : s.estimate, PAGE_MARGIN, PAGE_MARGIN, { align: 'right' });
  doc.font('Helvetica').fontSize(9);
  doc.text(`${s.billNo}: ${bill.billNumber}`, { align: 'right' });
  doc.text(`${s.billDate}: ${bill.billDate.toLocaleDateString('en-IN')}`, { align: 'right' });

  let y = 110;
  doc.font('Helvetica-Bold').fontSize(9).text(s.billTo, PAGE_MARGIN, y);
  y += 13;
  doc.font('Helvetica').fontSize(9);
  doc.text(bill.customerNameSnapshot ?? s.walkIn, PAGE_MARGIN, y);
  y += 12;
  if (bill.walkInPhone) {
    doc.text(`${s.phone}: ${bill.walkInPhone}`, PAGE_MARGIN, y);
    y += 12;
  }
  if (isGst && bill.customerGstin) {
    doc.text(`${s.gstin}: ${bill.customerGstin}`, PAGE_MARGIN, y);
    y += 12;
  }
  doc.text(`${s.placeOfSupply}: ${bill.placeOfSupplyState}`, PAGE_MARGIN, y);
  y += 20;

  if (!isGst) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555').text(s.notATaxInvoice, PAGE_MARGIN, y);
    doc.fillColor('black').font('Helvetica');
    y += 16;
  }

  const columns = buildColumns(isGst, bill.taxType, s);
  const afterTableY = drawTable(doc, columns, items, y, isGst);
  const afterTotalsY = drawTotals(doc, bill, s, afterTableY, isGst);

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(`${s.amountInWords}: `, PAGE_MARGIN, afterTotalsY + 10, { continued: true })
    .font('Helvetica')
    .text(amountInWordsIndian(Number(bill.grandTotal), lang));

  doc
    .font('Helvetica-Oblique')
    .fontSize(9)
    .text(s.thankYou, PAGE_MARGIN, doc.page.height - PAGE_MARGIN - 20, { align: 'center' });
}

/** Filenames must not contain "/" — FY27/T/00001 → FY27-T-00001.pdf. */
export function invoiceFileName(billNumber: string): string {
  return `${billNumber.replace(/\//g, '-')}.pdf`;
}

/**
 * Streams the invoice straight to the response. Invoices are rendered fresh on
 * every download rather than kept on disk: the bill row is the source of truth,
 * rendering one takes milliseconds, and a shop doing a few hundred bills a month
 * would otherwise accumulate a directory that only ever grows — and goes stale
 * the moment a bill is revised or the shop's details change.
 */
export function streamInvoicePdf(res: Response, data: InvoicePdfData): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoiceFileName(data.bill.billNumber)}"`);
  doc.pipe(res);

  renderInvoicePdf(doc, data);
  doc.end();

  return new Promise<void>((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('error', reject);
    doc.on('error', reject);
  });
}
