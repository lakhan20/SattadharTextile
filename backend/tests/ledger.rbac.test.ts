import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { db, fakePrisma, resetDb, seedCustomer, seedUser } from './helpers/fakePrisma';

/**
 * ── The khata boundary, pinned down ──────────────────────────────────────
 *
 * The rule the shop actually cares about is not "staff cannot see the ledger"
 * — they must, or they cannot take money at the counter. It is:
 *
 *   ONE customer's khata → yes.  THE SHOP's debtor book → no.
 *
 * That is a subtler line than the reports one, and subtle lines are the ones
 * that rot. So each half is asserted separately: staff are admitted to the
 * per-customer surface, refused on the shop-wide surface with a hard 403, and
 * the statement payload is checked to carry no shop-wide figure at all.
 *
 * The write endpoints are asserted at the guard, not through the whole
 * transaction: a request that reaches validation has already cleared RBAC, so
 * a 400 there proves precisely what this suite is about. The arithmetic of a
 * payment is the service layer's job, and needs a real database.
 */
vi.mock('../src/config/prisma', () => ({
  prisma: { ...fakePrisma, $queryRaw: async () => [] },
  connectDatabase: async () => undefined,
  disconnectDatabase: async () => undefined,
}));

const { createApp } = await import('../src/app');

const app = createApp();
const API = '/api/v1';

const ADMIN_PASSWORD = 'Admin@123';
const STAFF_PASSWORD = 'Staff@123';

const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';

/** Shop-wide: what the business is owed in total, and who is slowest to pay. */
const ADMIN_ONLY_GETS = ['/ledger/outstanding', '/ledger/ageing'] as const;

const ALL_PERMISSIONS = {
  'stock.in': true,
  'stock.adjust': true,
  'product.create': true,
  'product.update': true,
  'customer.create': true,
  'customer.update': true,
  'bill.cancel': true,
  'payment.record': true,
  'ledger.view': true,
};

beforeEach(() => {
  resetDb();
  seedUser({
    id: '11111111-1111-4111-8111-111111111111',
    username: 'admin',
    name: 'Shop Owner',
    passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
    role: 'ADMIN',
    maxDiscountPercent: 100,
  });
  seedUser({
    id: '22222222-2222-4222-8222-222222222222',
    username: 'kirti',
    name: 'Kirti Patel',
    passwordHash: bcrypt.hashSync(STAFF_PASSWORD, 10),
    role: 'STAFF',
    maxDiscountPercent: 5,
    permissions: ALL_PERMISSIONS,
  });
  // A staff account with the khata toggles switched off — the owner's way of
  // saying "this one does not handle money".
  seedUser({
    id: '44444444-4444-4444-8444-444444444444',
    username: 'nilesh',
    name: 'Nilesh Shah',
    passwordHash: bcrypt.hashSync(STAFF_PASSWORD, 10),
    role: 'STAFF',
    permissions: { ...ALL_PERMISSIONS, 'payment.record': false, 'ledger.view': false },
  });

  seedCustomer({ id: CUSTOMER_ID, name: 'Vasant Silk House', outstanding: 12500, creditLimit: 50000 });
});

