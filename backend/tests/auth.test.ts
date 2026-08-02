import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { db, fakePrisma, resetDb, seedUser } from './helpers/fakePrisma';

// Replace the Prisma client for every module that imports it.
vi.mock('../src/config/prisma', () => ({
  prisma: fakePrisma,
  connectDatabase: async () => undefined,
  disconnectDatabase: async () => undefined,
}));

const { createApp } = await import('../src/app');

const app = createApp();
const API = '/api/v1';

const ADMIN_PASSWORD = 'Admin@123';
const STAFF_PASSWORD = 'Staff@123';

function makeUsers(): void {
  const hashAdmin = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  const hashStaff = bcrypt.hashSync(STAFF_PASSWORD, 10);
  seedUser({
    id: '11111111-1111-4111-8111-111111111111',
    username: 'admin',
    name: 'Shop Owner',
    passwordHash: hashAdmin,
    role: 'ADMIN',
    maxDiscountPercent: 100,
  });
  seedUser({
    id: '22222222-2222-4222-8222-222222222222',
    username: 'kirti',
    name: 'Kirti Patel',
    passwordHash: hashStaff,
    role: 'STAFF',
    maxDiscountPercent: 5,
    permissions: { 'customer.create': true, 'ledger.view': true },
  });
}

const login = (username: string, password: string) =>
  request(app).post(`${API}/auth/login`).send({ username, password });

async function tokensFor(username: string, password: string) {
  const res = await login(username, password);
  expect(res.status).toBe(200);
  return res.body.data as { accessToken: string; refreshToken: string };
}

beforeEach(() => {
  resetDb();
  makeUsers();
});

