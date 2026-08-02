import type { Response } from 'express';
import type { ShopSetting } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatShopDateTime } from './reports.period';

/**
 * ── One document, two renderers ──────────────────────────────────────────
 *
 * Each report describes itself once as a `ReportDocument` — a title, a date
 * range, a few summary figures and one or more tables. The PDF renderer and
 * the Excel renderer both consume that same description, so a column added to
 * a report appears in both exports and cannot drift between them.
 *
 * pdfkit, not puppeteer: the shop server may well be an ARM64 box, and pulling
 * a headless Chromium onto it to draw a table would be absurd. Both formats
 * stream straight to the response rather than landing on disk — there is no
 * generated-file directory to grow unbounded or to clean up, and a report is
 * cheap enough to rebuild that caching it buys nothing.
 */

export type CellFormat = 'text' | 'money' | 'qty' | 'int' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  header: string;
  /** Relative weight — the renderer scales all columns to the page width. */
  width?: number;
  align?: 'left' | 'right' | 'center';
  format?: CellFormat;
}

export type CellValue = string | number | null | undefined;

export interface ReportSection {
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, CellValue>[];
  /** Bold summary row pinned under the table. Keys match `columns`. */
  totals?: Record<string, CellValue>;
  /** Shown in place of the table when `rows` is empty. */
  emptyText?: string;
}

export interface ReportDocument {
  /** File-name stem: "sales", "gst-summary". */
  slug: string;
  title: string;
  subtitle?: string;
  range?: { from: string; to: string };
  /** Headline figures printed as a strip above the first table. */
  summary?: { label: string; value: string }[];
  sections: ReportSection[];
  /** Caveats — e.g. that estimates are excluded from a GST return. */
  notes?: string[];
  /** Wide tables need the extra 260pt. */
  orientation?: 'portrait' | 'landscape';
}

// ── Brand ────────────────────────────────────────────────────────────────

/**
 * Mirrors `mobile/src/theme/tokens.ts` — a printed report should look like it
 * came from the same shop as the app. These are the only literals here; if the
 * palette moves again, it moves in both places together.
 */
const BRAND = {
  primary: '#0D4C59',
  primaryDark: '#07333C',
  accent: '#8B3A76',
  ink: '#161C20',
  muted: '#5A666D',
  faint: '#9FA9AE',
  hairline: '#E1E5E7',
  zebra: '#F7F8F8',
} as const;

// ── Value formatting ─────────────────────────────────────────────────────

/**
 * True only for something that can genuinely be rendered as a number. Totals
 * rows label themselves in whichever column reads best — often a numeric one
 * ("Total" under a rate column) — and `Number('Total')` is NaN, which would
 * print as "NaN%" in the PDF and land as an error cell in Excel.
 */
