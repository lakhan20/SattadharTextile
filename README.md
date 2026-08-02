# Sattadhar Textile

Fabric **wholesale + retail** trading app for a single GST-registered shop in Gujarat, India. Up to 20 staff. Trading only — not a manufacturer, no readymade garments.

| | |
|---|---|
| **Backend** | Node.js 20 · Express · TypeScript · PostgreSQL 16 (Prisma) · JWT access+refresh with `jti` revocation |
| **Mobile** | React Native · Expo · TypeScript · React Native Paper · Zustand · i18next (EN + ગુજરાતી) |
| **PDF / Excel** | pdfkit · exceljs (both pure JS — ARM64-safe, no puppeteer) |
| **Deploy** | Oracle Cloud Always Free · Ubuntu 22.04 · ARM64 (aarch64) · Mumbai · PM2 + Nginx + Cloudflare Tunnel |
| **Distribution** | Android-first — signed standalone APK via EAS (sideload, no Play Store) |

## Layout

```
/backend    Express API + Prisma schema + PDF/Excel generation
/mobile     Expo app
/docs       API reference, data model, deployment
/deploy     PM2, Nginx, Cloudflare Tunnel, backup script
```

## Roles

| | ADMIN | STAFF |
|---|---|---|
| Billing (GST + Estimate) | ✅ | ✅ |
| Customers, stock view, product view | ✅ | ✅ |
| Cost price & margin | ✅ | ❌ never |
| Day/month revenue, profit, shop totals | ✅ | ❌ |
| Other staff's bills | ✅ | ❌ own bills only |
| Reports, masters, discount config, staff accounts | ✅ | ❌ |

Enforced by middleware on **every** endpoint — never by hiding UI alone.

## Run locally

**Prerequisites:** Node **20.19.4+** (Expo SDK 57 refuses to run on older 20.x — `node --version` to check), PostgreSQL 16, npm 10+. For mobile: the Expo Go app on an Android phone.

### 1 — Database

Create the role and database once, as a Postgres superuser:

```sql
CREATE ROLE sattadhar WITH LOGIN PASSWORD 'your-password';
CREATE DATABASE sattadhar OWNER sattadhar;
```

<details>
<summary>Windows, if <code>psql</code> is not on PATH</summary>

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE sattadhar WITH LOGIN PASSWORD 'your-password';"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE sattadhar OWNER sattadhar;"
```
</details>

### 2 — Backend

```bash
cd backend
cp .env.example .env
```

Then edit `.env` — three values matter before the first run:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | must match the role/password/database you just created |
| `JWT_ACCESS_SECRET` | 32+ chars. `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | 32+ chars, **different** from the access secret |

The app validates every environment variable at boot and exits with a readable list if anything is missing.

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init   # creates the tables (first run only)
npm run seed                            # 1 ADMIN + 3 sample STAFF — idempotent
npm run dev                             # → http://localhost:4000/api/v1 · /health
```

Seed credentials come from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD` in `.env` and are printed once when created. Re-running the seed never touches an existing account. **Change the passwords before the shop goes live.**

### 3 — Mobile (new terminal)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on an Android phone that is on the same Wi-Fi as the laptop.

> **New to React Native?** [docs/RUN-ON-PHONE.md](docs/RUN-ON-PHONE.md) walks through it step by step, including the two things that trip everyone up.

**The API address configures itself.** In development the app reads the Expo dev server's LAN address and points at `http://<that-host>:4000`, so a phone connects with no typing. To override it — a different port, a tunnel, a real server — open **More → Server settings**, type the address and press **Test connection** before saving. That value is stored on the device and always wins.

Windows blocks both ports by default. Allow them once, from an **Administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Sattadhar Expo" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow -Profile Any -RemoteAddress LocalSubnet
New-NetFirewallRule -DisplayName "Sattadhar API"  -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -Profile Any -RemoteAddress LocalSubnet
```

Port 8081 delivers the app, port 4000 delivers the data — you need both.

## Test

```bash
cd backend
npm test              # 42 tests — auth flow, lockout, jti revocation, RBAC
npm run typecheck
bash scripts/smoke-auth.sh    # end-to-end curl run against a live dev server

cd ../mobile
npm run typecheck
npx expo export --platform android --output-dir /tmp/check   # proves it bundles
```

`npm test` needs no database. `smoke-auth.sh` needs the server running and seeded. There is also [backend/requests.http](backend/requests.http) for the VS Code REST Client.

## Docs

- [docs/RUN-ON-PHONE.md](docs/RUN-ON-PHONE.md) — getting the app onto an Android phone, step by step
- [docs/SCHEMA.md](docs/SCHEMA.md) — data model and why it is shaped this way
- [docs/API.md](docs/API.md) — endpoint reference, error codes, RBAC rules
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Oracle Cloud ARM64, PM2, Nginx, Cloudflare Tunnel, backups *(final step)*

## Build status

- [x] Monorepo scaffold + Prisma schema
- [x] Auth + RBAC (backend)
- [x] Mobile shell — design system, i18n (EN/ગુ), login, role-aware dashboard, server settings
- [x] Masters (category, sub-category, product) — customer is read-only lookup so far
- [x] Billing (GST / Estimate) + PDF — backend, plus the mobile billing screen, bills list and bill detail
- [ ] Discount engine (rules table); customer create/edit + khata
- [ ] Stock + khata ledger
- [ ] Reports + dashboard
- [ ] Localisation (EN/GU)
- [ ] Staff management
- [ ] Seed + deployment docs
