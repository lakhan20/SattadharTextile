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
| `CREDIT_LIMIT_EXCEEDED` | 409 | A credit sale would push the customer past `customers.creditLimit` |
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

## Customers

**One customer per phone number.** The number is the shop's identity for a person, so it is canonicalised to `+91XXXXXXXXXX` on write and every lookup goes through the same form. Without that, the same regular is `9998887771` on a walk-in bill and `+919998887771` in the master, and the shop grows a second record for them.

Canonicalisation deliberately refuses one guess: `0` + ten digits starting 6–9 is left alone, because `079-26578899` (an Ahmedabad landline) and `09998887771` (a mobile with a trunk zero) are the same shape and nothing distinguishes them. Rewriting would turn the shop's local landlines into strangers' mobile numbers. `phoneLookupCandidates()` tries the mobile reading at *lookup* time, where a wrong guess costs a miss instead of a wrong number.

> **The database does not enforce this.** `@@unique([phone, deletedAt])` does not bind for live rows — Postgres treats the NULL `deletedAt` on every active customer as distinct, so duplicates insert happily. Verified against the dev database. Uniqueness is enforced in `customers.service.ts` by an `INSERT … WHERE NOT EXISTS`, atomic in the same way the stock and billing guards are. See the note at the end of `20260802071500_canonical_customer_phone`.

### `POST /customers` · permission `customer.create` (ADMIN implicitly)

```json
{ "name": "Test Kirana Stores", "phone": "98201 01690", "type": "RETAIL",
  "city": "Ahmedabad", "state": "Gujarat", "creditLimit": 25000, "openingBalance": 12500 }
```

`phone` is accepted however it is typed. `state` defaults to Gujarat and decides CGST+SGST vs IGST on every future bill. `creditLimit` of `0` means *no limit set*. A non-zero `openingBalance` is posted as an `OPENING` khata entry rather than written onto `outstanding`, so the ledger is complete from its first line.

**201** — the customer, plus `"created": true`.
**409 CONFLICT** when the number is taken, naming who holds it: *"Test Kirana Stores is already registered on +919820101690. Open their record instead."* The name is in the message because "already exists" alone is not actionable at a counter.

### `GET /customers/by-phone?phone=` · any signed-in user

Answers "is this number on file?" before a form is filled in. Returns the customer, or **`{ "data": null }` with a 200** — nobody holding the number is a successful answer, not a missing page.

### Walk-in registration

A walk-in bill carrying `walkInPhone` no longer vanishes from the customer list. `POST /bills` will:

1. **Match** the number against live customers *before* rates are calculated — a wholesale regular who gives their number at the counter is billed at wholesale rates, and an out-of-state customer gets IGST. Resolving after the calculation would quietly charge the wrong price.
2. **Register** an unrecognised number, inside the bill transaction, as `RETAIL` / Gujarat / no credit limit — identical to the assumptions an anonymous walk-in already got, so no figure changes. A bill that rolls back leaves no customer behind.
3. **Leave a walk-in with no phone anonymous.** There is nothing to identify, and inventing a record for a passer-by helps nobody.

`walkInName` / `walkInPhone` stay on the bill even once a customer is attached, so the sale still records that it began at the counter and exactly what was typed.

The create response carries the outcome:

```json
{ "walkInCustomer": { "customerId": "uuid", "name": "Raghav", "outcome": "registered" } }
```

`outcome` is `registered` or `matched`; the key is absent for anonymous sales and for deliberately picked customers.

**Credit needs a phone number, not a pre-existing record.** `paymentMode: "CREDIT"` is refused only when there is nobody to chase — no `customerId` and no `walkInPhone`. A number is enough: the customer is registered inside the bill transaction and the khata entry lands on that new record, so selling on credit no longer means leaving the billing screen to create a customer first.

