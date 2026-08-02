import { AuditAction, Role, StockMovementType, Unit, type Prisma, type Product } from '@prisma/client';
import type { Request } from 'express';
import { Decimal } from 'decimal.js';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import type { ListMovementsQuery, LowStockQuery, StockAdjustInput, StockInInput } from './stock.schema';

/**
 * ── One source of truth ──────────────────────────────────────────────────
 *
 * `products.currentStock` is the balance; `stock_movements` is the ledger that
 * explains it. They are written together, in one transaction, by every code
 * path that touches stock — the bill (SALE), the product create (OPENING) and
 * the two entry points below (STOCK_IN, ADJUSTMENT).
 *
 * The balance is moved by a conditional raw UPDATE that returns the new value,
 * exactly as `bills.service.createBill` does. That is deliberate: the WHERE
 * clause is the atomicity boundary, so two people reducing the last of a
 * product at the same instant cannot both succeed, and the `balanceAfter`
 * written to the ledger is the value Postgres actually committed — never a
 * number this process computed from a stale read.
 */

interface Actor {
  id: string;
  role: Role;
}

export interface StockMovementResponse {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: Unit;
  type: StockMovementType;
  /** Signed: positive added, negative removed. */
  qty: number;
  balanceAfter: number;
  reason: string | null;
  supplierRef: string | null;
  billId: string | null;
  billNumber: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  /**
   * ADMIN-only. On a STOCK_IN row this is the landed/purchase rate, which is
   * cost data — the key is absent from the JSON sent to STAFF, not blanked.
   */
  rate?: number;
}

type MovementWithRelations = Prisma.StockMovementGetPayload<{
  include: {
    product: { select: { name: true; sku: true; unit: true } };
    bill: { select: { billNumber: true } };
    createdBy: { select: { name: true } };
  };
}>;

function serializeMovement(movement: MovementWithRelations, viewerRole: Role): StockMovementResponse {
  const response: StockMovementResponse = {
    id: movement.id,
    productId: movement.productId,
    productName: movement.product.name,
    sku: movement.product.sku,
    unit: movement.product.unit,
    type: movement.type,
    qty: Number(movement.qty),
    balanceAfter: Number(movement.balanceAfter),
    reason: movement.reason,
    supplierRef: movement.supplierRef,
    billId: movement.billId,
    billNumber: movement.bill?.billNumber ?? null,
    createdById: movement.createdById,
    createdByName: movement.createdBy?.name ?? null,
    createdAt: movement.createdAt.toISOString(),
  };
  if (viewerRole === Role.ADMIN) response.rate = Number(movement.rate);
  return response;
}

const MOVEMENT_INCLUDE = {
  product: { select: { name: true, sku: true, unit: true } },
  bill: { select: { billNumber: true } },
  createdBy: { select: { name: true } },
} as const;

async function findProductOrThrow(id: string): Promise<Product> {
  const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
  if (!product) throw notFound('That product does not exist.');
  return product;
}

/**
 * METER products take up to 3 decimals, PIECE products whole numbers only.
 * Checked on the magnitude, so a −2.5 adjustment on a PIECE product is refused
 * for the same reason +2.5 would be. Mirrors the check in `createBill`.
 */
function assertQtyMatchesUnit(product: Product, qty: number): void {
  const magnitude = Math.abs(qty);
  if (product.unit === Unit.PIECE && !Number.isInteger(magnitude)) {
    throw badRequest(`${product.name} is counted in pieces — the quantity must be a whole number.`);
  }
  if (product.unit === Unit.METER) {
    const rounded = Math.round(magnitude * 1000) / 1000;
    if (Math.abs(rounded - magnitude) > 1e-9) {
      throw badRequest(`${product.name} quantity supports up to 3 decimal places.`);
    }
  }
}

export interface StockEntryResult {
  movementId: string;
  productId: string;
  productName: string;
  unit: Unit;
  qty: number;
  balanceAfter: number;
  type: StockMovementType;
}

/**
 * Records an inward movement — a purchase, a consignment, a stock top-up.
 * Never fails on "not enough stock" because it only ever adds.
 */