function isNumeric(value: CellValue): value is number | string {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

/** Indian grouping (12,34,567.00) — the way every figure in this app reads. */
function formatValue(value: CellValue, format: CellFormat = 'text'): string {
  if (value === null || value === undefined || value === '') return format === 'text' ? '' : '—';
  // A label sitting in a numeric column prints as itself, not as NaN.
  if (format !== 'text' && format !== 'date' && !isNumeric(value)) return String(value);

  switch (format) {
    case 'money':
      return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'qty':
      return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    case 'int':
      return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    case 'percent':
      return `${Number(value).toFixed(2)}%`;
    default:
      return String(value);
  }
}

/** Numeric columns are right-aligned unless the report says otherwise. */
function columnAlign(column: ReportColumn): 'left' | 'right' | 'center' {
  if (column.align) return column.align;
  return column.format && column.format !== 'text' && column.format !== 'date' ? 'right' : 'left';
}

export function exportFileName(doc: ReportDocument, extension: 'pdf' | 'xlsx'): string {
  const range = doc.range ? `_${doc.range.from}_${doc.range.to}` : `_${new Date().toISOString().slice(0, 10)}`;
  return `sattadhar-${doc.slug}${range}.${extension}`;
}

// ── PDF ──────────────────────────────────────────────────────────────────

const MARGIN = 34;
const HEADER_ROW_HEIGHT = 20;
const BASE_ROW_HEIGHT = 16;

interface Laid {
  column: ReportColumn;
  x: number;
  width: number;
}

/** Scales the declared column weights to exactly fill the printable width. */
function layoutColumns(columns: ReportColumn[], available: number): Laid[] {
  const weights = columns.map((c) => c.width ?? 80);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let x = MARGIN;
  return columns.map((column, index) => {
    const width = (weights[index]! / totalWeight) * available;
    const laid = { column, x, width };
    x += width;
    return laid;
  });
}

function drawShopHeader(pdf: PDFKit.PDFDocument, shop: ShopSetting, doc: ReportDocument, printable: number): number {
  // A filled brand band, so a printed report is recognisable face-down on a desk.
  pdf.rect(0, 0, pdf.page.width, 66).fill(BRAND.primary);

  pdf.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(15).text(shop.displayName, MARGIN, 16, { width: printable * 0.6 });

  const shopLine = [shop.addressLine, shop.city, shop.pincode].filter(Boolean).join(', ');
  const contact = [shopLine, shop.phone ? `Ph ${shop.phone}` : null, shop.gstin ? `GSTIN ${shop.gstin}` : null]
    .filter(Boolean)
    .join('  ·  ');
  pdf.font('Helvetica').fontSize(8).fillColor('#C6DDE2').text(contact, MARGIN, 36, { width: printable * 0.6 });

  pdf
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#FFFFFF')
    .text(doc.title.toUpperCase(), MARGIN, 18, { width: printable, align: 'right' });

  const rangeLine = doc.range ? `${doc.range.from}  to  ${doc.range.to}` : formatShopDateTime(new Date());
  pdf.font('Helvetica').fontSize(8).fillColor('#C6DDE2').text(rangeLine, MARGIN, 36, { width: printable, align: 'right' });

  return 82;
}

function drawSummaryStrip(pdf: PDFKit.PDFDocument, doc: ReportDocument, y: number, printable: number): number {
  if (!doc.summary?.length) return y;

  const perRow = Math.min(4, doc.summary.length);
  const cellWidth = printable / perRow;
  let cursor = y;

  doc.summary.forEach((item, index) => {
    const column = index % perRow;
    if (column === 0 && index > 0) cursor += 34;
    const x = MARGIN + column * cellWidth;
    pdf.font('Helvetica').fontSize(7).fillColor(BRAND.muted).text(item.label.toUpperCase(), x, cursor, {
      width: cellWidth - 8,
    });
    pdf.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.ink).text(item.value, x, cursor + 11, {
      width: cellWidth - 8,
    });
  });

  cursor += 40;
  pdf.moveTo(MARGIN, cursor).lineTo(MARGIN + printable, cursor).lineWidth(0.5).strokeColor(BRAND.hairline).stroke();
  return cursor + 12;
}

function drawSection(
  pdf: PDFKit.PDFDocument,
  section: ReportSection,
  startY: number,
  printable: number,
): number {
  let y = startY;
  const laid = layoutColumns(section.columns, printable);
  const bottomLimit = pdf.page.height - MARGIN - 24;

  const newPageIfNeeded = (needed: number): void => {
    if (y + needed <= bottomLimit) return;
    pdf.addPage();
    y = MARGIN;
    drawHeaderRow();
  };

  function drawHeaderRow(): void {
    pdf.rect(MARGIN, y, printable, HEADER_ROW_HEIGHT).fill(BRAND.primary);
    pdf.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
    for (const { column, x, width } of laid) {
      pdf.text(column.header.toUpperCase(), x + 4, y + 6, {
        width: width - 8,
        align: columnAlign(column),
        lineBreak: false,
      });
    }
    y += HEADER_ROW_HEIGHT;
  }

  if (section.title) {
    newPageIfNeeded(24);
    pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(BRAND.primaryDark).text(section.title, MARGIN, y);
    y += 16;
  }

  if (section.rows.length === 0) {
    pdf.font('Helvetica-Oblique').fontSize(9).fillColor(BRAND.muted).text(section.emptyText ?? 'Nothing to show for this period.', MARGIN, y, {
      width: printable,
    });
    return y + 22;
  }

  drawHeaderRow();
  pdf.font('Helvetica').fontSize(8);

  section.rows.forEach((row, index) => {
    // The first column is the one that wraps (a product name); everything else
    // is a figure that must stay on one line for the column to read straight.
    const firstColumn = laid[0]!;
    const rowHeight = Math.max(
      BASE_ROW_HEIGHT,
      pdf.heightOfString(formatValue(row[firstColumn.column.key], firstColumn.column.format), {
        width: firstColumn.width - 8,
      }) + 6,
    );

    newPageIfNeeded(rowHeight);

    if (index % 2 === 1) pdf.rect(MARGIN, y, printable, rowHeight).fill(BRAND.zebra);

    pdf.font('Helvetica').fontSize(8).fillColor(BRAND.ink);
    for (const { column, x, width } of laid) {
      pdf.text(formatValue(row[column.key], column.format), x + 4, y + 4, {
        width: width - 8,
        align: columnAlign(column),
        lineBreak: column.key === firstColumn.column.key,
        ellipsis: column.key !== firstColumn.column.key,
      });
    }
    y += rowHeight;
  });

  if (section.totals) {
    newPageIfNeeded(BASE_ROW_HEIGHT + 6);
    pdf.moveTo(MARGIN, y).lineTo(MARGIN + printable, y).lineWidth(1).strokeColor(BRAND.primary).stroke();
    y += 3;
    pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.primaryDark);
    for (const { column, x, width } of laid) {
      const value = section.totals[column.key];
      if (value === undefined) continue;
      pdf.text(formatValue(value, column.format), x + 4, y + 3, {
        width: width - 8,
        align: columnAlign(column),
        lineBreak: false,
      });
    }
    y += BASE_ROW_HEIGHT + 4;
  }

  return y + 14;
}

