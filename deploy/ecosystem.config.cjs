/**
 * PM2 process definition for the Sattadhar Textile API.
 *
 *   pm2 startOrReload deploy/ecosystem.config.cjs --update-env
 *
 * Single fork-mode instance on purpose, not cluster:
 *   - express-rate-limit uses an in-memory store, so N workers would each
 *     allow the full RATE_LIMIT_MAX and the login lockout would be N× looser.
 *   - One shop, ≤20 staff. A single Node process is nowhere near saturated,
 *     and Postgres connection count stays predictable for Prisma's pool.
 *
 * No `env` block here: src/config/env.ts calls `dotenv/config`, which reads
 * backend/.env relative to process.cwd() — so `cwd` below is what wires the
 * environment in. Keeping secrets in one file (and out of git) beats copying
 * them into a committed config.
 */
module.exports = {
  apps: [
    {
      name: 'sattadhar-api',
      cwd: '/opt/sattadhar/app/backend',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 2000,
      // The API is small, but a leak shouldn't be able to OOM a 1 GB micro.
      max_memory_restart: '512M',

      // Pino writes structured JSON to stdout; PM2 captures it to these files.
      // logrotate keeps them from filling the boot volume.
      out_file: '/opt/sattadhar/logs/api-out.log',
      error_file: '/opt/sattadhar/logs/api-err.log',
      merge_logs: true,
      time: false, // pino already stamps every line

      kill_timeout: 12000, // server.ts allows itself 10s to drain before exit(1)
      listen_timeout: 10000,
      wait_ready: false,
    },
  ],
};
