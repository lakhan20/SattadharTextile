# Sattadhar Textile — Data Model

PostgreSQL 16 · Prisma. Source of truth: [schema.prisma](../backend/prisma/schema.prisma).

## Design rules applied throughout

| Rule | Why |
|---|---|
| Money `Decimal(14,2)`, quantity `Decimal(14,3)`, percent `Decimal(5,2)` | Fabric sells in fractional metres; floats would drift on GST rounding. |
| Soft delete (`deletedAt`) on masters | A product on a two-year-old invoice must still resolve. Uniques are `(name, deletedAt)` so a name frees up after deletion. |
| Snapshot columns on `bill_items` | Reprinting a 2024 invoice must show the 2024 name/HSN/rate, not today's master. |
| Append-only ledgers (`stock_movements`, `ledger_entries`) | Stock and khata balances are auditable and replayable; `currentStock` / `outstanding` are in-transaction caches. |
| `Restrict` on delete for referenced masters | You cannot delete a customer or product that a bill points at. |

---

## 1. Identity & auth

**`users`** — one table for ADMIN and STAFF, split by `role`.
- `maxDiscountPercent` — the per-staff discount ceiling. Billing rejects any bill whose effective discount exceeds it (403, server-side).
- `permissions` (JSON) — granular toggles that only ever *narrow* what the role allows.
- `menuAccess` (JSON array) — which **screens** this account sees, e.g. `["DASHBOARD","BILLING","CUSTOMERS"]`. Visibility only; see the two-layer note below. Empty for an ADMIN, whose menu is derived from the role.
- `failedLoginAttempts` + `lockedUntil` — 5-attempt lockout.
- Soft-deleted, never hard-deleted (bills reference the creator).

**`refresh_tokens`** — one row per issued refresh token, keyed by `jti`. Logout revokes one row; deactivating a staff member revokes all their rows, killing every live session immediately.

### `menuAccess` vs `permissions` — two layers, both enforced

They answer different questions and compose by AND. Neither implies the other.

| | `menuAccess` | `permissions` |
|---|---|---|
| Question | Can they **get to** the screen? | Can they **do** the thing on it? |
| Nature | UI convenience | Real authorisation |
| Checked where | The app, when building navigation | The server, on every request |
| Failure looks like | The tab is not there | `403 FORBIDDEN` |

`BILLING` in `menuAccess` puts the Billing tab on screen; it does not let that account cancel a bill — that is `bill.cancel`. Conversely `payment.record` lets someone take money on the khata; without `KHATA` they have no screen to do it from, though the endpoint would still accept the call.

**A menu can only ever hide, never grant.** Three independent things make that true, and any one of them would be enough:

1. The assignable set (`STAFF_ELIGIBLE_MENUS` in [`config/menus.ts`](../backend/src/config/menus.ts)) contains no owner-only key — Reports, shop-wide outstanding and staff management are in a separate list the form never renders.
2. `POST`/`PATCH /admin/staff` validate against that set and reject anything outside it, so an owner-only key is refused even when sent by hand with curl.
3. Every owner-only endpoint is gated by `requireRole(ADMIN)` regardless. Turning a menu key on grants nothing; turning one off protects nothing.

`effectiveMenu()` is the only thing that reads the column for a decision: ADMIN gets the full set unconditionally, STAFF get their assignment intersected with the eligible set, and a STAFF row with an empty column falls back to the default (`DASHBOARD`, `BILLING`, `CUSTOMERS`) rather than to a blank app.

## 2. Masters

**`categories`** → **`sub_categories`** → **`products`**. Sub-category is optional on a product; category is required. Both use `Restrict` so a category in use cannot vanish.

**`products`** carries the fabric attributes (`colour`, `width`, `gsm`, `hsnCode`), three prices, and stock:
- `retailRate` / `wholesaleRate` — picked automatically from `customer.type`.
- **`costPrice` is ADMIN-ONLY.** It is stripped in the serializer layer for STAFF and never appears in any STAFF-reachable response, report, or the last-price lookup.
- `currentStock` is maintained inside the same transaction as every `stock_movements` row.

