/**
 * A tiny in-memory stand-in for the Prisma client.
 *
 * It implements only the operations the auth module actually performs, which
 * lets the whole sign-in / lockout / refresh / logout flow be exercised end to
 * end — through real Express, real JWTs, real bcrypt — without a database.
 */

type Row = Record<string, unknown>;

export interface FakeDb {
  users: Row[];
  refreshTokens: Row[];
  auditLogs: Row[];
  /** Reports count low stock through the query builder rather than raw SQL. */
  products: Row[];
  /** Exports read the shop header from here. */
  shopSettings: Row[];
  /** The khata statement reads both of these through the query builder. */
  customers: Row[];
  ledgerEntries: Row[];
}

export const db: FakeDb = {
  users: [],
  refreshTokens: [],
  auditLogs: [],
  products: [],
  shopSettings: [],
  customers: [],
  ledgerEntries: [],
};

export function resetDb(): void {
  db.users = [];
  db.refreshTokens = [];
  db.auditLogs = [];
  db.products = [];
  db.shopSettings = [];
  db.customers = [];
  db.ledgerEntries = [];
}

const toTime = (v: unknown): number =>
  v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Number.NaN;

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
    const c = condition as Record<string, unknown>;
    if ('not' in c) return value !== c['not'];
    if ('lt' in c) return toTime(value) < toTime(c['lt']);
    if ('lte' in c) return toTime(value) <= toTime(c['lte']);
    if ('gt' in c) return toTime(value) > toTime(c['gt']);
    if ('gte' in c) return toTime(value) >= toTime(c['gte']);
    if ('equals' in c) return value === c['equals'];
    return false;
  }
  if (condition instanceof Date) return toTime(value) === toTime(condition);
  return value === condition;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => matchesCondition(row[key], condition));
}

interface FindArgs {
  where?: Row;
}
interface CreateArgs {
  data: Row;
}
interface UpdateArgs {
  where: Row;
  data: Row;
}

function makeDelegate(table: keyof FakeDb, defaults: () => Row) {
  return {
    findUnique: async (args: FindArgs) => db[table].find((r) => matches(r, args.where)) ?? null,
    findFirst: async (args: FindArgs) => db[table].find((r) => matches(r, args.where)) ?? null,
    findMany: async (args?: FindArgs) => db[table].filter((r) => matches(r, args?.where)),
    count: async (args?: FindArgs) => db[table].filter((r) => matches(r, args?.where)).length,
    create: async (args: CreateArgs) => {
      const row = { ...defaults(), ...args.data };
      db[table].push(row);
      return row;
    },
    update: async (args: UpdateArgs) => {
      const row = db[table].find((r) => matches(r, args.where));
      if (!row) throw new Error(`${table}: record not found`);
      Object.assign(row, args.data);
      return row;
    },
    updateMany: async (args: UpdateArgs) => {
      const rows = db[table].filter((r) => matches(r, args.where));
      rows.forEach((r) => Object.assign(r, args.data));
      return { count: rows.length };
    },
    deleteMany: async (args?: FindArgs) => {
      const keep = db[table].filter((r) => !matches(r, args?.where));
      const removed = db[table].length - keep.length;
      db[table] = keep;
      return { count: removed };
    },
  };
}

let auditSeq = 0;

export const fakePrisma = {
  user: makeDelegate('users', () => ({
    id: `user-${db.users.length + 1}`,
    phone: null,
    email: null,
    language: 'EN',
    permissions: {},
    menuAccess: [],
    maxDiscountPercent: 0,
    isActive: true,
    deletedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
  })),
  refreshToken: {
    ...makeDelegate('refreshTokens', () => ({
      revokedAt: null,
      replacedBy: null,
      userAgent: null,
      ip: null,
      createdAt: new Date(),
    })),
    // The real query joins the user; reproduce that shape.
    findUnique: async (args: FindArgs) => {
      const row = db.refreshTokens.find((r) => matches(r, args.where));
      if (!row) return null;
      const user = db.users.find((u) => u['id'] === row['userId']) ?? null;
      return { ...row, user };
    },
  },
  auditLog: makeDelegate('auditLogs', () => ({ id: `audit-${++auditSeq}`, createdAt: new Date() })),

  product: {
    ...makeDelegate('products', () => ({ id: `product-${db.products.length + 1}` })),
    /**
     * Prisma's field-reference feature (`currentStock: { lte: fields.reorderLevel }`).
     * The real client compares two columns; here the marker is enough, since
     * `matchesCondition` falls through to a plain comparison.
     */
    fields: { reorderLevel: 'reorderLevel', currentStock: 'currentStock' },
  },

  shopSetting: makeDelegate('shopSettings', () => ({
    id: 'shop',
    legalName: 'Sattadhar Textile',
    displayName: 'SATTADHAR TEXTILE',
    gstin: null,
    state: 'Gujarat',
    addressLine: null,
    city: null,
    pincode: null,
    phone: null,
    email: null,
    logoUrl: null,
    roundOffEnabled: true,
    updatedAt: new Date(),
  })),

  customer: makeDelegate('customers', () => ({
    id: `customer-${db.customers.length + 1}`,
    email: null,
    gstin: null,
    addressLine: null,
    city: null,
    state: 'Gujarat',
    pincode: null,
    type: 'RETAIL',
    creditLimit: 0,
    openingBalance: 0,
    outstanding: 0,
    isActive: true,
    notes: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),

  ledgerEntry: {
    ...makeDelegate('ledgerEntries', () => ({
      id: `ledger-${db.ledgerEntries.length + 1}`,
      debit: 0,
      credit: 0,
      narration: null,
      paymentMode: null,
      billId: null,
      paymentId: null,
      noteId: null,
      createdById: null,
      entryDate: new Date(),
      createdAt: new Date(),
    })),
    /** Only the shape the statement asks for: summed debit/credit and a count. */
    aggregate: async (args?: FindArgs) => {
      const rows = db.ledgerEntries.filter((r) => matches(r, args?.where));
      const sum = (key: string) => rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
      return { _sum: { debit: sum('debit'), credit: sum('credit') }, _count: rows.length };
    },
  },

  $queryRaw: async () => [{ '?column?': 1 }],
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  $transaction: async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => Promise<unknown>)(fakePrisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  },
};

/** Convenience for tests: insert a customer row directly. */
export function seedCustomer(row: Row): Row {
  const customer: Row = {
    id: `customer-${db.customers.length + 1}`,
    name: 'Test Customer',
    phone: '+919820000099',
    email: null,
    gstin: null,
    addressLine: null,
    city: null,
    state: 'Gujarat',
    pincode: null,
    type: 'RETAIL',
    creditLimit: 0,
    openingBalance: 0,
    outstanding: 0,
    isActive: true,
    notes: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...row,
  };
  db.customers.push(customer);
  return customer;
}

/** Convenience for tests: insert a user row directly. */
export function seedUser(row: Row): Row {
  const user: Row = {
    id: `user-${db.users.length + 1}`,
    phone: null,
    email: null,
    role: 'STAFF',
    language: 'EN',
    permissions: {},
    menuAccess: [],
    maxDiscountPercent: 0,
    isActive: true,
    deletedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    ...row,
  };
  db.users.push(user);
  return user;
}
