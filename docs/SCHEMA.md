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
- `failedLoginAttempts` + `lockedUntil` — 5-attempt lockout.
- Soft-deleted, never hard-deleted (bills reference the creator).

**`refresh_tokens`** — one row per issued refresh token, keyed by `jti`. Logout revokes one row; deactivating a staff member revokes all their rows, killing every live session immediately.

## 2. Masters

**`categories`** → **`sub_categories`** → **`products`**. Sub-category is optional on a product; category is required. Both use `Restrict` so a category in use cannot vanish.

**`products`** carries the fabric attributes (`colour`, `width`, `gsm`, `hsnCode`), three prices, and stock:
- `retailRate` / `wholesaleRate` — picked automatically from `customer.type`.
- **`costPrice` is ADMIN-ONLY.** It is stripped in the serializer layer for STAFF and never appears in any STAFF-reachable response, report, or the last-price lookup.
- `currentStock` is maintained inside the same transaction as every `stock_movements` row.

**`customers`** — `state` is the field that decides CGST+SGST vs IGST. `type` (RETAIL/WHOLESALE) picks the default rate. `outstanding` mirrors the ledger.

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

Split tax columns (`cgstAmount` / `sgstAmount` / `igstAmount`) rather than a single tax field, because the GST summary report needs them separated. `costTotal` is the ADMIN-only margin input. `pdfPathEn` / `pdfPathGu` let the same bill exist as both an English and a Gujarati PDF. `customerId` is nullable to allow walk-in retail (`walkInName` / `walkInPhone`); credit sales require a real customer.

**`bill_items`** — `qty` is `Decimal(14,3)`; the service enforces whole numbers when `unit = PIECE` and allows decimals for `METER`. Index `[productId, createdAt]` serves both product-wise sales and the last-price lookup.

**Last-price lookup** needs no table: `bill_items` join `bills` filtered by `customerId` + `productId`, newest first. It returns `rate` only — never `costPriceSnapshot`.

**`bill_dispatches`** — audit trail for WhatsApp / Email / SMS sends, including which language PDF went out.

## 5. Stock

**`stock_movements`** is append-only with a signed `qty` and a `balanceAfter` snapshot, so any product's history replays exactly. Every bill (GST *and* estimate) writes a `SALE` row in the same transaction that creates the bill; cancelling writes a compensating `BILL_CANCELLED` row rather than deleting anything. Valuation = `currentStock × costPrice` (ADMIN) or `× wholesaleRate` (fallback).

## 6. Khata (credit/debit ledger)

**`ledger_entries`** — append-only, debit raises outstanding, credit lowers it, `balanceAfter` snapshots the running total. Every credit sale, payment, and note writes one row.

**`payments`** + **`payment_allocations`** — a single receipt splits across bills (FIFO by default). This is what makes **ageing exact**: each bill's unpaid remainder is bucketed 0-30 / 31-60 / 60+ by its own `billDate`, not by a lump customer balance.

**`credit_debit_notes`** — returns and adjustments, optionally tied to a bill, each writing a ledger entry.

**Credit-limit enforcement** compares `customer.outstanding + newBillDue` against `customer.creditLimit` before the bill commits.

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
      └─< AuditLog

Category ─< SubCategory ─< Product ─┬─< BillItem >─ Bill
                                    └─< StockMovement

Customer ─┬─< Bill ─┬─< BillItem
          │         ├─< PaymentAllocation >─ Payment
          │         └─< BillDispatch
          ├─< LedgerEntry
          └─< CreditDebitNote

NumberSeries  (fy × billingMode → next sequence)
ShopSetting   (singleton)
DiscountRule  (scope → Category | Product | Customer)
```