**`customers`** — `state` is the field that decides CGST+SGST vs IGST. `type` (RETAIL/WHOLESALE) picks the default rate. `outstanding` mirrors the ledger.

`phone` is the shop's identity for a person and is stored canonically as `+91XXXXXXXXXX` (migration `20260802071500_canonical_customer_phone`), so a walk-in typed as `9998887771` and a master record reading `+919998887771` are recognised as one customer rather than becoming two. **The unique index does not enforce this**: `@@unique([phone, deletedAt])` never binds for live rows, because Postgres treats the NULL `deletedAt` that every active customer carries as distinct — verified by inserting a duplicate against the dev database. Uniqueness lives in `customers.service.ts`, in an `INSERT … WHERE NOT EXISTS` whose WHERE clause is the atomicity boundary. The PG-15+ index that would close it is written out in that migration's closing comment; it is left unapplied because Prisma 5 cannot express `NULLS NOT DISTINCT` and would generate a migration dropping it.

## 3. Discount engine

**`discount_rules`** — `type` (PERCENT/FLAT) × `scope` (LINE/BILL/CATEGORY/CUSTOMER), with `minQty` / `minAmount` / `customerType` conditions and a target FK matching the scope. `priority` breaks ties. Separately, `users.maxDiscountPercent` is the hard cap the engine cannot exceed.

## 4. Billing

**`number_series`** — `@@unique([fy, billingMode])` gives exactly two counters per financial year, incremented under a row lock inside the bill transaction:

```
FY26 + GST     → prefix "T" → FY26/T/00001
FY26 + NON_GST → prefix "E" → FY26/E/00001
```

They never share numbers and both reset on 1 April.

**`bills`** — `billingMode` is chosen at bill start and drives everything downstream:

| | `GST` (Tax Invoice) | `NON_GST` (Estimate) |
|---|---|---|
| `taxType` | `CGST_SGST` if customer state = Gujarat, else `IGST` | `NONE` |
| PDF | GSTIN + HSN + tax breakup + total in words | qty × rate only |
| Series | `FY26/T/…` | `FY26/E/…` |

Split tax columns (`cgstAmount` / `sgstAmount` / `igstAmount`) rather than a single tax field, because the GST summary report needs them separated. `costTotal` is the ADMIN-only margin input. **There is no PDF column:** invoices are rendered on demand from the bill and its lines and streamed straight to the caller, so the server stores no invoice files, and a revised bill has no stale copy to invalidate. `customerId` is nullable to allow walk-in retail (`walkInName` / `walkInPhone`); a credit sale needs a phone number, and the customer it implies is created inside the bill transaction.

`revisionCount` / `lastRevisedAt` are denormalised onto the bill so a list can flag an edited bill without joining, and so a viewer sees that the document was rewritten without being able to miss it.

**`bill_revisions`** — one row per edit, `@@unique([billId, revision])`. `before` / `after` hold complete JSON snapshots of the bill and its lines; `changes` holds the readable summary computed at write time (`{ field, before, after }[]`), because an owner scanning the log should not have to diff two blobs to see that a quantity went from 12 to 2. `amountDelta` is signed. `reason` is `NOT NULL` and validated to at least 3 characters — an unexplained edit reads as tampering, so the schema refuses to store one.

Editing does **not** rewrite history anywhere else: stock differences append as `SALE` / `SALE_RETURN` movements and the change in what is owed appends as a new ledger entry, so `balanceAfter` on every earlier row of both ledgers stays true. Only the `bills` row itself is mutated, and only after its previous state is copied here.

**`bill_items`** — `qty` is `Decimal(14,3)`; the service enforces whole numbers when `unit = PIECE` and allows decimals for `METER`. Index `[productId, createdAt]` serves both product-wise sales and the last-price lookup.

**Last-price lookup** needs no table: `bill_items` join `bills` filtered by `customerId` + `productId`, newest first. It returns `rate` only — never `costPriceSnapshot`.

