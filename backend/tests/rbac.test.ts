import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import type { AuthUser } from '../src/types/auth';
import { normalisePermissions } from '../src/config/permissions';
import { errorHandler } from '../src/middleware/errorHandler';
import {
  authenticated,
  canAccessOwnedBy,
  publicRoute,
  rbacSentinel,
  requirePermission,
  requireRole,
} from '../src/middleware/rbac';
import { ipKey } from '../src/middleware/rateLimit';

const asUser = (role: Role, permissions: Record<string, boolean> = {}): AuthUser => ({
  id: role === Role.ADMIN ? 'admin-id' : 'staff-id',
  username: role.toLowerCase(),
  name: 'Test',
  role,
  language: 'EN',
  permissions: normalisePermissions(permissions),
  maxDiscountPercent: 0,
  jti: 'test-jti',
});

/** Builds a throwaway API whose routes mirror the real mounting order. */
function buildApp(user?: AuthUser) {
  const app = express();
  app.use(express.json());
  const api = express.Router();
  api.use(rbacSentinel);
  api.use((req, _res, next) => {
    if (user) req.user = user;
    next();
  });

  api.get('/open', publicRoute(), (_req, res) => {
    res.json({ data: 'open' });
  });
  api.get('/any-signed-in', authenticated(), (_req, res) => {
    res.json({ data: 'ok' });
  });
  api.get('/admin-only', requireRole(Role.ADMIN), (_req, res) => {
    res.json({ data: 'secret revenue' });
  });
  api.get('/needs-stock-in', requirePermission('stock.in'), (_req, res) => {
    res.json({ data: 'stock in' });
  });

  // Deliberately guardless — this is the mistake the sentinel exists to catch.
  api.get('/forgotten', (_req, res) => {
    res.json({ data: 'this must never reach the client' });
  });

  // Guardless AND uses res.send rather than res.json.
  api.get('/forgotten-send', (_req, res) => {
    res.send('leak');
  });

  app.use('/api/v1', api);
  app.use(errorHandler);
  return app;
}

describe('default-deny sentinel', () => {
  it('blocks a route that declared no access policy, even for an ADMIN', async () => {
    const res = await request(buildApp(asUser(Role.ADMIN))).get('/api/v1/forgotten');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have access to this.' },
    });
    expect(JSON.stringify(res.body)).not.toContain('must never reach');
  });

  it('blocks an unguarded res.send too, without double-responding', async () => {
    const res = await request(buildApp(asUser(Role.ADMIN))).get('/api/v1/forgotten-send');
    expect(res.status).toBe(403);
    expect(res.text).not.toContain('leak');
  });

  it('lets a properly guarded route through', async () => {
    const res = await request(buildApp(asUser(Role.ADMIN))).get('/api/v1/admin-only');
    expect(res.status).toBe(200);
    expect(res.body.data).toBe('secret revenue');
  });
});

describe('requireRole', () => {
  it('keeps STAFF out of ADMIN-only data', async () => {
    const res = await request(buildApp(asUser(Role.STAFF))).get('/api/v1/admin-only');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('revenue');
  });

  it('answers 401, not 403, when nobody is signed in', async () => {
    const res = await request(buildApp()).get('/api/v1/admin-only');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('admits both roles to a shared route', async () => {
    expect((await request(buildApp(asUser(Role.STAFF))).get('/api/v1/any-signed-in')).status).toBe(200);
    expect((await request(buildApp(asUser(Role.ADMIN))).get('/api/v1/any-signed-in')).status).toBe(200);
  });

  it('leaves public routes open', async () => {
    expect((await request(buildApp()).get('/api/v1/open')).status).toBe(200);
  });
});

describe('requirePermission', () => {
  it('refuses STAFF without the toggle', async () => {
    const res = await request(buildApp(asUser(Role.STAFF))).get('/api/v1/needs-stock-in');
    expect(res.status).toBe(403);
  });

  it('admits STAFF once the toggle is on', async () => {
    const res = await request(buildApp(asUser(Role.STAFF, { 'stock.in': true }))).get(
      '/api/v1/needs-stock-in',
    );
    expect(res.status).toBe(200);
  });

  it('admits ADMIN implicitly, with no toggles set', async () => {
    const res = await request(buildApp(asUser(Role.ADMIN))).get('/api/v1/needs-stock-in');
    expect(res.status).toBe(200);
  });

  it('treats a junk permissions blob as all-denied', () => {
    expect(normalisePermissions('nonsense')['stock.in']).toBe(false);
    expect(normalisePermissions({ 'stock.in': 'yes' })['stock.in']).toBe(false);
    expect(normalisePermissions(null)['ledger.view']).toBe(false);
    expect(normalisePermissions({ 'ledger.view': true })['ledger.view']).toBe(true);
  });
});

describe('canAccessOwnedBy — "own bills only"', () => {
  const req = (user?: AuthUser) => ({ user }) as never;

  it('lets ADMIN reach anyone’s records', () => {
    expect(canAccessOwnedBy(req(asUser(Role.ADMIN)), 'someone-else')).toBe(true);
  });

  it('lets STAFF reach only their own', () => {
    const staff = asUser(Role.STAFF);
    expect(canAccessOwnedBy(req(staff), 'staff-id')).toBe(true);
    expect(canAccessOwnedBy(req(staff), 'another-staff-id')).toBe(false);
    expect(canAccessOwnedBy(req(staff), null)).toBe(false);
  });

  it('denies an anonymous caller', () => {
    expect(canAccessOwnedBy(req(), 'staff-id')).toBe(false);
  });
});

describe('rate-limit key', () => {
  it('keeps IPv4 whole and collapses IPv6 to its /64', () => {
    expect(ipKey('203.0.113.9')).toBe('203.0.113.9');
    expect(ipKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(ipKey('2001:db8:1234:5678:9abc:def0:1234:5678')).toBe('2001:db8:1234:5678::/64');
    expect(ipKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipKey(undefined)).toBe('unknown');
  });
});