The trade-off is deliberate and worth stating. A freshly registered walk-in has `creditLimit` 0, which means *no limit set*, so the limit check does not constrain that first sale — the shop is trusting a phone number. A **recognised** customer reached through the walk-in field keeps their real limit. The shop asked for this after finding the safer rule unusable at the counter; the exposure is bounded by whatever the shopkeeper hands over before the number is verified.

`scripts/backfill-walkin-customers.ts` registers walk-ins already stranded in the data (dry run by default; `--apply` to write).

---

## Billing — listing bills

### `GET /bills?dateFrom=&dateTo=&customerId=&billingMode=&page=&pageSize=` · any signed-in user

`dateFrom` / `dateTo` are IST **calendar dates** (`YYYY-MM-DD`) with `dateTo` **inclusive**, resolved through the same `resolveRange()` the reports use. Comparing the raw values would put the upper bound at midnight UTC, so asking for "today" would drop every bill written after 05:30 IST — which is all of them.

Omitting both returns the full history; `range` comes back `null`.

```json
{ "items": [ … ],
  "pagination": { "page": 1, "pageSize": 20, "total": 16, "totalPages": 1 },
  "summary": { "billCount": 16, "grandTotal": 34682, "paidTotal": 30457, "dueTotal": 4225 },
  "range": { "from": "2026-08-02", "to": "2026-08-02" } }
```

`summary` covers the **whole filter, not the page** — a footer that only added up the visible twenty would be quietly wrong on a busy day — and counts `FINAL` bills only, since a cancelled bill is not a sale. It is scoped by exactly the same `where` as `items`, so a STAFF caller gets their own figures and never the shop's.

**STAFF see their own bills only**, here as everywhere. That applies to `customerId` too: a staff member opening a customer's purchase history sees the bills *they* wrote for that customer, not the shop's. The mobile screen says so rather than letting a short list read as "they have barely bought from us". Loosening it would be a deliberate policy change, not a bug fix.

---

## Billing — revising an issued bill

A bill written at a busy counter gets things wrong: a quantity, a rate, a line that should not be there. The shop asked to fix those in place rather than cancel and re-key, and to be able to see afterwards who had been doing it.

**Nothing is rewritten except the bill row itself.**

- **Stock** is not recalculated. The difference posts as new movements — a `SALE` for extra quantity going out, a `SALE_RETURN` for quantity coming back — through the same conditional `UPDATE` that guards oversell, so a revision cannot take a product negative.
- **The khata** is not recalculated. The change in what is owed posts as a *new* ledger entry against the same bill, so `balanceAfter` on every earlier line stays true and the statement still reconciles.
- **The bill row** updates in place — a shopkeeper expects `FY27/T/00007` to stay `FY27/T/00007` — but the whole previous state is copied into `bill_revisions` first, with a required reason.

> **On GST:** revising an issued tax invoice is not how GST expects corrections to be made; a credit note against the original is. This exists because the shop asked for it and it is honest about itself — every version is retained and attributable — but for a filed period a credit note is the safer instrument. The mobile edit screen says so on any GST bill.

### `PATCH /bills/:id` · permission `bill.edit` (ADMIN implicitly)

```json
{ "reason": "Customer took 2 metres less",
  "paymentMode": "CREDIT", "paidAmount": 100,
  "items": [{ "productId": "uuid", "qty": 3, "rate": 200 }] }
```

`items` is the complete new line list, not a patch. `reason` is required (min 3 characters). Omitting `paidAmount` keeps whatever has already been received.