**`bill_dispatches`** — audit trail for WhatsApp / Email / SMS sends, including which language PDF went out.

## 5. Stock

**`stock_movements`** is append-only with a signed `qty` and a `balanceAfter` snapshot, so any product's history replays exactly. Every bill (GST *and* estimate) writes a `SALE` row in the same transaction that creates the bill; cancelling writes a compensating `BILL_CANCELLED` row rather than deleting anything. Valuation = `currentStock × costPrice` (ADMIN) or `× wholesaleRate` (fallback).

## 6. Khata (credit/debit ledger)

**`ledger_entries`** — append-only, debit raises outstanding, credit lowers it, `balanceAfter` snapshots the running total. Every credit sale, payment, and note writes one row. `type` is `OPENING | CREDIT_SALE | PAYMENT | CREDIT_NOTE | DEBIT_NOTE`, and **direction is a property of the type, never the sign of a stored number** — exactly one of `debit`/`credit` carries the amount, so a row cannot contradict itself. `paymentMode` and `createdById` make a statement line readable without joining through `payments` and `users`.

**One writer.** `ledger.posting.postLedgerEntry()` is the only code permitted to move `customers.outstanding` or append to `ledger_entries` — billing calls it too. It shifts the balance with `UPDATE customers SET outstanding = outstanding + Δ … RETURNING outstanding` and writes `balanceAfter` from what came back, so the row records the value Postgres committed rather than one computed from a read that may already be stale. Same discipline as `stock_movements`, same reason.

**`payments`** + **`payment_allocations`** — a single receipt splits across bills (FIFO by default, or the named `refBillId` first). This is what makes **ageing exact**: each bill's unpaid remainder is bucketed 0-30 / 31-60 / 60+ by its own `billDate`, not by a lump customer balance. The allocation also drives each bill's `dueAmount` and `paymentStatus` down, which is not optional — without it a settled sale would sit in the 60+ bucket for ever.

**`credit_debit_notes`** — returns and adjustments, optionally tied to a bill, each writing a ledger entry. A `CREDIT` note naming a bill also reduces that bill's `dueAmount`; one with no bill behind it cannot be aged and surfaces as the ageing report's `unbucketed` figure.

**`doc_series`** — `@@unique([kind, fy])`, one counter per document kind per financial year (`RCPT`, `CN`, `DN`), claimed by the same `INSERT … ON CONFLICT DO UPDATE` that `number_series` uses. Bills keep their own table because their counter is per billing mode, which nothing else needs.

**Credit-limit enforcement** compares `customer.outstanding + newBillDue` against `customer.creditLimit`, twice: once before any stock moves so the counter is refused immediately, and once inside the transaction against the committed balance, so two concurrent credit sales cannot both slip past. A limit of `0` means *no limit set*, not *no credit allowed*.

## 7. Config & security

**`shop_settings`** — singleton (`id = "shop"`). Holds the shop's own GSTIN, state (**Gujarat** — the intra/inter-state comparison baseline), bank/UPI details and bilingual invoice terms.

**`audit_logs`** — `userId`, `action`, `entity`, `entityId`, `before`/`after` JSON, IP, user-agent, timestamp. Written by middleware on every mutation.

---

## Entity map

```
User ─┬─< RefreshToken
      ├─< Bill (createdBy)          ← STAFF "own bills only" filter
      ├─< StockMovement
      ├─< Payment
      ├─< LedgerEntry (createdBy)
      └─< AuditLog

Category ─< SubCategory ─< Product ─┬─< BillItem >─ Bill
                                    └─< StockMovement

Customer ─┬─< Bill ─┬─< BillItem
          │         ├─< PaymentAllocation >─ Payment
          │         └─< BillDispatch
          ├─< LedgerEntry
          └─< CreditDebitNote

NumberSeries  (fy × billingMode → next bill sequence)
DocSeries     (fy × kind → next receipt / note sequence)
ShopSetting   (singleton)
DiscountRule  (scope → Category | Product | Customer)
```