/**
 * Streams the report as a PDF. The response is piped directly, so nothing is
 * buffered in memory beyond pdfkit's own page and nothing is written to disk.
 */
export function streamReportPdf(res: Response, shop: ShopSetting, doc: ReportDocument): Promise<void> {
  const pdf = new PDFDocument({
    size: 'A4',
    layout: doc.orientation ?? 'portrait',
    margin: MARGIN,
    bufferPages: true,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(doc, 'pdf')}"`);
  pdf.pipe(res);

  const printable = pdf.page.width - MARGIN * 2;

  let y = drawShopHeader(pdf, shop, doc, printable);

  if (doc.subtitle) {
    pdf.font('Helvetica').fontSize(9).fillColor(BRAND.muted).text(doc.subtitle, MARGIN, y, { width: printable });
    y += 18;
  }

  y = drawSummaryStrip(pdf, doc, y, printable);

  for (const section of doc.sections) {
    y = drawSection(pdf, section, y, printable);
  }

  if (doc.notes?.length) {
    if (y > pdf.page.height - MARGIN - 60) {
      pdf.addPage();
      y = MARGIN;
    }
    pdf.font('Helvetica-Oblique').fontSize(7.5).fillColor(BRAND.muted);
    for (const note of doc.notes) {
      pdf.text(`· ${note}`, MARGIN, y, { width: printable });
      y += 12;
    }
  }

  // Footer on every page. `bufferPages` keeps them all open until now, so the
  // "Page 1 of 4" can be written once the total is actually known.
  const pageRange = pdf.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    pdf.switchToPage(pageRange.start + index);
    pdf
      .font('Helvetica')
      .fontSize(7)
      .fillColor(BRAND.faint)
      .text(
        `${shop.displayName}  ·  Generated ${formatShopDateTime(new Date())}  ·  Page ${index + 1} of ${pageRange.count}`,
        MARGIN,
        pdf.page.height - MARGIN + 2,
        { width: pdf.page.width - MARGIN * 2, align: 'center', lineBreak: false },
      );
  }

  pdf.flushPages();
  pdf.end();

  return new Promise<void>((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('error', reject);
    pdf.on('error', reject);
  });
}

// ── Excel ────────────────────────────────────────────────────────────────

/** exceljs wants ARGB without the '#'. */
const argb = (hex: string): string => `FF${hex.replace('#', '')}`;

const NUMBER_FORMAT: Record<CellFormat, string | undefined> = {
  text: undefined,
  date: undefined,
  money: '#,##,##0.00',
  qty: '#,##,##0.###',
  int: '#,##,##0',
  percent: '0.00"%"',
};

/**
 * Streams the report as .xlsx — one worksheet per section, so an accountant
 * can pivot the detail without first having to unpick a merged layout.
 * Figures are written as real numbers with an Indian number format, never as
 * pre-formatted strings: a spreadsheet that cannot sum its own column is
 * worth nothing.
 */
