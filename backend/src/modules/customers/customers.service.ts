import { AuditAction, LedgerEntryType, type Customer, type Prisma } from '@prisma/client';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma, type PrismaClientOrTx } from '../../config/prisma';
import { conflict, notFound } from '../../utils/errors';
import { writeAudit } from '../../utils/audit';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import { normalisePhone, phoneLookupCandidates } from '../../utils/phone';
import { postLedgerEntry } from '../ledger/ledger.posting';
import type { CreateCustomerInput, ListCustomersQuery } from './customers.schema';

/**
 * List, get, and create. Editing and soft-delete land with the rest of the
 * customers module; the khata reads this module for names and balances.
 */
export interface CustomerResponse {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  addressLine: string | null;
  city: string | null;
  state: string;
  pincode: string | null;
  type: Customer['type'];
  creditLimit: number;
  openingBalance: number;
  outstanding: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function serializeCustomer(customer: Customer): CustomerResponse {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    gstin: customer.gstin,
    addressLine: customer.addressLine,
    city: customer.city,
    state: customer.state,
    pincode: customer.pincode,
    type: customer.type,
    creditLimit: Number(customer.creditLimit),
    openingBalance: Number(customer.openingBalance),
    outstanding: Number(customer.outstanding),
    isActive: customer.isActive,
    notes: customer.notes,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export interface ListCustomersResult {
  items: CustomerResponse[];
  pagination: PaginationMeta;
}

export async function listCustomers(query: ListCustomersQuery): Promise<ListCustomersResult> {
  const { page, pageSize, search, type, isActive } = query;

  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    ...(type ? { type } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.customer.count({ where }),
  ]);

  return {
    items: items.map(serializeCustomer),
    pagination: buildPaginationMeta(page, pageSize, total),
  };
}

export async function getCustomerById(id: string): Promise<CustomerResponse> {
  const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
  if (!customer) throw notFound('That customer does not exist.');
  return serializeCustomer(customer);
}

// ── One customer per phone number ─────────────────────────────────────────

/**
 * Finds a live customer by phone, however the number was typed.
 *
 * Both sides are canonicalised: the needle by `normalisePhone`, the haystack
 * by the migration that rewrote every stored number to `+91XXXXXXXXXX`. A row
 * that could not be canonicalised (a landline, an extension) keeps its raw
 * value and is matched on that instead, so nothing becomes unfindable.
 */
export async function findActiveByPhone(
  phone: string,
  client: PrismaClientOrTx = prisma,
): Promise<Customer | null> {
  return client.customer.findFirst({
    where: { deletedAt: null, phone: { in: phoneLookupCandidates(phone) } },
    // Deterministic when more than one candidate hits: the canonical spelling
    // sorts before a bare 10-digit legacy row, so the tidied record wins.
    orderBy: { phone: 'asc' },
  });
}

export async function lookupByPhone(phone: string): Promise<CustomerResponse | null> {
  const customer = await findActiveByPhone(phone);
  return customer ? serializeCustomer(customer) : null;
}

type NewCustomerRow = Omit<CreateCustomerInput, 'openingBalance' | 'phone'> & { phone: string };

/**
 * Inserts a customer only if that phone number is not already on a live
 * record, and returns whichever row ended up being the one.
 *
 * `INSERT … SELECT … WHERE NOT EXISTS` is one statement, so the check and the
 * write cannot be separated by another connection's insert — the same
 * technique the stock and billing guards use, where the WHERE clause *is* the
 * atomicity boundary rather than a read taken beforehand.
 *
 * It has to be done here because the database will not do it: the schema's
 * `@@unique([phone, deletedAt])` does not bind for live rows, since Postgres
 * treats the NULL `deletedAt` on every active customer as distinct. Verified
 * against this database, and noted in the migration.
 */
async function insertIfPhoneFree(
  tx: PrismaClientOrTx,
  data: NewCustomerRow,
): Promise<{ customer: Customer; created: boolean }> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO customers (
      id, name, phone, email, gstin, "addressLine", city, state, pincode,
      type, "creditLimit", "openingBalance", outstanding, "isActive", notes,
      "createdAt", "updatedAt"
    )
    SELECT ${randomUUID()}, ${data.name}, ${data.phone}, ${data.email ?? null}, ${data.gstin ?? null},
           ${data.addressLine ?? null}, ${data.city ?? null}, ${data.state}, ${data.pincode ?? null},
           ${data.type}::"CustomerType", ${data.creditLimit}::numeric, 0, 0, true, ${data.notes ?? null},
           now(), now()
     WHERE NOT EXISTS (
       SELECT 1 FROM customers WHERE phone = ${data.phone} AND "deletedAt" IS NULL
     )
    RETURNING id
  `;

  if (rows.length > 0) {
    return { customer: await tx.customer.findUniqueOrThrow({ where: { id: rows[0]!.id } }), created: true };
  }

  // Someone else holds the number — either it was already there, or a
  // concurrent request won the race by a millisecond. Same answer either way.
  const existing = await tx.customer.findFirst({ where: { phone: data.phone, deletedAt: null } });
  if (!existing) throw conflict('That phone number could not be registered. Try again.');
  return { customer: existing, created: false };
}

export interface CreateCustomerResult extends CustomerResponse {
  /** False when an existing record was returned instead of a new one. */
  created: boolean;
}

/**
 * Registers a customer. Refuses, rather than duplicating, when the number is
 * already on file — the error names who holds it, because at the counter
 * "already exists" without a name is not actionable.
 */
export async function createCustomer(
  input: CreateCustomerInput,
  actor: { id: string },
  req: Request,
): Promise<CreateCustomerResult> {
  const phone = normalisePhone(input.phone);

  const existing = await findActiveByPhone(phone);
  if (existing) {
    throw conflict(`${existing.name} is already registered on ${existing.phone}. Open their record instead.`);
  }

  const customer = await prisma.$transaction(async (tx) => {
    const { customer: row, created } = await insertIfPhoneFree(tx, { ...input, phone });
    if (!created) {
      throw conflict(`${row.name} is already registered on ${row.phone}. Open their record instead.`);
    }

    // Through the ledger's posting helper, never a direct write to
    // `outstanding` — an opening balance is the khata's first line.
    if (input.openingBalance > 0) {
      await tx.customer.update({ where: { id: row.id }, data: { openingBalance: input.openingBalance } });
      await postLedgerEntry(tx, {
        customerId: row.id,
        type: LedgerEntryType.OPENING,
        amount: input.openingBalance,
        narration: 'Opening balance at registration',
        createdById: actor.id,
      });
    }

    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Customer',
      entityId: row.id,
      after: { ...row, openingBalance: input.openingBalance },
      req,
      tx,
    });

    return tx.customer.findUniqueOrThrow({ where: { id: row.id } });
  });

  return { ...serializeCustomer(customer), created: true };
}

/**
 * The walk-in path: find the number, or register it.
 *
 * Called from inside the bill transaction, so a bill that rolls back leaves no
 * customer behind. Deliberately never throws on "already exists" — a repeat
 * walk-in reusing their number is the normal case, and the whole point is that
 * it does not become a second record.
 */
export async function resolveOrCreateByPhone(
  tx: PrismaClientOrTx,
  input: { name: string; phone: string; state?: string; notes?: string },
  actor: { id: string },
  req: Request,
): Promise<{ customer: Customer; created: boolean }> {
  const phone = normalisePhone(input.phone);

  const result = await insertIfPhoneFree(tx, {
    name: input.name,
    phone,
    state: input.state ?? 'Gujarat',
    // A counter sale says nothing about wholesale terms or creditworthiness,
    // so a walk-in is registered as plain RETAIL with no credit limit set.
    // Both are the owner's to change once they know the customer.
    type: 'RETAIL',
    creditLimit: 0,
    ...(input.notes ? { notes: input.notes } : {}),
  } as NewCustomerRow);

  if (result.created) {
    await writeAudit({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Customer',
      entityId: result.customer.id,
      after: { ...result.customer, registeredFrom: 'walk-in bill' },
      req,
      tx,
    });
  }

  return result;
}
