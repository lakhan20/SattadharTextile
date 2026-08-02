import type { Customer, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/errors';
import { buildPaginationMeta, type PaginationMeta } from '../../utils/pagination';
import type { ListCustomersQuery } from './customers.schema';

/**
 * Read-only surface for now — the billing screen's customer picker is the
 * only consumer. Create/update/khata management land with the full
 * customers module.
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
