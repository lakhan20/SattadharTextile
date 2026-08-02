import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Rate limiters read env.isTest and step aside, so the 5-attempt lockout
    // test is not intercepted by the per-IP limiter first.
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      API_PREFIX: '/api/v1',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-9876543210',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      // Keep bcrypt cheap so the suite stays fast.
      BCRYPT_ROUNDS: '10',
      LOGIN_MAX_ATTEMPTS: '5',
      LOGIN_LOCK_MINUTES: '15',
    },
  },
});