export async function recordStockIn(input: StockInInput, actor: Actor, req: Request): Promise<StockEntryResult> {
  const product = await findProductOrThrow(input.productId);
  if (!product.isActive) throw badRequest(`${product.name} is inactive. Reactivate it before adding stock.`);
  assertQtyMatchesUnit(product, input.qty);

  // Landed cost is ADMIN-only end to end: a STAFF account holding `stock.in`
  // can record the quantity but never writes a rate into the ledger, so it can
  // neither set nor read cost data.
  const rate = actor.role === Role.ADMIN ? (input.rate ?? Number(product.costPrice)) : 0;

  const movement = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ currentStock: Decimal }[]>`
      UPDATE products SET "currentStock" = "currentStock" + ${input.qty}, "updatedAt" = now()
      WHERE id = ${input.productId} AND "deletedAt" IS NULL
      RETURNING "currentStock"
    `;
    if (rows.length === 0) throw notFound('That product does not exist.');

    const created = await tx.stockMovement.create({
      data: {
        productId: product.id,
        type: StockMovementType.STOCK_IN,
        qty: input.qty,
        balanceAfter: rows[0]!.currentStock,
        rate,
        reason: input.reason,
        supplierRef: input.supplierRef ?? null,
        createdById: actor.id,
      },
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'StockMovement',
      entityId: created.id,
      after: created,
      req,
      tx,
    });

    return created;
  });

  return {
    movementId: movement.id,
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    qty: Number(movement.qty),
    balanceAfter: Number(movement.balanceAfter),
    type: movement.type,
  };
}

/**
 * Damage, wastage, a customer return, or a plain counting correction. The qty
 * is signed, and a reduction is refused rather than allowed to drive the
 * balance negative — the guard lives in the UPDATE's WHERE clause so a
 * concurrent sale cannot slip underneath it.
 */
export async function recordStockAdjustment(
  input: StockAdjustInput,
  actor: Actor,
  req: Request,
): Promise<StockEntryResult> {
  const product = await findProductOrThrow(input.productId);
  assertQtyMatchesUnit(product, input.qty);

  const movement = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ currentStock: Decimal }[]>`
      UPDATE products SET "currentStock" = "currentStock" + ${input.qty}, "updatedAt" = now()
      WHERE id = ${input.productId} AND "deletedAt" IS NULL AND "currentStock" + ${input.qty} >= 0
      RETURNING "currentStock"
    `;
    if (rows.length === 0) {
      throw conflict(
        `That would take ${product.name} below zero. It currently holds ${Number(product.currentStock)}.`,
      );
    }

    const created = await tx.stockMovement.create({
      data: {
        productId: product.id,
        type: StockMovementType.ADJUSTMENT,
        qty: input.qty,
        balanceAfter: rows[0]!.currentStock,
        // An adjustment is a correction to the count, not a purchase — there is
        // no rate to record against it.
        rate: 0,
        reason: input.reason,
        createdById: actor.id,
      },
    });

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'StockMovement',
      entityId: created.id,
      after: created,
      req,
      tx,
    });

    return created;
  });

  return {
    movementId: movement.id,
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    qty: Number(movement.qty),
    balanceAfter: Number(movement.balanceAfter),
    type: movement.type,
  };
}

export interface ListMovementsResult {
  items: StockMovementResponse[];
  pagination: PaginationMeta;
}