export async function streamReportExcel(res: Response, shop: ShopSetting, doc: ReportDocument): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = shop.displayName;
  workbook.created = new Date();

  const usedNames = new Set<string>();
  const sheetName = (title: string | undefined, index: number): string => {
    // Excel: 31 chars max, and none of : \ / ? * [ ]
    const base = (title ?? doc.title).replace(/[:\\/?*[\]]/g, ' ').slice(0, 28).trim() || `Sheet ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) name = `${base.slice(0, 26)} ${suffix++}`;
    usedNames.add(name);
    return name;
  };

  doc.sections.forEach((section, sectionIndex) => {
    const sheet = workbook.addWorksheet(sheetName(section.title, sectionIndex), {
      views: [{ state: 'frozen', ySplit: 0 }],
    });

    const lastColumn = Math.max(1, section.columns.length);

    /** Writes a full-width merged line and returns the row it used. */
    const banner = (text: string, options: { bold?: boolean; size?: number; colour?: string; fill?: string }): void => {
      const row = sheet.addRow([text]);
      sheet.mergeCells(row.number, 1, row.number, lastColumn);
      const cell = row.getCell(1);
      cell.font = {
        bold: options.bold ?? false,
        size: options.size ?? 10,
        color: { argb: argb(options.colour ?? BRAND.ink) },
        name: 'Calibri',
      };
      if (options.fill) {
        for (let column = 1; column <= lastColumn; column += 1) {
          row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(options.fill) } };
        }
      }
      cell.alignment = { vertical: 'middle' };
      row.height = options.size && options.size > 12 ? 24 : 18;
    };

    // Shop header — the same identity block the PDF carries.
    banner(shop.displayName, { bold: true, size: 14, colour: '#FFFFFF', fill: BRAND.primary });
    const contact = [
      [shop.addressLine, shop.city, shop.pincode].filter(Boolean).join(', '),
      shop.phone ? `Ph ${shop.phone}` : null,
      shop.gstin ? `GSTIN ${shop.gstin}` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (contact) banner(contact, { size: 9, colour: BRAND.muted });

    banner(section.title ? `${doc.title} — ${section.title}` : doc.title, { bold: true, size: 12, colour: BRAND.primaryDark });
    if (doc.range) banner(`${doc.range.from} to ${doc.range.to}`, { size: 9, colour: BRAND.muted });
    if (sectionIndex === 0 && doc.subtitle) banner(doc.subtitle, { size: 9, colour: BRAND.muted });

    if (sectionIndex === 0 && doc.summary?.length) {
      sheet.addRow([]);
      for (const item of doc.summary) {
        const row = sheet.addRow([item.label, item.value]);
        row.getCell(1).font = { size: 9, color: { argb: argb(BRAND.muted) } };
        row.getCell(2).font = { size: 10, bold: true, color: { argb: argb(BRAND.ink) } };
      }
    }

    sheet.addRow([]);

    const headerRow = sheet.addRow(section.columns.map((column) => column.header));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND.primary) } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: argb(BRAND.primaryDark) } } };
    });
    headerRow.height = 22;

    if (section.rows.length === 0) {
      const row = sheet.addRow([section.emptyText ?? 'Nothing to show for this period.']);
      sheet.mergeCells(row.number, 1, row.number, lastColumn);
      row.getCell(1).font = { italic: true, size: 9, color: { argb: argb(BRAND.muted) } };
    }

    for (const source of section.rows) {
      const row = sheet.addRow(
        section.columns.map((column) => {
          const value = source[column.key];
          if (value === null || value === undefined) return null;
          // Numbers stay numbers so the sheet can sum and sort them; a label
          // in a numeric column stays a string rather than becoming #NUM!.
          const numericColumn = column.format && column.format !== 'text' && column.format !== 'date';
          return numericColumn && isNumeric(value) ? Number(value) : value;
        }),
      );
      section.columns.forEach((column, index) => {
        const cell = row.getCell(index + 1);
        const numberFormat = column.format ? NUMBER_FORMAT[column.format] : undefined;
        if (numberFormat) cell.numFmt = numberFormat;
        cell.alignment = { horizontal: columnAlign(column), vertical: 'middle' };
        cell.font = { size: 9.5 };
      });
    }

    if (section.totals) {
      const row = sheet.addRow(
        section.columns.map((column) => {
          const value = section.totals?.[column.key];
          if (value === null || value === undefined) return null;
          const numericColumn = column.format && column.format !== 'text' && column.format !== 'date';
          return numericColumn && isNumeric(value) ? Number(value) : value;
        }),
      );
      row.eachCell((cell, index) => {
        const column = section.columns[index - 1];
        const numberFormat = column?.format ? NUMBER_FORMAT[column.format] : undefined;
        if (numberFormat) cell.numFmt = numberFormat;
        cell.font = { bold: true, size: 9.5, color: { argb: argb(BRAND.primaryDark) } };
        cell.alignment = { horizontal: column ? columnAlign(column) : 'right', vertical: 'middle' };
        cell.border = { top: { style: 'thin', color: { argb: argb(BRAND.primary) } } };
      });
    }

    if (sectionIndex === doc.sections.length - 1 && doc.notes?.length) {
      sheet.addRow([]);
      for (const note of doc.notes) banner(note, { size: 8, colour: BRAND.muted });
    }

    // Width from the widest of header/sample values, clamped so one long
    // product name cannot push the money columns off the screen.
    section.columns.forEach((column, index) => {
      const sample = section.rows.slice(0, 200).map((row) => formatValue(row[column.key], column.format).length);
      const widest = Math.max(column.header.length, ...(sample.length ? sample : [0]));
      sheet.getColumn(index + 1).width = Math.min(42, Math.max(10, widest + 3));
    });

    if (section.rows.length > 0) {
      sheet.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: { row: headerRow.number, column: lastColumn },
      };
      sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
    }
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(doc, 'xlsx')}"`);
  await workbook.xlsx.write(res);
  res.end();
}
