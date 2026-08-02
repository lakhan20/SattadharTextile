-- Khata (credit ledger) module.
--
-- Nothing here is destructive: the ledger table, payments, allocations and
-- credit/debit notes all shipped in the init migration and already carry rows
-- written by billing. This migration only renames one enum value, adds two
-- nullable columns, and introduces a counter table for receipt/note numbers.

-- ── 1. The ledger's sale row is always a *credit* sale ────────────────────
-- A cash bill never reaches the ledger, so "SALE" was ambiguous about the one
-- thing the row records. Renaming the value keeps every existing row valid.
ALTER TYPE "LedgerEntryType" RENAME VALUE 'SALE' TO 'CREDIT_SALE';

-- ── 2. Make a ledger row self-describing ──────────────────────────────────
-- A statement line needs to say "Payment · UPI · by Rekha" without joining
-- through `payments` and `users` for every row on the page.
ALTER TABLE "ledger_entries" ADD COLUMN "paymentMode" "PaymentMode";
ALTER TABLE "ledger_entries" ADD COLUMN "createdById" TEXT;

-- SET NULL, not RESTRICT: removing a staff account must never require
-- rewriting the shop's books.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The statement is ordered by createdAt (the true posting order), while the
-- existing entryDate index serves date-range queries.
CREATE INDEX "ledger_entries_customerId_createdAt_idx" ON "ledger_entries"("customerId", "createdAt");

-- ── 3. Counters for receipts and credit/debit notes ───────────────────────
CREATE TABLE "doc_series" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doc_series_kind_fy_key" ON "doc_series"("kind", "fy");
