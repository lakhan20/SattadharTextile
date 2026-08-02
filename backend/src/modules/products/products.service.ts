import { AuditAction, Role, StockMovementType, type Prisma, type Product, type Unit } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './products.schema';

export interface ProductResponse {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string;
  subCategoryId: string | null;
  hsnCode: string | null;
  unit: Unit;
  retailRate: number;
  wholesaleRate: number;
  /** Present only when serialised for an ADMIN viewer. */
  costPrice?: number;
  gstPercent: number;
  colour: string | null;
  width: string | null;
  gsm: number | null;
  imageUrl: string | null;
  openingStock: number;
  currentStock: number;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The only place a Product row becomes an API response. costPrice is added
 * to the object only for ADMIN, so it is genuinely absent from the JSON sent
 * to STAFF — not merely blanked out.
 */
export function serializeProduct(product: Product, viewerRole: Role): ProductResponse {
  const response: ProductResponse = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    categoryId: product.categoryId,
    subCategoryId: product.subCategoryId,
    hsnCode: product.hsnCode,
    unit: product.unit,
    retailRate: Number(product.retailRate),
    wholesaleRate: Number(product.wholesaleRate),
    gstPercent: Number(product.gstPercent),
    colour: product.colour,
    width: product.width,
    gsm: product.gsm,
    imageUrl: product.imageUrl,
    openingStock: Number(product.openingStock),
    currentStock: Number(product.currentStock),
    reorderLevel: Number(product.reorderLevel),
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
  if (viewerRole === Role.ADMIN) response.costPrice = Number(product.costPrice);
  return response;
}

export interface ListProductsResult {
  items: ProductResponse[];
  pagination: PaginationMeta;
}

export async function listProducts(query: ListProductsQuery, viewerRole: Role): Promise<ListProductsResult> {
  const { page, pageSize, search, categoryId, subCategoryId, isActive } = query;

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    ...(subCategoryId ? { subCategoryId } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map((p) => serializeProduct(p, viewerRole)),
    pagination: buildPaginationMeta(page, pageSize, total),
  };
}

async function findProductOrThrow(id: string): Promise<Product> {
  const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!product) throw notFound('That product does not exist.');
  return product;
}

export async function getProductById(id: string, viewerRole: Role): Promise<ProductResponse> {
  const product = await findProductOrThrow(id);
  return serializeProduct(product, viewerRole);
}

async function assertCategoryAndSubCategory(
  categoryId: string,
  subCategoryId: string | null | undefined,
): Promise<void> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, deletedAt: null } });
  if (!category) throw notFound('That category does not exist.');

  if (subCategoryId) {
    const subCategory = await prisma.subCategory.findFirst({ where: { id: subCategoryId, deletedAt: null } });
    if (!subCategory) throw notFound('That sub-category does not exist.');
    if (subCategory.categoryId !== categoryId) {
      throw badRequest('That sub-category does not belong to the selected category.');
    }
  }
}