describe('POST /auth/login', () => {
  it('signs in with the right password and never returns the hash', async () => {
    const res = await login('admin', ADMIN_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.refreshToken).toBeTypeOf('string');
    expect(res.body.data.user).toMatchObject({ username: 'admin', role: 'ADMIN', preferredLang: 'EN' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$2');

    expect(db.refreshTokens).toHaveLength(1);
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'LOGIN', entity: 'User' });
  });

  it('accepts a username in any case', async () => {
    const res = await login('ADMIN', ADMIN_PASSWORD);
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password with the standard error shape', async () => {
    const res = await login('admin', 'not-the-password');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect.' },
    });
    expect(db.refreshTokens).toHaveLength(0);
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'LOGIN_FAILED' });
  });

  it('gives an unknown username exactly the same answer as a wrong password', async () => {
    const unknown = await login('nobody', 'whatever1');
    const wrong = await login('admin', 'whatever1');
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rejects a malformed body with field-level detail', async () => {
    const res = await request(app).post(`${API}/auth/login`).send({ username: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['username', 'password']),
    );
  });

  it('locks the account on the 5th consecutive failure and holds it locked', async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await login('kirti', 'wrong-one');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(db.users[1]!['failedLoginAttempts']).toBe(attempt);
    }

    const fifth = await login('kirti', 'wrong-one');
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(db.users[1]!['lockedUntil']).toBeInstanceOf(Date);

    // The correct password is refused while the lock stands.
    const correct = await login('kirti', STAFF_PASSWORD);
    expect(correct.status).toBe(423);
    expect(correct.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(db.refreshTokens).toHaveLength(0);
  });

  it('lets the account back in once the lock expires, with the counter reset', async () => {
    for (let i = 0; i < 5; i += 1) await login('kirti', 'wrong-one');
    // Wind the clock past the lock.
    db.users[1]!['lockedUntil'] = new Date(Date.now() - 1000);

    const res = await login('kirti', STAFF_PASSWORD);
    expect(res.status).toBe(200);
    expect(db.users[1]!['failedLoginAttempts']).toBe(0);
    expect(db.users[1]!['lockedUntil']).toBeNull();
  });

  it('resets the failure counter after a successful sign-in', async () => {
    await login('kirti', 'wrong-one');
    await login('kirti', 'wrong-one');
    expect(db.users[1]!['failedLoginAttempts']).toBe(2);

    await login('kirti', STAFF_PASSWORD);
    expect(db.users[1]!['failedLoginAttempts']).toBe(0);
  });

  it('refuses a deactivated account before checking the password', async () => {
    db.users[1]!['isActive'] = false;
    const res = await login('kirti', STAFF_PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('GET /auth/me', () => {
  it('returns the caller without the hash', async () => {
    const { accessToken } = await tokensFor('kirti', STAFF_PASSWORD);
    const res = await request(app).get(`${API}/auth/me`).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      username: 'kirti',
      role: 'STAFF',
      preferredLang: 'EN',
      maxDiscountPercent: 5,
    });
    expect(res.body.data.permissions).toMatchObject({ 'customer.create': true, 'stock.in': false });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects a missing token', async () => {
    const res = await request(app).get(`${API}/auth/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a garbage token', async () => {
    const res = await request(app).get(`${API}/auth/me`).set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects a refresh token used as an access token', async () => {
    const { refreshToken } = await tokensFor('kirti', STAFF_PASSWORD);
    const res = await request(app).get(`${API}/auth/me`).set('Authorization', `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects a still-valid access token the moment the account is deactivated', async () => {
    const { accessToken } = await tokensFor('kirti', STAFF_PASSWORD);
    db.users[1]!['isActive'] = false;

    const res = await request(app).get(`${API}/auth/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /auth/refresh', () => {
  it('issues a new access token that works', async () => {
    const { refreshToken } = await tokensFor('kirti', STAFF_PASSWORD);
    const res = await request(app).post(`${API}/auth/refresh`).send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.accessExpiresIn).toBe(900);

    const me = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('refuses a revoked jti', async () => {
    const { accessToken, refreshToken } = await tokensFor('kirti', STAFF_PASSWORD);
    await request(app).post(`${API}/auth/logout`).set('Authorization', `Bearer ${accessToken}`).send({});

    const res = await request(app).post(`${API}/auth/refresh`).send({ refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('refuses an access token presented as a refresh token', async () => {
    const { accessToken } = await tokensFor('kirti', STAFF_PASSWORD);
    const res = await request(app).post(`${API}/auth/refresh`).send({ refreshToken: accessToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('POST /auth/logout', () => {
  it('revokes the jti so the access token stops working immediately', async () => {
    const { accessToken } = await tokensFor('kirti', STAFF_PASSWORD);

    const out = await request(app)
      .post(`${API}/auth/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(out.status).toBe(200);
    expect(out.body.data).toMatchObject({ signedOut: true, revokedSessions: 1 });
    expect(db.refreshTokens[0]!['revokedAt']).toBeInstanceOf(Date);

    const after = await request(app).get(`${API}/auth/me`).set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('signs out every device when asked', async () => {
    await tokensFor('kirti', STAFF_PASSWORD);
    const second = await tokensFor('kirti', STAFF_PASSWORD);
    expect(db.refreshTokens).toHaveLength(2);

    const out = await request(app)
      .post(`${API}/auth/logout`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({ allDevices: true });

    expect(out.body.data.revokedSessions).toBe(2);
    expect(db.refreshTokens.every((t) => t['revokedAt'] instanceof Date)).toBe(true);
  });

  it('needs a token of its own', async () => {
    const res = await request(app).post(`${API}/auth/logout`).send({});
    expect(res.status).toBe(401);
  });
});

describe('RBAC — POST /auth/admin/reset-password', () => {
  it('refuses a STAFF token with 403, before any validation runs', async () => {
    const { accessToken } = await tokensFor('kirti', STAFF_PASSWORD);

    const res = await request(app)
      .post(`${API}/auth/admin/reset-password`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: '22222222-2222-4222-8222-222222222222', newPassword: 'Brand@New1' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'This is limited to the shop owner.' },
    });
    // The password must be untouched.
    const stillWorks = await login('kirti', STAFF_PASSWORD);
    expect(stillWorks.status).toBe(200);
  });

  it('refuses an anonymous caller with 401, not 403', async () => {
    const res = await request(app)
      .post(`${API}/auth/admin/reset-password`)
      .send({ userId: '22222222-2222-4222-8222-222222222222', newPassword: 'Brand@New1' });
    expect(res.status).toBe(401);
  });

  it('lets ADMIN reset a password, kills that user’s sessions, and clears the lock', async () => {
    const staff = await tokensFor('kirti', STAFF_PASSWORD);
    const admin = await tokensFor('admin', ADMIN_PASSWORD);
    db.users[1]!['lockedUntil'] = new Date(Date.now() + 600_000);
    db.users[1]!['failedLoginAttempts'] = 5;

    const res = await request(app)
      .post(`${API}/auth/admin/reset-password`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: '22222222-2222-4222-8222-222222222222', newPassword: 'Brand@New1' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ passwordReset: true, username: 'kirti', revokedSessions: 1 });
    expect(db.users[1]!['lockedUntil']).toBeNull();
    expect(db.users[1]!['failedLoginAttempts']).toBe(0);

    // Old session is dead.
    const old = await request(app).get(`${API}/auth/me`).set('Authorization', `Bearer ${staff.accessToken}`);
    expect(old.status).toBe(401);

    // Old password is dead, new one works.
    expect((await login('kirti', STAFF_PASSWORD)).status).toBe(401);
    expect((await login('kirti', 'Brand@New1')).status).toBe(200);

    // The admin's own session survives.
    const adminMe = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminMe.status).toBe(200);
  });

  it('records the reset in the audit log without leaking the password', async () => {
    const admin = await tokensFor('admin', ADMIN_PASSWORD);
    await request(app)
      .post(`${API}/auth/admin/reset-password`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: '22222222-2222-4222-8222-222222222222', newPassword: 'Brand@New1' });

    const entry = db.auditLogs.find((a) => a['action'] === 'PASSWORD_RESET');
    expect(entry).toMatchObject({
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    expect(JSON.stringify(entry)).not.toContain('Brand@New1');
  });

  it('rejects a weak new password', async () => {
    const admin = await tokensFor('admin', ADMIN_PASSWORD);
    const res = await request(app)
      .post(`${API}/auth/admin/reset-password`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: '22222222-2222-4222-8222-222222222222', newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Health + unknown routes', () => {
  it('reports health without a token', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('returns the standard shape for an unknown route', async () => {
    // Deliberately a path no module will ever mount — this once used
    // `/products`, which started returning 401 the moment that module landed.
    const res = await request(app).get(`${API}/no-such-module`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
