import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { AuditAction, Role, StockMovementType, Unit } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { writeAudit } from '../../utils/audit';

/**
 * Bulk-import row. Category/sub-category are given by name (not id) because
 * whoever fills the spreadsheet knows "Cotton", not a UUID.
 */
const importRowSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required.')
    .transform((v) => v.toUpperCase()),
  categoryName: z.string().trim().min(1, 'Category is required.'),
  subCategoryName: z.string().trim().optional(),
  hsnCode: z.string().trim().optional(),
  unit: z.enum(['METER', 'PIECE']).default('METER'),
  retailRate: z.coerce.number().nonnegative('Retail rate must be 0 or more.'),
  wholesaleRate: z.coerce.number().nonnegative('Wholesale rate must be 0 or more.'),
  costPrice: z.coerce.number().nonnegative().optional(),
  gstPercent: z.coerce.number().min(0).max(100).optional(),
  colour: z.string().trim().optional(),
  width: z.string().trim().optional(),
  gsm: z.coerce.number().int().positive().optional(),
  imageUrl: z.string().trim().optional(),
  openingStock: z.coerce.number().nonnegative().optional(),
  reorderLevel: z.coerce.number().nonnegative().optional(),
});

export interface BulkImportSummary {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

/** Empty cells arrive as '', null or undefined — normalise all three to undefined before zod sees them. */
function cleanRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text !== '') out[key] = text;
  }
  return out;
}

async function parseRows(buffer: Buffer, filename: string): Promise<Record<string, unknown>[]> {
  const isCsv = filename.toLowerCase().endsWith('.csv');

  if (isCsv) {
    const parsed = Papa.parse<Record<string, unknown>>(buffer.toString('utf-8'), {
      header: true,
      skipEmptyLines: true,
    });
    return parsed.data;
  }

  const workbook = new ExcelJS.Workbook();
  // Type-only mismatch between exceljs's Buffer typing and the installed
  // @types/node version — the value itself is a plain Buffer at runtime.
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) record[key] = cell.value;
    });
    const hasContent = Object.values(record).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (hasContent) rows.push(record);
  });
  return rows;
}

/**
 * Inserts every valid row and collects a per-row error for every invalid one.
 * One bad row never aborts the rest of the file.
 */
export async function bulkImportProducts(
  file: { buffer: Buffer; originalname: string },
  actor: { id: string; role: Role },
  req: Request,
): Promise<BulkImportSummary> {
  const rawRows = await parseRows(file.buffer, file.originalname);

  const summary: BulkImportSummary = { inserted: 0, skipped: 0, errors: [] };
  const seenSkus = new Set<string>();

  const categories = await prisma.category.findMany({ where: { deletedAt: null } });
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const subCategories = await prisma.subCategory.findMany({ where: { deletedAt: null } });
  const subCategoryByKey = new Map(subCategories.map((s) => [`${s.categoryId}:${s.name.toLowerCase()}`, s]));

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const parsed = importRowSchema.safeParse(cleanRow(rawRows[i] ?? {}));

    if (!parsed.success) {
      summary.skipped++;
      summary.errors.push({
        row: rowNumber,
        message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
      continue;
    }
    const data = parsed.data;

    const category = categoryByName.get(data.categoryName.toLowerCase());
    if (!category) {
      summary.skipped++;
      summary.errors.push({ row: rowNumber, message: `Category not found: "${data.categoryName}"` });
      continue;
    }
    if (!category.isActive) {
      summary.skipped++;
      summary.errors.push({ row: rowNumber, message: `Category "${data.categoryName}" is inactive.` });
      continue;
    }

    let subCategoryId: string | null = null;
    if (data.subCategoryName) {
      const subCategory = subCategoryByKey.get(`${category.id}:${data.subCategoryName.toLowerCase()}`);
      if (!subCategory) {
        summary.skipped++;
        summary.errors.push({
          row: rowNumber,
          message: `Sub-category not found under "${data.categoryName}": "${data.subCategoryName}"`,
        });
        continue;
      }
      subCategoryId = subCategory.id;
    }

    const skuKey = data.sku.toLowerCase();
    if (seenSkus.has(skuKey)) {
      summary.skipped++;
      summary.errors.push({ row: rowNumber, message: `Duplicate SKU in this file: "${data.sku}"` });
      continue;
    }
    const existingSku = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existingSku) {
      summary.skipped++;
      summary.errors.push({ row: rowNumber, message: `SKU already exists: "${data.sku}"` });
      continue;
    }

    try {
      const openingStock = data.openingStock ?? 0;
      // costPrice is ADMIN-only end to end — a non-ADMIN importer's column is ignored.
      const costPrice = actor.role === Role.ADMIN ? data.costPrice ?? 0 : 0;

      await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: data.name,
            sku: data.sku,
            categoryId: category.id,
            subCategoryId,
            hsnCode: data.hsnCode ?? null,
            unit: data.unit as Unit,
            retailRate: data.retailRate,
            wholesaleRate: data.wholesaleRate,
            costPrice,
            gstPercent: data.gstPercent ?? 5,
            colour: data.colour ?? null,
            width: data.width ?? null,
            gsm: data.gsm ?? null,
            imageUrl: data.imageUrl ?? null,
            openingStock,
            currentStock: openingStock,
            reorderLevel: data.reorderLevel ?? 0,
          },
        });

        if (openingStock > 0) {
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              type: StockMovementType.OPENING,
              qty: openingStock,
              balanceAfter: openingStock,
              rate: costPrice,
              reason: 'Opening stock (bulk import)',
              createdById: actor.id,
            },
          });
        }

        await writeAudit({
          userId: actor.id,
          action: AuditAction.CREATE,
          entity: 'Product',
          entityId: product.id,
          after: product,
          req,
          tx,
        });
      });

      seenSkus.add(skuKey);
      summary.inserted++;
    } catch (err) {
      summary.skipped++;
      summary.errors.push({ row: rowNumber, message: err instanceof Error ? err.message : 'Insert failed.' });
    }
  }

  await writeAudit({
    userId: actor.id,
    action: AuditAction.IMPORT,
    entity: 'Product',
    after: { inserted: summary.inserted, skipped: summary.skipped, errorCount: summary.errors.length },
    req,
  });

  return summary;
}
