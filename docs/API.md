# Sattadhar Textile — API Reference

Base URL: `{PUBLIC_BASE_URL}{API_PREFIX}` → `http://localhost:4000/api/v1` in development.

## Conventions

**Success** — always wrapped in `data`:

```json
{ "data": { … } }
```

**Failure** — always this shape, nothing else:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some of the details are not right. Check the highlighted fields.", "details": [ { "field": "username", "message": "Username must be at least 3 characters." } ] } }
```

`details` appears only on `VALIDATION_ERROR`. Clients branch on `code`, never on `message` — messages are user-facing prose and get reworded/translated. In production a 5xx never carries a stack trace or an internal message.

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/query failed zod validation |
| `INVALID_CREDENTIALS` | 401 | Wrong username **or** wrong password (deliberately indistinguishable) |
| `UNAUTHENTICATED` | 401 | No token, or a malformed `Authorization` header |
| `TOKEN_INVALID` | 401 | Signature bad, or wrong token type for the endpoint |
| `TOKEN_EXPIRED` | 401 | Token past its expiry — call `/auth/refresh` |
| `TOKEN_REVOKED` | 401 | Session was signed out, password reset, or the account was deactivated |
| `ACCOUNT_INACTIVE` | 403 | Account deactivated or soft-deleted |
| `FORBIDDEN` | 403 | Authenticated but not allowed (role or permission) |
| `ACCOUNT_LOCKED` | 423 | 5 consecutive failed sign-ins |
| `NOT_FOUND` | 404 | No such route or record |
| `CONFLICT` | 409 | Unique constraint or FK conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `PAYLOAD_TOO_LARGE` | 413 | Upload over the limit |
| `INTERNAL_ERROR` | 500/503 | Server or database fault |

### Authentication

Send the access token on every protected call:

```
Authorization: Bearer <accessToken>
```

- **Access token** — 15 minutes. Carries `sub` (userId), `role`, `jti`.
- **Refresh token** — 7 days. Stored server-side in `refresh_tokens`, keyed by `jti`.
- Both tokens of one sign-in share a **`jti` (session id)**. Revoking that `jti` kills the refresh token *and* every access token issued from it — verified on every single request, so a deactivated staff member is locked out on their next tap, not 15 minutes later.
- `/auth/refresh` deliberately keeps the same `jti`, so access tokens already in flight keep working. A session ends only via logout, password reset, or deactivation.

---

## Endpoints

### `GET /health` · public

Also mounted at the bare `/health` (outside the API prefix) for PM2 and Nginx.

```json
{ "data": { "status": "ok", "service": "sattadhar-textile-api", "database": "up", "uptimeSeconds": 42, "timestamp": "2026-08-01T06:00:00.000Z" } }
```

Returns **503** with `"status": "degraded"`, `"database": "down"` if Postgres is unreachable.

---

### `POST /auth/login` · public

Rate limited per **IP + username**; successful sign-ins are not counted, so a busy counter is never throttled.

**Request**

```json
{ "username": "admin", "password": "ChangeMe@123" }
```

`username` is trimmed and lower-cased, 3–50 chars, `[a-z0-9._-]`.

**200**

```json
{
  "data": {
    "accessToken": "eyJhbGciOi…",
    "refreshToken": "eyJhbGciOi…",
    "accessExpiresIn": 900,
    "refreshExpiresIn": 604800,
    "user": {
      "id": "uuid", "username": "admin", "name": "Shop Owner",
      "phone": null, "email": null,
      "role": "ADMIN", "preferredLang": "EN",
      "permissions": { "stock.in": true, "…": true },
      "maxDiscountPercent": 100, "isActive": true,
      "lastLoginAt": "2026-08-01T06:00:00.000Z"
    }
  }
}
```

**Failures** — `401 INVALID_CREDENTIALS` · `403 ACCOUNT_INACTIVE` · `423 ACCOUNT_LOCKED` · `400 VALIDATION_ERROR` · `429 RATE_LIMITED`

**Lockout.** 5 consecutive failures lock the account for `LOGIN_LOCK_MINUTES` (default 15). While locked, even the correct password is refused. The counter resets on a successful sign-in, and also once a lock expires. An unknown username costs the same wall-clock time as a wrong password, and returns a byte-identical response — the API will not tell an attacker which usernames exist.

---

### `POST /auth/refresh` · public

**Request** — `{ "refreshToken": "eyJ…" }`

**200**

```json
{ "data": { "accessToken": "eyJ…", "accessExpiresIn": 900, "user": { … } } }
```

The new access token is signed with the user's **current** role, so a role change takes effect on the next refresh. **Failures** — `401 TOKEN_REVOKED` · `401 TOKEN_EXPIRED` · `401 TOKEN_INVALID` (e.g. an access token sent here) · `403 ACCOUNT_INACTIVE`

---

### `POST /auth/logout` · any signed-in user

**Request** (body optional)

```json
{ "refreshToken": "eyJ…", "allDevices": false }
```

With no body, the session behind the access token is revoked. A supplied `refreshToken` must belong to the caller. `allDevices: true` revokes every live session for the caller.

**200** — `{ "data": { "signedOut": true, "revokedSessions": 1 } }`

---

### `GET /auth/me` · any signed-in user

**200** — the `user` object shown under login. The password hash cannot appear here: `toPublicUser()` is the only path from a `User` row to a response, and it never selects it.

---

### `POST /auth/admin/reset-password` · **ADMIN only**

**Request**

```json
{ "userId": "uuid-of-staff", "newPassword": "Brand@New1" }
```

`newPassword`: 8–72 characters, at least one letter and one number. (72 is bcrypt's hard limit — longer input would be silently truncated, so it is rejected instead.)

**200**

```json
{ "data": { "passwordReset": true, "userId": "uuid", "username": "kirti", "revokedSessions": 2 } }
```

Atomically: sets the new hash, stamps `passwordChangedAt`, clears `failedLoginAttempts` and any lock, revokes **every** live session for that user, and writes a `PASSWORD_RESET` audit row. The plaintext never reaches the audit log.

**Failures** — `403 FORBIDDEN` for a STAFF token · `401 UNAUTHENTICATED` with no token · `404 NOT_FOUND` for an unknown/deleted user

---

## Stock

`products.currentStock` is the balance and `stock_movements` is the ledger that explains it. They are written **together, in one transaction**, by every path that touches stock: `OPENING` on product create, `SALE` from inside the bill transaction, and `STOCK_IN` / `ADJUSTMENT` from the endpoints below. There is no second source of truth and no reconciliation job — a movement row without a matching balance change is impossible, because the balance change is what produces the `balanceAfter` the row records.

`qty` is **signed** (+ inward, − outward). Quantities are unit-aware: a `METER` product takes up to 3 decimals, a `PIECE` product whole numbers only — enforced in the service, against the product's own `unit`.

### `POST /stock/in` · permission `stock.in` (ADMIN implicitly)

```json
{ "productId": "uuid", "qty": 25.5, "reason": "New purchase", "supplierRef": "CH-1042", "rate": 155 }
```

`rate` is the landed/purchase rate and is **honoured for ADMIN only** — a STAFF caller holding the toggle records the quantity, and the ledger row stores rate `0`. Defaults to the product's `costPrice` when an ADMIN omits it.

**201** — `{ "data": { "movementId": "uuid", "productId": "uuid", "productName": "…", "unit": "METER", "qty": 25.5, "balanceAfter": 525.5, "type": "STOCK_IN" } }`

### `POST /stock/adjust` · permission `stock.adjust` (ADMIN implicitly)

```json
{ "productId": "uuid", "qty": -3.5, "reason": "Damage — water stain on the bolt end" }
```

`qty` is signed and may not be `0`. `reason` is **required** — an unexplained adjustment is indistinguishable from shrinkage. A reduction that would take the balance below zero is refused with `409 CONFLICT`; the guard lives in the UPDATE's `WHERE` clause, so a concurrent sale cannot slip underneath it.

**201** — same shape as `/stock/in`, with `"type": "ADJUSTMENT"`.

### `GET /stock/movements?productId=&from=&to=&page=&pageSize=` · any signed-in user

Newest first, paginated. Each row carries `type`, signed `qty`, `balanceAfter`, `reason`, `supplierRef`, `billId` + `billNumber` (for `SALE` rows), `createdByName` and `createdAt`.

`rate` is **absent from the JSON for a STAFF viewer** — on a `STOCK_IN` row it is cost data.

### `GET /stock/low?search=&page=&pageSize=` · any signed-in user

Active products where `currentStock <= reorderLevel`, worst shortfall first. Each row adds `shortBy` and `outOfStock`. Selects no cost columns at all.

### `GET /stock/valuation` · **ADMIN only**

```json
{ "data": { "asOf": "2026-08-01T…", "productCount": 6, "lowStockCount": 1, "costValue": 253400, "retailValue": 412750, "potentialMargin": 159350, "byUnit": [ { "unit": "METER", "productCount": 4, "totalQty": 962.5, "costValue": 148400, "retailValue": 241750 } ] } }
```

Built on `costPrice`, so it is guarded by `requireRole(ADMIN)` and deliberately **not** exposed through a permission toggle — no STAFF account can be granted it by any means. Metres and pieces are never summed into one quantity; only money is totalled across units.

---

## Dashboard

### `GET /dashboard?range=7D|30D` · any signed-in user

One URL, **two payloads**, chosen from the token's role *before any query runs* — the staff shape is assembled by a separate service function, so shop-wide figures are never read for a STAFF session, let alone filtered out of one. The response declares which shape it is via `role`.

**ADMIN**

```json
{ "data": { "role": "ADMIN", "asOf": "2026-08-01T…",
  "today": { "sales": 29429, "billCount": 7, "collected": 26909 },
  "month": { "sales": 29429, "billCount": 7, "gstPayable": 907.9, "label": "2026-08" },
  "financialYear": { "label": "FY27", "sales": 29429 },
  "totalOutstanding": 2520, "outstandingCustomerCount": 1,
  "lowStockCount": 1, "stockValueAtCost": 336437.5,
  "salesTrend": [ { "date": "2026-07-26", "total": 0, "billCount": 0 } ],
  "trendRange": "7D", "topProducts": [ … ], "topCustomers": [ … ] } }