**Not editable, and why:** `billNumber` / `billDate` (the document's identity — changing either makes the invoice series meaningless), `billingMode` (GST and non-GST draw from separate number series, so a switch is a different document), `customerId` (moving an issued bill onto a different person is two corrections: cancel this one, write another).

`bill.edit` is **off by default for STAFF.** Rewriting a bill after it has been handed over is the easiest way to cover a mistake or a theft, so an owner switches it on deliberately. Ownership applies on top: a staff member holding the toggle may still only revise bills they wrote.

**400** if the bill is `CANCELLED`, if it is not `FINAL`, if no lines remain, or if the new total falls below what has already been received — *"Rs 100.00 has already been received against this bill, so it cannot be revised below that. Raise a credit note for the difference instead."*
**409 `CREDIT_LIMIT_EXCEEDED`** if the revision pushes the customer past their limit; ADMIN may pass `overrideCreditLimit: true`.

Every bill response carries `revisionCount` and `lastRevisedAt` — to **every** viewer, not just an owner. A customer holding a printed copy that no longer matches the screen is the whole reason this needed a paper trail.

### `GET /bills/:id/revisions?page=&pageSize=` · any signed-in user

One bill's history, open to whoever may already open the bill. A STAFF caller is scoped to their own edits.

```json
{ "id": "uuid", "billNumber": "FY27/E/00010", "revision": 1,
  "reason": "Customer took 2 metres less",
  "changes": [
    { "field": "Total", "before": "1000.00", "after": "600.00" },
    { "field": "Due", "before": "900.00", "after": "500.00" },
    { "field": "Cotton Suiting — Navy", "before": "5 × 200.00", "after": "3 × 200.00" }
  ],
  "amountDelta": -400, "changedByName": "Kirti Patel", "createdAt": "…" }
```

`changes` is computed at write time rather than diffed later, so an owner can read what moved without opening two JSON blobs. The full `before` / `after` snapshots are on the row for anyone who needs them.

### `GET /bills/revisions?changedById=&from=&to=&page=&pageSize=` · **ADMIN only**

The shop-wide edit log. Deliberately a role gate and not a permission toggle: *"which staff member has been rewriting bills, and why"* is a supervision question, and a supervision report the supervised can read is not one. Declared before `/:id` in the router so `revisions` is not matched as a bill id.

### `GET /bills/:id/pdf?lang=en` · any signed-in user (STAFF: own bills only)

Streams the invoice as `application/pdf` with `Content-Disposition: attachment; filename="FY27-T-00007.pdf"` — the `/` in a bill number is not legal in a filename.

**The PDF is rendered fresh on every request and never written to disk.** A shop doing a few hundred bills a month would otherwise accumulate a directory that only ever grows, backups included, for files that are cheap to redraw from the bill row. It also removes a whole class of staleness: a revised bill, or a shop that has just corrected its GSTIN, prints correctly the next time it is opened, with no cached copy to invalidate. Same reasoning, same mechanism as the report exports.

`lang=gu` is accepted by the schema but currently **400**s — the Gujarati copy in [invoice.pdf.ts](../backend/src/pdf/invoice.pdf.ts) is not written yet; every label falls back to English.

### `POST /bills/:id/send` · permission `bill.send`

Builds a `wa.me` click-to-chat URL with the bill summary and a link to the PDF endpoint above, and queues a `bill_dispatches` row. Like the khata reminder, **it does not send anything** — the shopkeeper reviews the message and presses send. **200** — `{ "data": { "whatsappUrl", "message" } }`. **400** if there is no phone on file and none is passed in the body.

> The PDF link points at an authenticated endpoint, so a customer tapping it hits the login wall. It is useful as the shop's own reference today; a public signed share link is the enhancement that makes it customer-facing.

---

## Khata — the credit ledger

`customers.outstanding` is the balance and `ledger_entries` is the book that explains it, on exactly the model stock uses. **`postLedgerEntry()` is the only thing in the codebase permitted to move either** — billing included. It shifts the balance with an `UPDATE … RETURNING` and writes `balanceAfter` from what Postgres committed, so a row can never record a balance that was already stale when it was read. Every rupee of outstanding is traceable to an entry; there is no reconciliation job because drift is not reachable. ([ledger.posting.ts](../backend/src/modules/ledger/ledger.posting.ts))

**Direction is a property of the type, never the sign of an input.** Callers always pass a positive `amount`:

| Type | Effect on outstanding | Written by |
|---|---|---|
| `OPENING` | ↑ raises | seed / migration of a pre-app balance |
| `CREDIT_SALE` | ↑ raises | `bills.service` — inside the bill transaction |
| `DEBIT_NOTE` | ↑ raises | `POST /ledger/note` |
| `PAYMENT` | ↓ lowers | `POST /ledger/payment` |
| `CREDIT_NOTE` | ↓ lowers | `POST /ledger/note` |

The API sends both `amount` + `direction` (what a statement row renders) and the raw `debit`/`credit` columns (so a response can be audited against the table without a second request).

**A payment allocates across bills, not just against the balance.** `/ledger/ageing` buckets by bill date using `bills.dueAmount`, because that is the only column that says *which* sale is still owed. So a receipt is applied oldest-first to the customer's unpaid `FINAL` bills, writing `payment_allocations` rows and updating each bill's `dueAmount` / `paymentStatus`. Without that, a settled sale would sit in the 60+ bucket for ever. Naming `refBillId` puts that bill at the front of the queue; the remainder still flows onward.

### `POST /ledger/payment` · permission `payment.record` (ADMIN implicitly)

```json
{ "customerId": "uuid", "amount": 3990, "paymentMode": "UPI", "note": "Part payment", "refBillId": "uuid" }
```

`paymentMode` is narrower than the `PaymentMode` enum — only `CASH` / `UPI` / `BANK`. `CHEQUE` and `CARD` are not settled at the moment they change hands, and `CREDIT` is the absence of a payment.

**201** — `{ "data": { "paymentId", "receiptNumber": "RCPT/FY27/00001", "amount", "paymentMode", "previousBalance", "balanceAfter", "allocations": [ { "billId", "billNumber", "billDate", "amount", "dueAfter" } ], "unallocated", "entry": { … } } }`

`unallocated` is money received beyond every open bill — an advance, or a payment against an opening balance that predates the app. A balance may go negative; that means the shop is holding the customer's money.

### `POST /ledger/note` · **ADMIN only**

```json
{ "customerId": "uuid", "type": "CREDIT", "amount": 250, "reason": "Returned cloth — water stain", "refBillId": "uuid" }
```

`reason` is **required** and not defaulted: a note is the only entry that moves a balance with no bill and no receipt behind it. `DEBIT` charges more, `CREDIT` forgives. A `CREDIT` note naming a bill also reduces that bill's `dueAmount`, so ageing stops chasing money the shop has written off; one with no bill behind it cannot be aged and surfaces in the ageing report's `unbucketed` figure.

ADMIN-only for the same reason reports are: writing off a balance is the owner's decision, not the counter's. Deliberately **not** a permission toggle.

**201** — `{ "data": { "noteId", "noteNumber": "CN/FY27/00001", "type", "amount", "reason", "previousBalance", "balanceAfter", "billDueAfter", "entry": { … } } }`

### `GET /ledger/customer/:customerId?page=&pageSize=&sort=asc|desc&from=&to=` · permission `ledger.view`

One customer's khata. **Open to STAFF** — this is the screen they stand at the counter with, and answering "how much do I owe?" is the job.

Ordered by posting time, not `entryDate`: two entries made on the same day must read back in the order they were written, or the running-balance column appears to jump backwards.

```json
{ "data": {
  "customer": { "id", "name", "phone", "type", "creditLimit", "outstanding", "availableCredit", "isActive" },
  "openingBalance": 12500,
  "totals": { "debit": 22500, "credit": 10000, "entryCount": 4 },
  "entries": [ { "id", "type", "direction", "amount", "debit", "credit", "balanceAfter", "note", "paymentMode",
                 "billId", "billNumber", "paymentId", "receiptNumber", "noteId", "noteNumber",
                 "entryDate", "createdAt", "createdById", "createdByName" } ],
  "pagination": { … }, "sort": "desc"
} }
```

`availableCredit` is `null` when no limit is set. `totals.debit − totals.credit` always equals `customer.outstanding` — that identity is the module's invariant.

### `GET /ledger/outstanding` · **ADMIN only**

The shop's debtor book: every customer with `outstanding > 0`, highest first, plus `totalOutstanding`, `customerCount` and `overLimitCount`. Same shape and same service call as `/reports/outstanding` — deliberately, so the two views cannot disagree.

### `GET /ledger/ageing` · **ADMIN only**

0–30 / 31–60 / 60+ buckets by IST calendar days from bill date, per customer and overall. Same shape and service as `/reports/ageing`. `unbucketed` is `totalOutstanding` minus the bucket total: opening balances and bill-less notes carry no date to age from, and are reported on their own line rather than quietly folded into 60+.

### `POST /ledger/reminder/:customerId` · permission `ledger.view`

Builds a polite payment reminder and a `wa.me` click-to-chat URL carrying the outstanding amount. **It does not send anything** — the shopkeeper opens WhatsApp with the message already typed and decides whether to press send. No Business API account involved. Refused with `400` when the customer owes nothing or has no phone on file.

**200** — `{ "data": { "customerId", "customerName", "phone", "outstanding", "message", "whatsappUrl" } }`

### Credit limit

`customers.creditLimit` of `0` means **no limit set**, not "no credit allowed" — that is how the column defaults, and treating 0 as a hard block would refuse every credit sale in a shop that has never filled the field in.

`POST /bills` with `paymentMode: "CREDIT"` checks it twice: once before any stock moves, so the counter is refused immediately, and once inside the transaction against the balance Postgres actually committed — a concurrent credit sale to the same customer cannot slip both past the first check. Failing the second rolls the entire bill back, stock included.

```json
{ "error": { "code": "CREDIT_LIMIT_EXCEEDED",
  "message": "Rohan Traders already owes Rs 0.00. This sale would take them to Rs 14175.00, which is Rs 9175.00 over their Rs 5000.00 limit." } }
```

The message carries all three figures because the person reading it is standing at the counter with the customer in front of them. An ADMIN may proceed anyway by sending `"overrideCreditLimit": true`; the flag is ignored for a STAFF token.

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

## Staff accounts & menu assignment

Every endpoint under `/admin/staff` is **ADMIN only** and returns `403 FORBIDDEN` for a staff token. `passwordHash` is absent from the select and from the response type, so it cannot escape through any of them.

**Menu assignment is visibility, not authority.** It decides which screens the app draws for an account; what the server *allows* is decided by role and `permissions`, on every request, whatever the menu says. See [SCHEMA.md](SCHEMA.md#menuaccess-vs-permissions--two-layers-both-enforced) for the full table.

Assignable menu keys — the complete set an owner may tick:

`DASHBOARD` · `BILLING` · `PRODUCTS` · `CUSTOMERS` · `STOCK` · `KHATA`

Never assignable, and rejected with `400 VALIDATION_ERROR` if sent:

`REPORTS` · `OUTSTANDING` · `STAFF`

New accounts default to `["DASHBOARD","BILLING","CUSTOMERS"]`.

### `GET /admin/staff?search=&role=&isActive=&page=&pageSize=` · **ADMIN only**

Paginated. Ordered owners first, then active before inactive, then by name. Each item carries `menuAccess` (what was assigned) and `effectiveMenu` (what that account will actually see).

### `GET /admin/staff/options` · **ADMIN only**

`{ assignableMenus, adminOnlyMenus, defaultMenus, permissions }` — served rather than hardcoded in the app, so the two cannot drift apart about which screens are assignable.

### `GET /admin/staff/:id` · **ADMIN only**

### `POST /admin/staff` · **ADMIN only**

```json
{
  "name": "Kirti Patel",
  "username": "kirti",
  "password": "Counter@2026",
  "role": "STAFF",
  "preferredLang": "GU",
  "maxDiscountPercent": 5,
  "permissions": { "payment.record": true, "ledger.view": true },
  "menuAccess": ["DASHBOARD", "BILLING", "CUSTOMERS", "KHATA"]
}
```

`201` with the account. `409 CONFLICT` when the username is taken. `menuAccess` is validated against the assignable set only; omit it for the default. `KHATA` without `CUSTOMERS` is refused — a khata is opened from a customer's record, so the pairing would otherwise save a setting that does nothing.

### `PATCH /admin/staff/:id` · **ADMIN only**

Any subset of `name`, `role`, `phone`, `email`, `preferredLang`, `maxDiscountPercent`, `permissions`, `menuAccess`. `username` and `password` are deliberately absent — a username is how the account reads in the audit trail, and a password change is its own endpoint because it ends every live session.

`permissions` is **merged**, not replaced, so a toggle added in a later release is not silently cleared by an older app. `menuAccess` is replaced wholesale and re-validated against the assignable set. Before and after are written to the audit log.

`409 CONFLICT` when demoting the last active ADMIN.

### `POST /admin/staff/:id/deactivate` · **ADMIN only**

Sets `isActive=false` **and revokes every live session**. Because `requireAuth` re-reads the `jti` row on every request, their next tap returns `401 TOKEN_REVOKED` — not "next time they sign in". Returns `{ staff, revokedSessions }`.

`403` when the target is the caller's own account. `409` when the target is the last active ADMIN. `400` when the account is already off.

### `POST /admin/staff/:id/activate` · **ADMIN only**

Sets `isActive=true` and clears any dormant lockout. Sessions are not restored — they sign in again.

### `POST /admin/staff/:id/reset-password` · **ADMIN only**

`{ "newPassword": "…" }` → `{ staff, revokedSessions }`. Delegates to the same service as `POST /auth/admin/reset-password`: same hashing, same session revocation, same `PASSWORD_RESET` audit row. The old password stops working immediately and so does every device they were signed in on.

### `POST /admin/staff/:id/unlock` · **ADMIN only**

Clears `failedLoginAttempts` and `lockedUntil` without touching the password — for the common case of someone mistyping their own password five times.

### `GET /me/menu` · any signed-in user

```json
{ "data": { "role": "STAFF", "menu": ["DASHBOARD", "BILLING", "CUSTOMERS"] } }
```

The signed-in account's **own** effective menu, used by the app to build its navigation. Open to any live session because it returns nothing about the shop and nothing about anyone else. ADMIN receives the full set including the owner-only keys.

This is what the mobile app calls at sign-in and at launch. It is defence in depth on top of the 403s, never a substitute for them.

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

`stock.in` · `stock.adjust` · `product.create` · `product.update` · `customer.create` · `customer.update` · `bill.cancel` · `bill.edit` · `payment.record` · `ledger.view`

### Menu assignment is not a permission

`users.menuAccess` decides which screens the **app draws**. It is never consulted when authorising an action, and it can only narrow within what the role already permits — see [Staff accounts & menu assignment](#staff-accounts--menu-assignment) above. A staff token calling `/reports/profit-margin` gets `403` whether or not anything was hidden from them, and an owner cannot assign an owner-only screen even by crafting the request themselves.

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

Actions recorded so far: `LOGIN`, `LOGIN_FAILED` (unknown username, bad password, inactive, locked), `LOGOUT`, `PASSWORD_RESET`, `CREATE` (Bill, StockMovement, Payment, CreditDebitNote, User), `UPDATE` (User — edits, activation, deactivation and unlocks), `EXPORT` (Report — the slug is the `entityId`, the format and range are in `after`).

Staff edits record the same shape on both sides — `username`, `name`, `role`, `isActive`, `language`, `maxDiscountPercent`, `permissions`, `menuAccess` — so a diff of `before` against `after` reads straight, and a deactivation additionally carries `revokedSessions` so the trail says how many people it threw out.

Khata mutations record the balance on both sides of the change — `previousBalance` and `balanceAfter` land in `after`, along with the allocations a receipt was split across — so the audit trail answers "what did this do to the books?" without joining back to `ledger_entries`.