export async function createProduct(
  input: CreateProductInput,
  actor: { id: string; role: Role },
  req: Request,
): Promise<ProductResponse> {
  await assertCategoryAndSubCategory(input.categoryId, input.subCategoryId);

  const existingSku = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (existingSku) throw conflict('That SKU is already in use.');

  // costPrice is ADMIN-only end to end: a non-ADMIN caller (even one holding
  // the product.create permission) can never set it, regardless of what the
  // request body contains.
  const costPrice = actor.role === Role.ADMIN ? input.costPrice ?? 0 : 0;

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: input.name,
        sku: input.sku,
        categoryId: input.categoryId,
        subCategoryId: input.subCategoryId ?? null,
        hsnCode: input.hsnCode ?? null,
        unit: input.unit,
        retailRate: input.retailRate,
        wholesaleRate: input.wholesaleRate,
        costPrice,
        gstPercent: input.gstPercent,
        colour: input.colour ?? null,
        width: input.width ?? null,
        gsm: input.gsm ?? null,
        imageUrl: input.imageUrl ?? null,
        openingStock: input.openingStock,
        currentStock: input.openingStock,
        reorderLevel: input.reorderLevel,
      },
    });

    if (input.openingStock > 0) {
      await tx.stockMovement.create({
        data: {
          productId: created.id,
          type: StockMovementType.OPENING,
          qty: input.openingStock,
          balanceAfter: input.openingStock,
          rate: costPrice,
          reason: 'Opening stock',
          createdById: actor.id,
        },
      });
    }

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Product',
      entityId: created.id,
      after: created,
      req,
      tx,
    });

    return created;
  });

  return serializeProduct(product, actor.role);
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  actor: { id: string; role: Role },
  req: Request,
): Promise<ProductResponse> {
  const before = await findProductOrThrow(id);

  const categoryId = input.categoryId ?? before.categoryId;
  const subCategoryId = input.subCategoryId ?? (input.categoryId ? undefined : before.subCategoryId);
  if (input.categoryId || input.subCategoryId) {
    await assertCategoryAndSubCategory(categoryId, subCategoryId);
  }

  if (input.sku) {
    const existingSku = await prisma.product.findFirst({ where: { sku: input.sku, id: { not: id } } });
    if (existingSku) throw conflict('That SKU is already in use.');
  }

  const product = await prisma.$transaction(async (tx) => {
    // openingStock/currentStock are intentionally never written here — once a
    // product exists, stock only changes through stock_movements (the stock
    // module, not yet built). Editing them here would desync the two.
    const updated = await tx.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.subCategoryId !== undefined ? { subCategoryId: input.subCategoryId } : {}),
        ...(input.hsnCode !== undefined ? { hsnCode: input.hsnCode } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.retailRate !== undefined ? { retailRate: input.retailRate } : {}),
        ...(input.wholesaleRate !== undefined ? { wholesaleRate: input.wholesaleRate } : {}),
        // costPrice is ADMIN-only end to end — a non-ADMIN caller's value is dropped, never applied.
        ...(input.costPrice !== undefined && actor.role === Role.ADMIN ? { costPrice: input.costPrice } : {}),
        ...(input.gstPercent !== undefined ? { gstPercent: input.gstPercent } : {}),
        ...(input.colour !== undefined ? { colour: input.colour } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.gsm !== undefined ? { gsm: input.gsm } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'Product',
      entityId: updated.id,
      before,
      after: updated,
      req,
      tx,
    });

    return updated;
  });

  return serializeProduct(product, actor.role);
}

export interface LastPriceResponse {
  rate: number;
  qty: number;
  unit: Unit;
  billNumber: string;
  billDate: string;
}

/**
 * The last price THIS product sold for TO THIS CUSTOMER — never costPrice or
 * margin. Powers the staff on-demand "what did we sell this to them for last
 * time" lookup at the billing counter.
 */
export async function getLastPriceForCustomer(productId: string, customerId: string): Promise<LastPriceResponse | null> {
  await findProductOrThrow(productId);

  const lastItem = await prisma.billItem.findFirst({
    where: { productId, bill: { customerId } },
    orderBy: { createdAt: 'desc' },
    include: { bill: { select: { billNumber: true, billDate: true } } },
  });
  if (!lastItem) return null;

  return {
    rate: Number(lastItem.rate),
    qty: Number(lastItem.qty),
    unit: lastItem.unit,
    billNumber: lastItem.bill.billNumber,
    billDate: lastItem.bill.billDate.toISOString(),
  };
}

export async function deleteProduct(id: string, actor: { id: string }, req: Request): Promise<void> {
  const before = await findProductOrThrow(id);

  const product = await prisma.product.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  await writeAudit({
    userId: actor.id,
    action: AuditAction.DELETE,
    entity: 'Product',
    entityId: product.id,
    before,
    after: product,
    req,
  });
}