```

**STAFF** — the entire payload, not an excerpt:

```json
{ "data": { "role": "STAFF", "asOf": "2026-08-01T…",
  "myBillsToday": { "count": 3, "total": 13861 }, "lowStockCount": 1 } }
```

`range` only affects the ADMIN trend and is ignored for STAFF. The trend is zero-filled across every day in the window, so a day the shop was shut is a flat stretch rather than a closed gap.

---

## Reports

**Every report is `requireRole(ADMIN)` except `/reports/low-stock`.** A STAFF token gets a flat `403` with no body — never a filtered subset, never an empty list. This is a *role* boundary, not a permission toggle: there is deliberately no switch an owner can flip that would hand a staff account the shop's margins.

All figures are `SUM`s of the columns `bills.tax.ts` already wrote inside the bill transaction (`grandTotal`, `taxableValue`, `cgstAmount`/`sgstAmount`/`igstAmount`, `costTotal`, `costPriceSnapshot`). Nothing is recalculated, so a report can never disagree with the invoice in the customer's hand. Only `status = 'FINAL'` bills count.

**Dates.** `from`/`to` are IST calendar dates (`YYYY-MM-DD`) and `to` is **inclusive** — "1st to 31st" covers the whole 31st. Omit both for the current month. Internally each range is a half-open `[from, to)` instant pair, so consecutive periods neither double-count a boundary bill nor drop one written at 23:59:59.5. ([reports.period.ts](../backend/src/modules/reports/reports.period.ts))

| Endpoint | Access | Notes |
|---|---|---|
| `GET /reports/sales?from=&to=&mode=ALL\|GST\|NON_GST&staffId=` | ADMIN | Totals, split by document type, per day, and per bill (capped at 500 with `truncated: true`; summaries still cover everything) |
| `GET /reports/gst-summary?from=&to=` | ADMIN | CGST/SGST/IGST and taxable value grouped by GST rate. Estimates excluded, and the excluded amount reported |
| `GET /reports/stock-valuation` | **ADMIN** | Delegates to `stock.service.getStockValuation` — one valuation figure exists in this codebase |
| `GET /reports/low-stock?search=&page=&pageSize=` | **any signed-in user** | The one exception. Selects no cost columns for either role |
| `GET /reports/outstanding` | ADMIN | Reads `customers.outstanding`, the balance kept in step in-transaction |
| `GET /reports/ageing` | ADMIN | 0–30 / 31–60 / 60+ from `bills.dueAmount` by bill age in IST days |
| `GET /reports/product-sales?from=&to=` | ADMIN | Quantity, value, discount and weighted average rate per product |
| `GET /reports/category-sales?from=&to=` | ADMIN | Value and share of period per category |
| `GET /reports/payment-collection?from=&to=` | ADMIN | Two sections — see below |
| `GET /reports/profit-margin?from=&to=` | **ADMIN** | Revenue less cost, overall and per product, plus loss-makers |

**Ageing** reports an `unbucketed` figure: an opening balance is not tied to a bill and therefore cannot be aged, so it is stated separately rather than quietly folded into the 60+ column. `buckets.total + unbucketed === totalOutstanding`.

**Payment collection** returns `billCollection` (money taken on the bill at the counter, grouped by `bills.paymentMode`) and `receipts` (standalone khata receipts from `payments`). The payments module is not built yet, so `receipts` is empty on a current database — the query is in place so the report starts working the moment receipts exist.

**Profit** uses `taxableValue` as revenue, not `grandTotal`: GST collected is a liability owed to the government, and counting it as income would overstate every margin by the tax rate. Cost is `costPriceSnapshot` taken at the moment of sale, so a later price change never rewrites a past margin.

### Exports

Every report accepts `&format=pdf` or `&format=excel`; `json` is the default.

Both formats are rendered from the *same already-computed object* the JSON caller receives, via a shared `ReportDocument` description — so a column added to a report appears in both, and a figure cannot drift between the screen and the file. PDFs are drawn with **pdfkit** (ARM64-safe; no headless Chromium on the shop's server) and workbooks with **exceljs**.

Files are **streamed** with `Content-Disposition: attachment` rather than written to disk: there is no generated-file directory to grow unbounded, and a report is cheap enough to rebuild that caching buys nothing. Filenames look like `sattadhar-gst-summary_2026-08-01_2026-08-31.xlsx`.

Each export carries the shop header (name, address, phone, GSTIN) and the date range, in the app's brand teal. In Excel, money and quantities are written as **real numbers** with an Indian number format (`#,##,##0.00`) plus autofilter and a frozen header — a spreadsheet that cannot sum its own column is worth nothing. Every export writes an `AuditAction.EXPORT` row.