/** Newest first — the ledger is read top-down, most recent change first. */
export async function listMovements(query: ListMovementsQuery, viewerRole: Role): Promise<ListMovementsResult> {
  const { page, pageSize, productId, from, to } = query;

  const where: Prisma.StockMovementWhereInput = {
    ...(productId ? { productId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: MOVEMENT_INCLUDE,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    items: items.map((m) => serializeMovement(m, viewerRole)),
    pagination: buildPaginationMeta(page, pageSize, total),
  };
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  imageUrl: string | null;
  categoryId: string;
  currentStock: number;
  reorderLevel: number;
  /** How far under the reorder level this product sits. 0 when exactly at it. */
  shortBy: number;
  outOfStock: boolean;
}

export interface LowStockResult {
  items: LowStockItem[];
  pagination: PaginationMeta;
}

interface LowStockRow {
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  imageUrl: string | null;
  categoryId: string;
  currentStock: Decimal;
  reorderLevel: Decimal;
}

/**
 * Products at or below their reorder level, worst shortfall first.
 *
 * Raw SQL rather than Prisma's field references because the ordering is by an
 * expression (`currentStock - reorderLevel`), which the query builder cannot
 * express. The column list is explicit and does NOT include costPrice — this
 * endpoint is open to STAFF.
 */
export async function listLowStock(query: LowStockQuery): Promise<LowStockResult> {
  const { page, pageSize, search } = query;
  const needle = search?.trim() ? `%${search.trim()}%` : null;
  const offset = (page - 1) * pageSize;

  const rows = await prisma.$queryRaw<LowStockRow[]>`
    SELECT id, name, sku, unit, "imageUrl", "categoryId", "currentStock", "reorderLevel"
    FROM products
    WHERE "deletedAt" IS NULL
      AND "isActive" = true
      AND "currentStock" <= "reorderLevel"
      AND (${needle}::text IS NULL OR name ILIKE ${needle} OR sku ILIKE ${needle})
    ORDER BY ("currentStock" - "reorderLevel") ASC, name ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
    FROM products
    WHERE "deletedAt" IS NULL
      AND "isActive" = true
      AND "currentStock" <= "reorderLevel"
      AND (${needle}::text IS NULL OR name ILIKE ${needle} OR sku ILIKE ${needle})
  `;
  const total = Number(countRows[0]?.total ?? 0);

  return {
    items: rows.map((row) => {
      const currentStock = Number(row.currentStock);
      const reorderLevel = Number(row.reorderLevel);
      return {
        id: row.id,
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        imageUrl: row.imageUrl,
        categoryId: row.categoryId,
        currentStock,
        reorderLevel,
        shortBy: Math.max(0, Math.round((reorderLevel - currentStock) * 1000) / 1000),
        outOfStock: currentStock <= 0,
      };
    }),
    pagination: buildPaginationMeta(page, pageSize, total),
  };
}

export interface StockValuationByUnit {
  unit: Unit;
  productCount: number;
  totalQty: number;
  costValue: number;
  retailValue: number;
}

export interface StockValuationResponse {
  asOf: string;
  productCount: number;
  lowStockCount: number;
  /** What the stock on the shelf cost to buy. */
  costValue: number;
  /** What it would fetch at the retail rate, before any discount. */
  retailValue: number;
  potentialMargin: number;
  /** Meters and pieces are never added together — a mixed total is meaningless. */
  byUnit: StockValuationByUnit[];
}

interface ValuationRow {
  unit: Unit;
  productCount: number;
  totalQty: Decimal | null;
  costValue: Decimal | null;
  retailValue: Decimal | null;
}

/**
 * ADMIN ONLY — this is built on costPrice and must never reach a STAFF token.
 * The route guard is `requireRole(ADMIN)`; nothing here is safe to relax.
 *
 * Inactive-but-not-deleted products are counted: the money is on the shelf
 * whether or not the product is currently offered for sale.
 */
export async function getStockValuation(): Promise<StockValuationResponse> {
  const [rows, lowStockCount] = await Promise.all([
    prisma.$queryRaw<ValuationRow[]>`
      SELECT unit,
             COUNT(*)::int                          AS "productCount",
             SUM("currentStock")                    AS "totalQty",
             SUM("currentStock" * "costPrice")      AS "costValue",
             SUM("currentStock" * "retailRate")     AS "retailValue"
      FROM products
      WHERE "deletedAt" IS NULL
      GROUP BY unit
      ORDER BY unit ASC
    `,
    prisma.product.count({
      where: {
        deletedAt: null,
        isActive: true,
        currentStock: { lte: prisma.product.fields.reorderLevel },
      },
    }),
  ]);

  const byUnit: StockValuationByUnit[] = rows.map((row) => ({
    unit: row.unit,
    productCount: row.productCount,
    totalQty: new Decimal(row.totalQty ?? 0).toDecimalPlaces(3).toNumber(),
    costValue: new Decimal(row.costValue ?? 0).toDecimalPlaces(2).toNumber(),
    retailValue: new Decimal(row.retailValue ?? 0).toDecimalPlaces(2).toNumber(),
  }));

  const costValue = byUnit.reduce((sum, row) => sum + row.costValue, 0);
  const retailValue = byUnit.reduce((sum, row) => sum + row.retailValue, 0);

  return {
    asOf: new Date().toISOString(),
    productCount: byUnit.reduce((sum, row) => sum + row.productCount, 0),
    lowStockCount,
    costValue: new Decimal(costValue).toDecimalPlaces(2).toNumber(),
    retailValue: new Decimal(retailValue).toDecimalPlaces(2).toNumber(),
    potentialMargin: new Decimal(retailValue).sub(costValue).toDecimalPlaces(2).toNumber(),
    byUnit,
  };
}