async function tokenFor(username: string, password: string): Promise<string> {
  const res = await request(app).post(`${API}/auth/login`).send({ username, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

const get = (path: string, token: string) =>
  request(app).get(`${API}${path}`).set('Authorization', `Bearer ${token}`);

const post = (path: string, token: string, body: unknown = {}) =>
  request(app).post(`${API}${path}`).set('Authorization', `Bearer ${token}`).send(body);

describe('khata — the shop-wide debtor book is owner-only', () => {
  it.each(ADMIN_ONLY_GETS)('refuses a STAFF token on %s with 403', async (path) => {
    const res = await get(path, await tokenFor('kirti', STAFF_PASSWORD));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // Not an empty list and not a zeroed total — no payload at all.
    expect(res.body.data).toBeUndefined();
  });

  it('refuses STAFF even with every granular permission switched on', async () => {
    // `ledger.view` is true for this account and still does not open the
    // shop-wide list: the boundary is the role, and no toggle crosses it.
    const res = await get('/ledger/outstanding', await tokenFor('kirti', STAFF_PASSWORD));
    expect(res.status).toBe(403);
  });

  it('refuses STAFF on POST /ledger/note — writing off a balance is the owner’s call', async () => {
    const res = await post('/ledger/note', await tokenFor('kirti', STAFF_PASSWORD), {
      customerId: CUSTOMER_ID,
      type: 'CREDIT',
      amount: 500,
      reason: 'Damaged cloth returned',
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // The note must not exist, and the balance must not have moved.
    expect(db.ledgerEntries).toHaveLength(0);
    expect(db.customers[0]?.['outstanding']).toBe(12500);
  });

  it.each(ADMIN_ONLY_GETS)('admits ADMIN to %s', async (path) => {
    const res = await get(path, await tokenFor('admin', ADMIN_PASSWORD));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('answers 401, not 403, when no token is presented', async () => {
    const res = await request(app).get(`${API}/ledger/outstanding`);
    expect(res.status).toBe(401);
  });
});

describe('khata — one customer’s book is the counter’s to read', () => {
  it('admits STAFF to a specific customer’s statement', async () => {
    const res = await get(`/ledger/customer/${CUSTOMER_ID}`, await tokenFor('kirti', STAFF_PASSWORD));

    expect(res.status).toBe(200);
    expect(res.body.data.customer.name).toBe('Vasant Silk House');
    expect(res.body.data.customer.outstanding).toBe(12500);
  });

  it('never leaks a shop-wide figure into the statement payload', async () => {
    const res = await get(`/ledger/customer/${CUSTOMER_ID}`, await tokenFor('kirti', STAFF_PASSWORD));
    const body = JSON.stringify(res.body);

    for (const key of ['totalOutstanding', 'customerCount', 'overLimitCount', 'buckets', 'unbucketed']) {
      expect(body).not.toContain(key);
    }
  });

  it('lets STAFF past the guard on POST /ledger/payment', async () => {
    // An empty body: 400 means the request reached validation, which it can
    // only do after clearing RBAC. That is the whole assertion here.
    const res = await post('/ledger/payment', await tokenFor('kirti', STAFF_PASSWORD));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a staff account whose payment.record toggle is off', async () => {
    const res = await post('/ledger/payment', await tokenFor('nilesh', STAFF_PASSWORD), {
      customerId: CUSTOMER_ID,
      amount: 500,
      paymentMode: 'CASH',
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a staff account whose ledger.view toggle is off, on the statement', async () => {
    const res = await get(`/ledger/customer/${CUSTOMER_ID}`, await tokenFor('nilesh', STAFF_PASSWORD));
    expect(res.status).toBe(403);
  });

  it('rejects CHEQUE and CARD as receipt modes — a khata payment is settled money', async () => {
    const staff = await tokenFor('kirti', STAFF_PASSWORD);
    for (const paymentMode of ['CHEQUE', 'CARD', 'CREDIT']) {
      const res = await post('/ledger/payment', staff, { customerId: CUSTOMER_ID, amount: 500, paymentMode });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('refuses a negative or zero payment, so no endpoint can invert a direction', async () => {
    const staff = await tokenFor('kirti', STAFF_PASSWORD);
    for (const amount of [-500, 0]) {
      const res = await post('/ledger/payment', staff, { customerId: CUSTOMER_ID, amount, paymentMode: 'CASH' });
      expect(res.status).toBe(400);
    }
  });
});

describe('khata — the payment reminder', () => {
  it('is refused for a staff account without ledger.view', async () => {
    const res = await post(`/ledger/reminder/${CUSTOMER_ID}`, await tokenFor('nilesh', STAFF_PASSWORD));
    expect(res.status).toBe(403);
  });

  it('builds a wa.me link carrying the balance, for a permitted staff account', async () => {
    const res = await post(`/ledger/reminder/${CUSTOMER_ID}`, await tokenFor('kirti', STAFF_PASSWORD));

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919820000099\?text=/);
    expect(res.body.data.message).toContain('12500.00');
    expect(res.body.data.outstanding).toBe(12500);
  });

  it('refuses to nag a customer who owes nothing', async () => {
    seedCustomer({ id: '55555555-5555-4555-8555-555555555555', name: 'Settled Up', outstanding: 0 });

    const res = await post('/ledger/reminder/55555555-5555-4555-8555-555555555555', await tokenFor('admin', ADMIN_PASSWORD));
    expect(res.status).toBe(400);
  });
});