---

## RBAC

Enforced by middleware on the server. UI hiding is cosmetic and is never the control.

| Guard | Effect |
|---|---|
| `publicRoute()` | Open — login, refresh, health |
| `authenticated()` | Any live session |
| `requireRole(Role.ADMIN)` | Owner only — cost price, margins, revenue, reports, staff management |
| `requirePermission('stock.in', …)` | Granular toggle from `users.permissions`; ADMIN passes implicitly |

**Default-deny.** Every route under `/api/v1` must run exactly one guard. A route that responds without having run one is intercepted by the RBAC sentinel, which returns `403` and logs an error. Forgetting a guard on a future endpoint therefore fails loudly instead of leaking data. ([rbac.ts:19](../backend/src/middleware/rbac.ts#L19))

**Ownership.** `canAccessOwnedBy(req, ownerId)` / `assertCanAccessOwnedBy` back the "STAFF sees own bills only" rule for the modules that follow.

### Granular permissions

Stored on `users.permissions` (jsonb). Unknown or non-boolean values read as **false**.

`stock.in` · `stock.adjust` · `product.create` · `product.update` · `customer.create` · `customer.update` · `bill.cancel` · `payment.record` · `ledger.view`

---

## Audit log

`writeAudit()` appends to `audit_logs`: `userId`, `action`, `entity`, `entityId`, `before`, `after`, `ip`, `userAgent`, `createdAt`.

```ts
await writeAudit({
  userId: actor.id,
  action: AuditAction.UPDATE,
  entity: 'Product',
  entityId: product.id,
  before, after,
  req,          // supplies ip + userAgent
  tx,           // optional — commits with your transaction
});
```

Password, token and secret keys are redacted at any depth before writing. Decimals and Dates are stringified so the JSON stays faithful. The helper never throws: a failed audit write is logged loudly but will not turn a completed sale into a 500 for the person at the counter.

Actions recorded so far: `LOGIN`, `LOGIN_FAILED` (unknown username, bad password, inactive, locked), `LOGOUT`, `PASSWORD_RESET`, `CREATE` (Bill, StockMovement), `EXPORT` (Report — the slug is the `entityId`, the format and range are in `after`).
