import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { fakePrisma, resetDb, seedUser } from './helpers/fakePrisma';

/**
 * ── The golden rule, pinned down ─────────────────────────────────────────
 *
 * These tests exist because the reporting boundary is the one place in this
 * app where a mistake is silent: a report that quietly returns a *filtered*
 * result to a staff account looks fine in the UI and leaks the shop's margins
 * for months before anyone notices. So every admin report is asserted to be a
 * hard 403 for a STAFF token, and the staff dashboard payload is asserted to
 * contain none of the shop-wide fields at all — not zeroed, absent.
 *
 * The fake client's `$queryRaw` returns no rows, which is exactly what is
 * wanted here: this suite is about who may call what, not about arithmetic.
 * The numbers are the service layer's job.
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

/** Every report that is owner-only. `/reports/low-stock` is deliberately absent. */
const ADMIN_ONLY_REPORTS = [
  '/reports/sales',
  '/reports/gst-summary',
  '/reports/stock-valuation',
  '/reports/outstanding',
  '/reports/ageing',
  '/reports/product-sales',
  '/reports/category-sales',
  '/reports/payment-collection',
  '/reports/profit-margin',
] as const;

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
    // Every toggle an owner could possibly grant. None of them may open a report.
    permissions: {
      'stock.in': true,
      'stock.adjust': true,
      'product.create': true,
      'product.update': true,
      'customer.create': true,
      'customer.update': true,
      'bill.cancel': true,
      'payment.record': true,
      'ledger.view': true,
    },
  });
});

async function tokenFor(username: string, password: string): Promise<string> {
  const res = await request(app).post(`${API}/auth/login`).send({ username, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

const get = (path: string, token: string) =>
  request(app).get(`${API}${path}`).set('Authorization', `Bearer ${token}`);

describe('reports — STAFF is blocked, not filtered', () => {
  it.each(ADMIN_ONLY_REPORTS)('refuses a STAFF token on %s with 403', async (path) => {
    const res = await get(path, await tokenFor('kirti', STAFF_PASSWORD));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // A 403 must carry no payload — not an empty list, not a zeroed summary.
    expect(res.body.data).toBeUndefined();
  });

  it('refuses STAFF even with every granular permission switched on', async () => {
    // Seeded above with all nine toggles true — the boundary is the role, and
    // no permission an owner can grant may cross it.
    const res = await get('/reports/profit-margin', await tokenFor('kirti', STAFF_PASSWORD));
    expect(res.status).toBe(403);
  });

  it('refuses STAFF on the export formats too, not just JSON', async () => {
    const staff = await tokenFor('kirti', STAFF_PASSWORD);
    for (const format of ['pdf', 'excel']) {
      const res = await get(`/reports/stock-valuation?format=${format}`, staff);
      expect(res.status).toBe(403);
      expect(res.headers['content-type']).toContain('application/json');
    }
  });

  it('answers 401, not 403, when no token is presented', async () => {
    const res = await request(app).get(`${API}/reports/sales`);
    expect(res.status).toBe(401);
  });

  it.each(ADMIN_ONLY_REPORTS)('admits ADMIN to %s', async (path) => {
    const res = await get(path, await tokenFor('admin', ADMIN_PASSWORD));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});

describe('reports — low stock is the one report staff may read', () => {
  it('admits both roles', async () => {
    for (const [username, password] of [
      ['admin', ADMIN_PASSWORD],
      ['kirti', STAFF_PASSWORD],
    ] as const) {
      const res = await get('/reports/low-stock', await tokenFor(username, password));
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    }
  });

  it('never carries cost data for either role', async () => {
    const res = await get('/reports/low-stock', await tokenFor('admin', ADMIN_PASSWORD));
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('costPrice');
    expect(body).not.toContain('costValue');
  });
});

describe('dashboard — the staff payload omits shop-wide figures entirely', () => {
  /** Anything that would tell a staff member what the shop earns. */
  const FORBIDDEN_KEYS = [
    'todaySales',
    'monthSales',
    'totalOutstanding',
    'gstPayable',
    'salesTrend',
    'topProducts',
    'topCustomers',
    'stockValueAtCost',
    'costPrice',
    'profit',
    'margin',
    'revenue',
  ];

  it('gives STAFF only their own bill count and the low-stock alert', async () => {
    const res = await get('/dashboard', await tokenFor('kirti', STAFF_PASSWORD));

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('STAFF');
    expect(Object.keys(res.body.data).sort()).toEqual(['asOf', 'lowStockCount', 'myBillsToday', 'role']);
    expect(res.body.data.myBillsToday).toEqual({ count: 0, total: 0 });

    const body = JSON.stringify(res.body);
    for (const key of FORBIDDEN_KEYS) {
      expect(body).not.toContain(key);
    }
  });

  it('gives ADMIN the full picture on the same URL', async () => {
    const res = await get('/dashboard', await tokenFor('admin', ADMIN_PASSWORD));

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('ADMIN');
    expect(res.body.data).toHaveProperty('today');
    expect(res.body.data).toHaveProperty('month.gstPayable');
    expect(res.body.data).toHaveProperty('totalOutstanding');
    expect(res.body.data).toHaveProperty('topProducts');
    expect(res.body.data).toHaveProperty('salesTrend');
  });

  it('zero-fills the trend so a closed day is a gap, not a missing point', async () => {
    const res = await get('/dashboard?range=7D', await tokenFor('admin', ADMIN_PASSWORD));
    expect(res.body.data.salesTrend).toHaveLength(7);
    expect(res.body.data.salesTrend.every((point: { total: number }) => point.total === 0)).toBe(true);

    const thirty = await get('/dashboard?range=30D', await tokenFor('admin', ADMIN_PASSWORD));
    expect(thirty.body.data.salesTrend).toHaveLength(30);
  });
});

describe('reports — exports', () => {
  it('streams a branded PDF for ADMIN', async () => {
    const res = await get('/reports/sales?format=pdf', await tokenFor('admin', ADMIN_PASSWORD)).buffer();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('sattadhar-sales');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('streams an xlsx for ADMIN', async () => {
    // superagent has no parser for the xlsx mime type, so ask for the raw
    // bytes rather than letting it hand back a parsed object.
    const res = await get('/reports/gst-summary?format=excel', await tokenFor('admin', ADMIN_PASSWORD))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('sattadhar-gst-summary');
    // Every .xlsx is a zip — "PK" is the local file header.
    expect(res.body.subarray(0, 2).toString()).toBe('PK');
  });

  it('records the export in the audit trail', async () => {
    const { db } = await import('./helpers/fakePrisma');
    await get('/reports/profit-margin?format=pdf', await tokenFor('admin', ADMIN_PASSWORD)).buffer();

    expect(db.auditLogs.at(-1)).toMatchObject({
      action: 'EXPORT',
      entity: 'Report',
      entityId: 'profit-margin',
    });
  });
});
